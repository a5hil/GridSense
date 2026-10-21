/*!
 * @file      EdgeNode_Pole.ino
 * @brief     GridSense Pole Edge Node Firmware (1x PZEM-004T v4.0 Split CT per Electric Pole)
 * @details   Polls single PZEM-004T AC monitor via HardwareSerial (Serial1: RX 17, TX 18),
 *            or synthesizes mock Indian grid data (230V, 50Hz) for bench validation.
 *            Transmits telemetry to Central Gateway via Sub-GHz LoRa using Listen-Before-Talk (LBT)
 *            with Channel Activity Detection (CAD) and random backoff jitter (100-1500 ms).
 *
 * @project   GridSense - MCA Project, FISAT
 *
 * HOW TO FLASH:
 * - For Electric Pole 1 (Incomer): Set "#define POLE_ID 1", compile & upload.
 * - For Electric Pole 2 (Outgoing): Set "#define POLE_ID 2", compile & upload.
 *
 * FAULT INJECTION (In Mock Mode):
 * - Send serial commands via Serial Monitor (115200 baud):
 *     'n' : Normal load
 *     'd' : Differential fault (Injects high current on Pole 1 or low on Pole 2)
 *     'o' : Overcurrent fault (> 16A overload)
 *     'u' : Undervoltage sag (< 180V brownout)
 *     'a' : Auto-cycle mode (automatically cycles normal -> fault -> normal)
 *
 * HARDWARE CONNECTIONS (When USE_MOCK_SENSORS is false):
 * - PZEM TX -> ESP32-S3 GPIO 17 (Serial1 RX)
 * - PZEM RX -> ESP32-S3 GPIO 18 (Serial1 TX)
 * - PZEM 5V -> 5V / VBUS (Drives internal optocouplers)
 * - PZEM GND -> GND
 * - Split CT clamp -> Live AC Phase wire on this pole
 */

#include "PZEM004T_Modbus.h"
#include "lr1121_lbt_tx.h"
#include "pole_ble_service.h"
#include "gridsense_packet.h"
#include "gridsense_crypto.h"

PacketDeduplicator deduplicator;

/* =========================================================================
 * POLE SELECTION, ROLE & MOCK TOGGLE
 * ========================================================================= */
enum NodeRole {
    ROLE_ENDPOINT = 0,  // Leaf pole: monitors own AC line & transmits
    ROLE_REPEATER = 1   // Relay pole: monitors own line + relays downstream packets
};

#define POLE_ID                     2       // Set to 1 for Pole 1, set to 2 for Pole 2
#define NODE_ROLE                   (POLE_ID == 1 ? ROLE_REPEATER : ROLE_ENDPOINT)
#define USE_MOCK_SENSORS            true    // Set to true for Mock Mode, false for live PZEM v4.0
#define TELEMETRY_INTERVAL_MS       3000    // Telemetry transmission interval (3 seconds)
#define ENABLE_BLE_LINEMAN_ACCESS   true    // Enable Bluetooth Low Energy for field technicians
#define ENABLE_AES_ENCRYPTION       true    // Enable Hardware-Accelerated AES-128 payload encryption

/* =========================================================================
 * HARDWARE PINOUT (HardwareSerial1)
 * ========================================================================= */
#define PZEM_RX_PIN                 17      // Connects to PZEM TX
#define PZEM_TX_PIN                 18      // Connects to PZEM RX

PZEM004T_Modbus pzem(Serial1, PZEM_RX_PIN, PZEM_TX_PIN);
PZEMData sensor;

// Telemetry state tracking
uint32_t packet_seq = 0;
unsigned long last_tx_ms = 0;
float last_known_voltage = 230.0f;
float last_known_current = 2.45f;
bool last_gasp_broadcast_sent = false;

// Mock Simulation Scenarios (Including Kerala Grid Operational States)
enum MockScenario {
    MOCK_NORMAL = 0,
    MOCK_DIFFERENTIAL_FAULT,
    MOCK_OVERCURRENT_FAULT,
    MOCK_UNDERVOLTAGE_FAULT,
    MOCK_POWERCUT,           // 0V / 0A (Feeder de-energized / load shedding)
    MOCK_LINE_CHARGING,      // Maintenance re-energization test
    MOCK_AUTO_CYCLE
};

MockScenario mockScenario = MOCK_NORMAL;
uint32_t autoCycleCounter = 0;
float accumulatedEnergyWh = (POLE_ID == 1) ? 1420.0f : 1418.5f;

void generateMockData() {
    float v_base = 230.0f + ((rand() % 20) - 10) * 0.1f;
    float freq   = 50.0f + ((rand() % 10) - 5) * 0.02f;
    accumulatedEnergyWh += 0.5f;

    MockScenario activeScenario = mockScenario;

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
            // Inter-pole line leakage / tapping:
            // Pole 1 sees high current (3.85A), Pole 2 sees low current (1.15A)
            sensor.voltage   = v_base - ((POLE_ID == 1) ? 3.0f : 5.0f);
            sensor.current   = (POLE_ID == 1) ? (3.850f + ((rand() % 10) * 0.01f)) 
                                              : (1.150f + ((rand() % 10) * 0.01f));
            sensor.power     = sensor.voltage * sensor.current * 0.95f;
            sensor.frequency = freq;
            sensor.pf        = 0.95f;
            sensor.energy    = accumulatedEnergyWh;
            sensor.alarm     = false;
            sensor.isValid   = true;
            break;

        case MOCK_OVERCURRENT_FAULT:
            // High current on both poles (overload)
            sensor.voltage   = v_base - 8.0f;
            sensor.current   = 18.500f + ((rand() % 20) * 0.05f);
            sensor.power     = sensor.voltage * sensor.current * 0.97f;
            sensor.frequency = freq - 0.2f;
            sensor.pf        = 0.97f;
            sensor.energy    = accumulatedEnergyWh;
            sensor.alarm     = true;
            sensor.isValid   = true;
            break;

        case MOCK_UNDERVOLTAGE_FAULT:
            // Grid brownout
            sensor.voltage   = 165.0f + ((rand() % 10) * 0.2f);
            sensor.current   = 2.100f;
            sensor.power     = sensor.voltage * sensor.current * 0.92f;
            sensor.frequency = freq - 0.4f;
            sensor.pf        = 0.92f;
            sensor.energy    = accumulatedEnergyWh;
            sensor.alarm     = false;
            sensor.isValid   = true;
            break;

        case MOCK_POWERCUT:
            // Feeder de-energized (KSEB power cut / load shedding)
            sensor.voltage   = 0.0f;
            sensor.current   = 0.0f;
            sensor.power     = 0.0f;
            sensor.frequency = 0.0f;
            sensor.pf        = 0.0f;
            sensor.energy    = accumulatedEnergyWh;
            sensor.alarm     = false;
            sensor.isValid   = true;
            break;

        case MOCK_LINE_CHARGING:
            // Maintenance charging test by linemen (energization ramp)
            sensor.voltage   = 226.0f + ((rand() % 10) * 0.1f);
            sensor.current   = (POLE_ID == 1) ? 0.350f : 0.330f; // Minimal magnetizing / test current
            sensor.power     = sensor.voltage * sensor.current * 0.85f;
            sensor.frequency = 50.0f;
            sensor.pf        = 0.85f;
            sensor.energy    = accumulatedEnergyWh;
            sensor.alarm     = false;
            sensor.isValid   = true;
            break;

        case MOCK_NORMAL:
        default:
            // Normal healthy grid: Pole 1 and Pole 2 carry virtually identical current
            sensor.voltage   = v_base - ((POLE_ID == 2) ? 0.3f : 0.0f);
            sensor.current   = (POLE_ID == 1) ? (2.450f + ((rand() % 10) - 5) * 0.005f)
                                              : (2.430f + ((rand() % 10) - 5) * 0.005f);
            sensor.power     = sensor.voltage * sensor.current * 0.96f;
            sensor.frequency = freq;
            sensor.pf        = 0.96f;
            sensor.energy    = accumulatedEnergyWh;
            sensor.alarm     = false;
            sensor.isValid   = true;
            break;
    }
}

const char* getScenarioString(MockScenario s) {
    switch (s) {
        case MOCK_DIFFERENTIAL_FAULT: return "DIFF_FAULT";
        case MOCK_OVERCURRENT_FAULT:  return "OVERCURRENT";
        case MOCK_UNDERVOLTAGE_FAULT: return "UNDERVOLTAGE";
        case MOCK_POWERCUT:           return "POWERCUT";
        case MOCK_LINE_CHARGING:      return "LINE_CHARGING";
        case MOCK_AUTO_CYCLE:         return "AUTO_CYCLE";
        default:                      return "NORMAL";
    }
}

void sendLastGaspBroadcast(float last_v, float last_i) {
    packet_seq++;

    char dyingJson[140];
    snprintf(dyingJson, sizeof(dyingJson),
        "{\"event\":\"LAST_GASP\",\"v\":0.0,\"v_prev\":%.1f,\"i_prev\":%.3f,\"cause\":\"POWER_LOSS\"}",
        last_v, last_i
    );

    GridSensePacket pkt;
    pkt.header.srcId     = POLE_ID;
    pkt.header.relayId   = POLE_ID;
    pkt.header.destId    = 0x00; // Gateway
    pkt.header.seq       = (uint16_t)packet_seq;
    pkt.header.hopLimit  = 3;
    pkt.header.hopsTaken = 0;
    pkt.header.msgType   = MSG_TYPE_LAST_GASP;

    #if ENABLE_AES_ENCRYPTION
    char encBuf[192];
    if (gridsense_encrypt_payload(dyingJson, POLE_ID, (uint16_t)packet_seq, encBuf, sizeof(encBuf))) {
        strncpy(pkt.payload, encBuf, sizeof(pkt.payload) - 1);
    } else {
        strncpy(pkt.payload, dyingJson, sizeof(pkt.payload) - 1);
    }
    #else
    strncpy(pkt.payload, dyingJson, sizeof(pkt.payload) - 1);
    #endif
    pkt.payload[sizeof(pkt.payload) - 1] = '\0';

    char loraTxBuf[240];
    serializeGridSensePacket(pkt, loraTxBuf, sizeof(loraTxBuf));

    // Record in local deduplication cache
    deduplicator.record(POLE_ID, (uint16_t)packet_seq);

    Serial.println("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    Serial.printf(" [POLE #%d LAST GASP] SUDDEN POWER COLLAPSE! Broadcast Dying Outage (Seq: %u)...\n",
                  POLE_ID, packet_seq);
    Serial.printf("  Prior Line Status: V: %.1f V | I: %.3f A -> Current: 0.0 V\n", last_v, last_i);
    Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    #if ENABLE_BLE_LINEMAN_ACCESS
    char bleGaspMsg[96];
    snprintf(bleGaspMsg, sizeof(bleGaspMsg), "[EMERGENCY] P%u LAST GASP: Outage broadcast transmitted!\n", POLE_ID);
    sendPoleBLEMessage(bleGaspMsg);
    #endif

    // High priority expedited transmission with minimal jitter backoff (20-80ms)
    bool sent = lora_send_with_lbt(loraTxBuf, 5, 20, 80);

    if (sent) {
        Serial.printf("[POLE #%d LAST GASP TX OK] >>> %s\n\n", POLE_ID, loraTxBuf);
    } else {
        Serial.printf("[POLE #%d LAST GASP TX RETRY_LIMIT] >>> %s\n\n", POLE_ID, loraTxBuf);
    }
}

void handleCommand(char ch) {
    if (ch == 'n' || ch == 'N') {
        mockScenario = MOCK_NORMAL;
        last_gasp_broadcast_sent = false;
        Serial.println("\n[CMD] Injected MOCK_NORMAL (Normal Grid Operation)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Mode set to NORMAL.\n");
        #endif
    } else if (ch == 'd' || ch == 'D') {
        mockScenario = MOCK_DIFFERENTIAL_FAULT;
        Serial.println("\n[CMD] Injected MOCK_DIFFERENTIAL_FAULT (Differential current mismatch)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected DIFFERENTIAL FAULT.\n");
        #endif
    } else if (ch == 'o' || ch == 'O') {
        mockScenario = MOCK_OVERCURRENT_FAULT;
        Serial.println("\n[CMD] Injected MOCK_OVERCURRENT_FAULT (Overload > 16A)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected OVERCURRENT.\n");
        #endif
    } else if (ch == 'u' || ch == 'U') {
        mockScenario = MOCK_UNDERVOLTAGE_FAULT;
        Serial.println("\n[CMD] Injected MOCK_UNDERVOLTAGE_FAULT (Brownout < 180V)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected UNDERVOLTAGE.\n");
        #endif
    } else if (ch == 'p' || ch == 'P') {
        mockScenario = MOCK_POWERCUT;
        Serial.println("\n[CMD] Injected MOCK_POWERCUT (0V / 0A De-energized Outage)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected POWERCUT / OUTAGE (0V).\n");
        #endif
        if (!last_gasp_broadcast_sent) {
            float v_rep = (sensor.isValid && sensor.voltage > 10.0f) ? sensor.voltage : last_known_voltage;
            float i_rep = (sensor.isValid && sensor.current > 0.01f) ? sensor.current : last_known_current;
            sendLastGaspBroadcast(v_rep, i_rep);
            last_gasp_broadcast_sent = true;
            // Update sensor readings immediately to 0
            sensor.voltage = 0.0f;
            sensor.current = 0.0f;
            sensor.power   = 0.0f;
        }
    } else if (ch == 'c' || ch == 'C') {
        mockScenario = MOCK_LINE_CHARGING;
        last_gasp_broadcast_sent = false;
        Serial.println("\n[CMD] Injected MOCK_LINE_CHARGING (Maintenance test energization)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected LINE CHARGING TEST.\n");
        #endif
    } else if (ch == 'a' || ch == 'A') {
        mockScenario = MOCK_AUTO_CYCLE;
        autoCycleCounter = 0;
        last_gasp_broadcast_sent = false;
        Serial.println("\n[CMD] Switched to MOCK_AUTO_CYCLE (Automated periodic fault cycling)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Switched to AUTO CYCLE.\n");
        #endif
    }
}

void processSerialCommands() {
    if (Serial.available()) {
        char ch = Serial.read();
        handleCommand(ch);
    }
}

void printDiagnostics() {
    Serial.println("-------------------------------------------------------");
    Serial.printf(" [Electric Pole #%d] %s | V: %.1f V | I: %.3f A | P: %.1f W | F: %.1f Hz | PF: %.2f | %s\n",
                  POLE_ID, sensor.isValid ? "ONLINE " : "OFFLINE",
                  sensor.voltage, sensor.current, sensor.power, sensor.frequency, sensor.pf,
                  getScenarioString(mockScenario));
    Serial.println("-------------------------------------------------------");
}

void setup() {
    Serial.begin(115200);
    delay(2000); // Allow USB CDC enumeration

    Serial.println("\n**************************************************");
    Serial.printf("   GridSense FDIR Prototype - Electric Pole #%d\n", POLE_ID);
    Serial.println("   MCA Project - FISAT                           ");
    #if USE_MOCK_SENSORS
    Serial.println("   >> MOCK SIMULATION MODE ACTIVE <<              ");
    Serial.println("   Keys: 'n'=Norm, 'd'=Diff, 'o'=OverI, 'u'=UnderV");
    Serial.println("         'p'=Powercut, 'c'=Charging, 'a'=Auto     ");
    #else
    Serial.println("   >> LIVE PZEM-004T V4.0 SENSOR ACTIVE <<        ");
    #endif
    Serial.println("   >> LBT (CAD) Collision Avoidance: ENABLED <<   ");

    #if ENABLE_BLE_LINEMAN_ACCESS
    Serial.println("   >> BLE Lineman Smartphone Access: ENABLED <<   ");
    initPoleBLE(POLE_ID, handleCommand);
    #endif

    #if ENABLE_AES_ENCRYPTION
    if (gridsense_crypto_init()) {
        Serial.println("   >> ESP32-S3 Hardware AES-128 Crypto Engine: ACTIVE <<");
    } else {
        Serial.println("   >> Hardware AES Crypto: Init Failed! <<");
    }
    #endif

    Serial.printf("   >> Pole Role: %s <<\n",
                  (NODE_ROLE == ROLE_REPEATER) ? "REPEATER (Relays downstream poles)" : "ENDPOINT (Leaf node)");
    Serial.println("**************************************************");

    #if !USE_MOCK_SENSORS
    Serial.printf("[INIT] Initializing PZEM-004T v4.0 on Serial1 (RX: %d, TX: %d)...\n", PZEM_RX_PIN, PZEM_TX_PIN);
    pzem.begin();
    #else
    Serial.println("[INIT] Mock sensor generator initialized.");
    #endif

    // Initialize LR1121 Transceiver with Hardware CAD support
    Serial.println("[INIT] Initializing Waveshare LR1121 Sub-GHz LoRa Transceiver...");
    lora_node_radio_init();

    Serial.printf("[INIT] Ready. Frequency: %.1f MHz (IN865) | Output: %d dBm\n\n",
                  (float)RF_FREQ_IN_HZ / 1000000.0f, TX_OUTPUT_POWER_DBM);

    // Stagger initial transmission phase between Pole 1 and Pole 2 to eliminate RF collision
    // Pole 1 transmits at t = 0s, 3s, 6s... Pole 2 transmits at t = 1.5s, 4.5s, 7.5s...
    last_tx_ms = millis() - ((POLE_ID == 1) ? TELEMETRY_INTERVAL_MS : (TELEMETRY_INTERVAL_MS / 2));
}

void handleRepeaterRelay() {
    #if (NODE_ROLE == ROLE_REPEATER)
    if (!node_rx_ready) return;
    node_rx_ready = false;

    GridSensePacket rxPkt;
    if (deserializeGridSensePacket((const char*)last_node_rx_packet.payload, rxPkt)) {
        // Drop if originating from self
        if (rxPkt.header.srcId == POLE_ID) return;

        // Check deduplication (Drop if already seen within 30 seconds)
        if (deduplicator.isDuplicate(rxPkt.header.srcId, rxPkt.header.seq)) {
            return;
        }
        deduplicator.record(rxPkt.header.srcId, rxPkt.header.seq);

        // Check TTL
        if (rxPkt.header.hopLimit <= 1) {
            Serial.printf("[REPEATER] Packet from Pole %u dropped (TTL expired)\n", rxPkt.header.srcId);
            return;
        }

        // Decrement TTL, increment hops, update relayId
        rxPkt.header.hopLimit--;
        rxPkt.header.hopsTaken++;
        rxPkt.header.relayId = POLE_ID;

        char relayBuf[240];
        serializeGridSensePacket(rxPkt, relayBuf, sizeof(relayBuf));

        bool isEmergency = (rxPkt.header.msgType == MSG_TYPE_LAST_GASP);

        if (isEmergency) {
            Serial.printf("[REPEATER EMERGENCY RELAY] Relaying LAST GASP from Pole %u -> Gateway (Seq: %u | Hops: %u)\n",
                          rxPkt.header.srcId, rxPkt.header.seq, rxPkt.header.hopsTaken);
        } else {
            Serial.printf("[REPEATER RELAY] Relaying packet from Pole %u -> Gateway (Seq: %u | Hops: %u | TTL: %u)\n",
                          rxPkt.header.srcId, rxPkt.header.seq, rxPkt.header.hopsTaken, rxPkt.header.hopLimit);
        }

        #if ENABLE_BLE_LINEMAN_ACCESS
        char bleRelayMsg[96];
        if (isEmergency) {
            snprintf(bleRelayMsg, sizeof(bleRelayMsg), "[EMERGENCY RELAY] Forwarded P%u LAST GASP (Seq %u)\n", rxPkt.header.srcId, rxPkt.header.seq);
        } else {
            snprintf(bleRelayMsg, sizeof(bleRelayMsg), "[RELAY] Forwarded P%u packet (Seq %u)\n", rxPkt.header.srcId, rxPkt.header.seq);
        }
        sendPoleBLEMessage(bleRelayMsg);
        #endif

        // Transmit upstream using LBT CAD:
        // If emergency Last Gasp, use expedited priority jitter (15-50ms)
        // Otherwise regular jitter backoff (50-250ms)
        uint16_t minJitter = isEmergency ? 15 : 50;
        uint16_t maxJitter = isEmergency ? 50 : 250;
        lora_send_with_lbt(relayBuf, 3, minJitter, maxJitter);
    }
    #endif
}

void loop() {
    // Process any ongoing LoRa radio interrupts (RX and TX)
    lora_node_radio_irq_process();

    #if (NODE_ROLE == ROLE_REPEATER)
    handleRepeaterRelay();
    #endif

    #if ENABLE_BLE_LINEMAN_ACCESS
    updatePoleBLE();
    #endif

    #if USE_MOCK_SENSORS
    processSerialCommands();
    #endif

    unsigned long current_ms = millis();

    if (current_ms - last_tx_ms >= TELEMETRY_INTERVAL_MS) {
        last_tx_ms = current_ms;
        packet_seq++;

        float prev_v = sensor.voltage;
        float prev_i = sensor.current;

        #if USE_MOCK_SENSORS
        generateMockData();
        #else
        pzem.read(sensor);
        #endif

        // Track last known healthy voltage & current
        if (sensor.isValid && sensor.voltage >= 150.0f) {
            last_known_voltage = sensor.voltage;
            last_known_current = sensor.current;
            last_gasp_broadcast_sent = false; // Reset when power is healthy
        }

        // Automatic voltage collapse detection (e.g. real AC mains cut or feeder trip)
        if (sensor.isValid && prev_v >= 150.0f && sensor.voltage < 50.0f && !last_gasp_broadcast_sent) {
            sendLastGaspBroadcast(prev_v, prev_i);
            last_gasp_broadcast_sent = true;
        }

        printDiagnostics();

        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEData(sensor.voltage, sensor.current, sensor.power,
                        sensor.frequency, sensor.pf, sensor.energy,
                        getScenarioString(mockScenario));
        #endif

        // Format compact inner JSON telemetry payload for this Pole
        char innerJson[140];
        snprintf(innerJson, sizeof(innerJson),
            "{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"freq\":%.1f,\"pf\":%.2f,\"e\":%.1f}",
            sensor.isValid ? sensor.voltage   : 0.0f,
            sensor.isValid ? sensor.current   : 0.0f,
            sensor.isValid ? sensor.power     : 0.0f,
            sensor.isValid ? sensor.frequency : 0.0f,
            sensor.isValid ? sensor.pf        : 0.0f,
            sensor.isValid ? sensor.energy    : 0.0f
        );

        // Wrap into Hop-Limited GridSense Packet with TTL & Deduplication info
        GridSensePacket pkt;
        pkt.header.srcId     = POLE_ID;
        pkt.header.relayId   = POLE_ID;
        pkt.header.destId    = 0x00; // Target Gateway
        pkt.header.seq       = (uint16_t)packet_seq;
        pkt.header.hopLimit  = 3;    // TTL = 3 hops max
        pkt.header.hopsTaken = 0;    // 0 hops initially
        #if ENABLE_AES_ENCRYPTION
        char encBuf[192];
        if (gridsense_encrypt_payload(innerJson, POLE_ID, (uint16_t)packet_seq, encBuf, sizeof(encBuf))) {
            strncpy(pkt.payload, encBuf, sizeof(pkt.payload) - 1);
        } else {
            strncpy(pkt.payload, innerJson, sizeof(pkt.payload) - 1);
        }
        #else
        strncpy(pkt.payload, innerJson, sizeof(pkt.payload) - 1);
        #endif
        pkt.payload[sizeof(pkt.payload) - 1] = '\0';

        char loraTxBuf[240];
        serializeGridSensePacket(pkt, loraTxBuf, sizeof(loraTxBuf));

        // Record our sequence in the local deduplication cache
        deduplicator.record(POLE_ID, (uint16_t)packet_seq);

        Serial.printf("[POLE #%d TX #%u | TTL: %d] Checking channel & sending...\n",
                      POLE_ID, packet_seq, pkt.header.hopLimit);

        // Perform Listen-Before-Talk (LBT) using Hardware CAD with random backoff (100-1500ms)
        bool sent = lora_send_with_lbt(loraTxBuf, 5, 100, 1500);

        if (sent) {
            Serial.printf("[POLE #%d TX OK] >>> %s\n\n", POLE_ID, loraTxBuf);
        } else {
            Serial.printf("[POLE #%d TX RETRY_LIMIT] >>> %s\n\n", POLE_ID, loraTxBuf);
        }
    }

    delay(10);
}
