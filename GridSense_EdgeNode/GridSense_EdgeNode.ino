/*!
 * @file      GridSense_EdgeNode.ino
 * @brief     GridSense Edge Node Firmware with Dual PZEM-004T (V4.0 Split CT) & Mock Simulation Mode
 * @details   Polls two PZEM-004T AC energy monitors via HardwareSerial (Serial1 & Serial2),
 *            or generates realistic mock grid data for bench-testing without AC mains wiring.
 *            Calculates differential line current (|I_in - I_out|), evaluates fault conditions,
 *            and broadcasts telemetry/alerts via Waveshare ESP32-S3-LR1121-HF Sub-GHz LoRa.
 *
 * @project   GridSense - MCA Project, FISAT
 *
 * MOCK / SIMULATION MODE:
 * - Set USE_MOCK_SENSORS to true to test the entire pipeline (LoRa, Gateway, Serial, Dashboard).
 * - Send serial commands via Serial Monitor to inject faults on the fly:
 *     'n' : Normal load (Idiff ~ 0.02A -> OK)
 *     'd' : Differential fault (Incomer: 3.8A, Outgoing: 1.2A -> Idiff: 2.6A -> TRIP!)
 *     'o' : Overcurrent fault (18.5A load -> Overload trip!)
 *     'u' : Undervoltage sag (165V -> Brownout trip!)
 *     'a' : Auto-cycle mode (automatically cycles normal -> fault -> normal)
 *
 * HARDWARE CONNECTIONS (When USE_MOCK_SENSORS is set to false):
 * - PZEM 1 (Incomer Line) : ESP32 RX = GPIO 17  <-->  PZEM TX
 *                           ESP32 TX = GPIO 18  <-->  PZEM RX
 * - PZEM 2 (Outgoing Line): ESP32 RX = GPIO 8   <-->  PZEM TX
 *                           ESP32 TX = GPIO 9   <-->  PZEM RX
 * - Power: Connect PZEM 5V & GND to 5V & GND (PZEM optocouplers require 5V logic power).
 * - CT Clamps: Attach Split-CT1 to Incomer Phase, Split-CT2 to Outgoing Phase.
 *
 * ARDUINO IDE SETTINGS:
 * - Board: "ESP32S3 Dev Module"
 * - USB CDC On Boot: "Enabled"
 * - Flash Size: 4MB (32Mb)
 * - Flash Mode: QIO 80MHz
 * - PSRAM: QSPI PSRAM
 * - Partition Scheme: Default 4MB with spiffs
 */

#include "PZEM004T_Modbus.h"
#include "lr1121_tx.h"

/* =========================================================================
 * SENSOR MODE CONFIGURATION
 * Set to true for Mock / Simulation Mode (no AC wiring needed)
 * Set to false when connecting real PZEM-004T v4.0 hardware
 * ========================================================================= */
#define USE_MOCK_SENSORS            true

/* =========================================================================
 * NODE CONFIGURATION
 * ========================================================================= */
#define NODE_ID                     1       // Set to 1 for Node-01, 2 for Node-02
#define TELEMETRY_INTERVAL_MS       3000    // Normal telemetry broadcast interval (3s)
#define FAULT_CHECK_INTERVAL_MS     250     // Rapid sensor polling rate (250ms)

/* =========================================================================
 * FDIR THRESHOLDS (Differential Protection & Fault Detection)
 * ========================================================================= */
#define DIFF_CURRENT_THRESHOLD_A    0.35f   // Differential trip threshold (350 mA)
#define OVERCURRENT_THRESHOLD_A     16.00f  // Overcurrent threshold (16 Amperes)
#define UNDERVOLTAGE_THRESHOLD_V    180.0f  // Undervoltage threshold (180 Volts)
#define OVERVOLTAGE_THRESHOLD_V     265.0f  // Overvoltage threshold (265 Volts)

/* =========================================================================
 * PIN ASSIGNMENTS (HardwareSerial)
 * ========================================================================= */
#define PZEM1_RX_PIN                17      // Connects to PZEM 1 TX
#define PZEM1_TX_PIN                18      // Connects to PZEM 1 RX

#define PZEM2_RX_PIN                8       // Connects to PZEM 2 TX
#define PZEM2_TX_PIN                9       // Connects to PZEM 2 RX

// Dual HardwareSerial instances
PZEM004T_Modbus pzem1(Serial1, PZEM1_RX_PIN, PZEM1_TX_PIN);
PZEM004T_Modbus pzem2(Serial2, PZEM2_RX_PIN, PZEM2_TX_PIN);

// Sensor data storage
PZEMData sensor1;
PZEMData sensor2;

// Telemetry & State Tracking
uint32_t packet_seq = 0;
unsigned long last_telemetry_tx = 0;
unsigned long last_fault_check = 0;
bool previous_fault_state = false;

enum FaultType {
    FAULT_NONE = 0,
    FAULT_DIFFERENTIAL,
    FAULT_OVERCURRENT,
    FAULT_UNDERVOLTAGE,
    FAULT_OVERVOLTAGE,
    FAULT_SENSOR_OFFLINE
};

FaultType current_fault = FAULT_NONE;
float diff_current = 0.0f;

// Mock Simulation State
enum MockScenario {
    MOCK_NORMAL = 0,
    MOCK_DIFFERENTIAL_FAULT,
    MOCK_OVERCURRENT_FAULT,
    MOCK_UNDERVOLTAGE_FAULT,
    MOCK_AUTO_CYCLE
};

MockScenario mockScenario = MOCK_NORMAL;
uint32_t autoCycleCounter = 0;
float accumulatedEnergyWh = 1250.0f;

const char* faultTypeToString(FaultType f) {
    switch (f) {
        case FAULT_DIFFERENTIAL:   return "DIFF_LEAKAGE";
        case FAULT_OVERCURRENT:    return "OVERCURRENT";
        case FAULT_UNDERVOLTAGE:   return "UNDERVOLTAGE";
        case FAULT_OVERVOLTAGE:    return "OVERVOLTAGE";
        case FAULT_SENSOR_OFFLINE: return "SENSOR_OFFLINE";
        default:                   return "NORMAL";
    }
}

void generateMockSensorData() {
    float v_base = 230.0f + ((rand() % 20) - 10) * 0.1f; // 229.0V - 231.0V
    float freq   = 50.0f + ((rand() % 10) - 5) * 0.02f;   // 49.9Hz - 50.1Hz
    accumulatedEnergyWh += 0.5f;

    MockScenario activeScenario = mockScenario;

    // Handle Auto-Cycle mode (every 10 packets injects a fault, then recovers)
    if (mockScenario == MOCK_AUTO_CYCLE) {
        autoCycleCounter++;
        if (autoCycleCounter % 15 == 8 || autoCycleCounter % 15 == 9) {
            activeScenario = MOCK_DIFFERENTIAL_FAULT;
        } else if (autoCycleCounter % 15 == 13) {
            activeScenario = MOCK_OVERCURRENT_FAULT;
        } else {
            activeScenario = MOCK_NORMAL;
        }
    }

    switch (activeScenario) {
        case MOCK_DIFFERENTIAL_FAULT:
            // Simulating ground leakage / tapping: Incomer > Outgoing
            sensor1.voltage   = v_base - 3.2f;
            sensor1.current   = 3.850f + ((rand() % 10) * 0.01f);
            sensor1.power     = sensor1.voltage * sensor1.current * 0.95f;
            sensor1.frequency = freq;
            sensor1.pf        = 0.95f;
            sensor1.energy    = accumulatedEnergyWh;
            sensor1.alarm     = false;
            sensor1.isValid   = true;

            sensor2.voltage   = v_base - 4.5f;
            sensor2.current   = 1.150f + ((rand() % 10) * 0.01f); // Significant mismatch!
            sensor2.power     = sensor2.voltage * sensor2.current * 0.94f;
            sensor2.frequency = freq;
            sensor2.pf        = 0.94f;
            sensor2.energy    = accumulatedEnergyWh * 0.98f;
            sensor2.alarm     = false;
            sensor2.isValid   = true;
            break;

        case MOCK_OVERCURRENT_FAULT:
            // Simulating short-circuit / overload
            sensor1.voltage   = v_base - 8.0f;
            sensor1.current   = 18.650f + ((rand() % 20) * 0.05f); // > 16A limit!
            sensor1.power     = sensor1.voltage * sensor1.current * 0.97f;
            sensor1.frequency = freq - 0.3f;
            sensor1.pf        = 0.97f;
            sensor1.energy    = accumulatedEnergyWh;
            sensor1.alarm     = true;
            sensor1.isValid   = true;

            sensor2.voltage   = v_base - 8.5f;
            sensor2.current   = sensor1.current - 0.040f;
            sensor2.power     = sensor2.voltage * sensor2.current * 0.97f;
            sensor2.frequency = freq - 0.3f;
            sensor2.pf        = 0.97f;
            sensor2.energy    = accumulatedEnergyWh;
            sensor2.alarm     = true;
            sensor2.isValid   = true;
            break;

        case MOCK_UNDERVOLTAGE_FAULT:
            // Simulating brownout / line sag
            sensor1.voltage   = 165.0f + ((rand() % 10) * 0.2f); // < 180V limit!
            sensor1.current   = 2.100f;
            sensor1.power     = sensor1.voltage * sensor1.current * 0.92f;
            sensor1.frequency = freq - 0.5f;
            sensor1.pf        = 0.92f;
            sensor1.energy    = accumulatedEnergyWh;
            sensor1.alarm     = false;
            sensor1.isValid   = true;

            sensor2.voltage   = sensor1.voltage - 0.5f;
            sensor2.current   = 2.080f;
            sensor2.power     = sensor2.voltage * sensor2.current * 0.92f;
            sensor2.frequency = freq - 0.5f;
            sensor2.pf        = 0.92f;
            sensor2.energy    = accumulatedEnergyWh;
            sensor2.alarm     = false;
            sensor2.isValid   = true;
            break;

        case MOCK_NORMAL:
        default:
            // Normal healthy grid: Incomer ~= Outgoing
            sensor1.voltage   = v_base;
            sensor1.current   = 2.450f + ((rand() % 10) - 5) * 0.005f; // ~2.45A
            sensor1.power     = sensor1.voltage * sensor1.current * 0.96f;
            sensor1.frequency = freq;
            sensor1.pf        = 0.96f;
            sensor1.energy    = accumulatedEnergyWh;
            sensor1.alarm     = false;
            sensor1.isValid   = true;

            sensor2.voltage   = v_base - 0.3f;
            sensor2.current   = sensor1.current - 0.020f; // Small natural discrepancy (20mA)
            sensor2.power     = sensor2.voltage * sensor2.current * 0.96f;
            sensor2.frequency = freq;
            sensor2.pf        = 0.96f;
            sensor2.energy    = accumulatedEnergyWh * 0.999f;
            sensor2.alarm     = false;
            sensor2.isValid   = true;
            break;
    }
}

void processSerialCommands() {
    if (Serial.available()) {
        char ch = Serial.read();
        if (ch == 'n' || ch == 'N') {
            mockScenario = MOCK_NORMAL;
            Serial.println("\n[CMD] Switched to MOCK_NORMAL (Normal Grid Operation)");
        } else if (ch == 'd' || ch == 'D') {
            mockScenario = MOCK_DIFFERENTIAL_FAULT;
            Serial.println("\n[CMD] Injected MOCK_DIFFERENTIAL_FAULT (Ground Leakage / Delta-I > 0.35A)");
        } else if (ch == 'o' || ch == 'O') {
            mockScenario = MOCK_OVERCURRENT_FAULT;
            Serial.println("\n[CMD] Injected MOCK_OVERCURRENT_FAULT (Overload > 16A)");
        } else if (ch == 'u' || ch == 'U') {
            mockScenario = MOCK_UNDERVOLTAGE_FAULT;
            Serial.println("\n[CMD] Injected MOCK_UNDERVOLTAGE_FAULT (Voltage Sag < 180V)");
        } else if (ch == 'a' || ch == 'A') {
            mockScenario = MOCK_AUTO_CYCLE;
            autoCycleCounter = 0;
            Serial.println("\n[CMD] Switched to MOCK_AUTO_CYCLE (Periodic automated fault cycling)");
        }
    }
}

void evaluateFDIR() {
    diff_current = 0.0f;
    current_fault = FAULT_NONE;

    if (!sensor1.isValid && !sensor2.isValid) {
        current_fault = FAULT_SENSOR_OFFLINE;
        return;
    }

    if (sensor1.isValid && sensor2.isValid) {
        diff_current = fabs(sensor1.current - sensor2.current);
    } else if (sensor1.isValid) {
        diff_current = sensor1.current;
    } else {
        diff_current = sensor2.current;
    }

    // 1. Differential Protection (High-Priority Ground Leakage / Illegal Tap)
    if (sensor1.isValid && sensor2.isValid && diff_current >= DIFF_CURRENT_THRESHOLD_A) {
        current_fault = FAULT_DIFFERENTIAL;
        return;
    }

    // 2. Overcurrent Protection
    if ((sensor1.isValid && sensor1.current >= OVERCURRENT_THRESHOLD_A) ||
        (sensor2.isValid && sensor2.current >= OVERCURRENT_THRESHOLD_A)) {
        current_fault = FAULT_OVERCURRENT;
        return;
    }

    // 3. Voltage Abnormality Protection
    float v = sensor1.isValid ? sensor1.voltage : (sensor2.isValid ? sensor2.voltage : 0.0f);
    if (v > 10.0f) {
        if (v <= UNDERVOLTAGE_THRESHOLD_V) {
            current_fault = FAULT_UNDERVOLTAGE;
            return;
        } else if (v >= OVERVOLTAGE_THRESHOLD_V) {
            current_fault = FAULT_OVERVOLTAGE;
            return;
        }
    }
}

void transmitTelemetry(bool isUrgentAlert = false) {
    packet_seq++;

    char payload[160];
    const char* statusStr = (current_fault == FAULT_NONE) ? "OK" : "ALERT";
    const char* faultStr  = faultTypeToString(current_fault);

    // Clean JSON packet for Gateway & Host Dashboard
    snprintf(payload, sizeof(payload),
        "{\"node\":%d,\"seq\":%u,\"status\":\"%s\",\"fault\":\"%s\",\"idiff\":%.3f,"
        "\"v1\":%.1f,\"i1\":%.3f,\"p1\":%.1f,"
        "\"v2\":%.1f,\"i2\":%.3f,\"p2\":%.1f}",
        NODE_ID,
        packet_seq,
        statusStr,
        faultStr,
        diff_current,
        sensor1.isValid ? sensor1.voltage : 0.0f,
        sensor1.isValid ? sensor1.current : 0.0f,
        sensor1.isValid ? sensor1.power   : 0.0f,
        sensor2.isValid ? sensor2.voltage : 0.0f,
        sensor2.isValid ? sensor2.current : 0.0f,
        sensor2.isValid ? sensor2.power   : 0.0f
    );

    if (isUrgentAlert) {
        Serial.printf("\n[URGENT FDIR ALERT] >>> %s\n", payload);
    } else {
        Serial.printf("[TX TELEMETRY #%u] %s\n", packet_seq, payload);
    }

    lora_send_string(payload);
}

void printSensorDiagnostics() {
    Serial.println("\n=======================================================");
    Serial.printf("        GridSense Edge Node #%d - Diagnostics        \n", NODE_ID);
    #if USE_MOCK_SENSORS
    Serial.println("  [MODE: MOCK SIMULATION (Commands: 'n'=Norm, 'd'=Diff, 'o'=OverI, 'u'=UnderV, 'a'=Auto)]");
    #else
    Serial.println("  [MODE: REAL PZEM-004T V4.0 SENSORS ACTIVE]");
    #endif
    Serial.println("=======================================================");

    Serial.printf("PZEM 1 (Incomer) : %s | V: %.1f V | I: %.3f A | P: %.1f W | F: %.1f Hz | PF: %.2f\n",
                  sensor1.isValid ? "ONLINE " : "OFFLINE",
                  sensor1.voltage, sensor1.current, sensor1.power, sensor1.frequency, sensor1.pf);

    Serial.printf("PZEM 2 (Outgoing): %s | V: %.1f V | I: %.3f A | P: %.1f W | F: %.1f Hz | PF: %.2f\n",
                  sensor2.isValid ? "ONLINE " : "OFFLINE",
                  sensor2.voltage, sensor2.current, sensor2.power, sensor2.frequency, sensor2.pf);

    Serial.println("-------------------------------------------------------");
    Serial.printf("Diff Current (Idiff) : %.3f A  (Trip Limit: %.3f A)\n", diff_current, DIFF_CURRENT_THRESHOLD_A);
    Serial.printf("FDIR Status          : [%s] - %s\n", 
                  (current_fault == FAULT_NONE) ? "NORMAL" : "TRIP/FAULT", faultTypeToString(current_fault));
    Serial.println("=======================================================\n");
}

void setup() {
    Serial.begin(115200);
    delay(2000); // Allow USB CDC enumeration

    Serial.println("\n**************************************************");
    Serial.printf("   GridSense FDIR Prototype - Edge Node #%d\n", NODE_ID);
    Serial.println("   MCA Project - FISAT                           ");
    #if USE_MOCK_SENSORS
    Serial.println("   >> RUNNING IN SENSOR MOCK/SIMULATION MODE <<  ");
    Serial.println("   Type 'n', 'd', 'o', 'u', or 'a' to inject faults");
    #else
    Serial.println("   >> RUNNING WITH LIVE PZEM-004T V4.0 SENSORS << ");
    #endif
    Serial.println("**************************************************");

    #if !USE_MOCK_SENSORS
    Serial.println("[INIT] Initializing PZEM 1 on Serial1 (RX: GPIO 17, TX: GPIO 18)...");
    pzem1.begin();

    Serial.println("[INIT] Initializing PZEM 2 on Serial2 (RX: GPIO 8,  TX: GPIO 9)...");
    pzem2.begin();
    #else
    Serial.println("[INIT] Mock sensor generator initialized.");
    #endif

    // Initialize LR1121 Sub-GHz LoRa radio
    Serial.println("[INIT] Initializing Waveshare LR1121 Sub-GHz LoRa...");
    lora_transmitter_init();

    Serial.printf("[INIT] Ready. Frequency: %u MHz | Output: %d dBm\n\n",
                  (uint32_t)(RF_FREQ_IN_HZ / 1000000UL), TX_OUTPUT_POWER_DBM);
}

void loop() {
    // Process radio TX interrupts
    lora_tx_irq_process();

    #if USE_MOCK_SENSORS
    // Process interactive user commands from Serial Monitor
    processSerialCommands();
    #endif

    unsigned long current_ms = millis();

    // 1. Rapid Sensor Polling / Mock Evaluation Loop (250ms)
    if (current_ms - last_fault_check >= FAULT_CHECK_INTERVAL_MS) {
        last_fault_check = current_ms;

        #if USE_MOCK_SENSORS
        generateMockSensorData();
        #else
        pzem1.read(sensor1);
        pzem2.read(sensor2);
        #endif

        // Run FDIR differential & protection logic
        evaluateFDIR();

        bool isFaultActive = (current_fault != FAULT_NONE);

        // Immediate Trip Transmission: if a fault is triggered, transmit alert immediately!
        if (isFaultActive && !previous_fault_state) {
            printSensorDiagnostics();
            transmitTelemetry(true); // Urgent transmission
            last_telemetry_tx = current_ms;
        }

        previous_fault_state = isFaultActive;
    }

    // 2. Periodic Telemetry Broadcast Loop (3s)
    if (current_ms - last_telemetry_tx >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_tx = current_ms;

        printSensorDiagnostics();
        transmitTelemetry(false);
    }

    delay(10);
}
