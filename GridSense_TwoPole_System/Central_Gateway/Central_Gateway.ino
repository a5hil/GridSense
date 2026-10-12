/*!
 * @file      Central_Gateway.ino
 * @brief     GridSense Central Gateway Firmware (Centralized Two-Pole FDIR Engine)
 * @details   Receives LoRa telemetry from Electric Pole 1 and Electric Pole 2,
 *            calculates inter-pole differential current (|I_Pole1 - I_Pole2|),
 *            evaluates FDIR protection trips (Ground Leakage, Overcurrent, Voltage Sag, Offline),
 *            and streams real-time JSON over USB Serial to the host machine / dashboard.
 *
 * @project   GridSense - MCA Project, FISAT
 */

#include "lr1121_rx.h"

/* =========================================================================
 * FDIR PROTECTION THRESHOLDS
 * ========================================================================= */
#define DIFF_CURRENT_THRESHOLD_A    0.35f   // Differential trip threshold (350 mA)
#define OVERCURRENT_THRESHOLD_A     16.00f  // Overcurrent threshold (16 Amperes)
#define UNDERVOLTAGE_THRESHOLD_V    180.0f  // Undervoltage threshold (180 Volts)
#define OVERVOLTAGE_THRESHOLD_V     265.0f  // Overvoltage threshold (265 Volts)
#define POLE_TIMEOUT_MS             10000   // 10s timeout before declaring pole offline

struct PoleTelemetry {
    uint8_t  poleId;
    uint32_t seq;
    float    voltage;
    float    current;
    float    power;
    float    frequency;
    float    pf;
    float    energy;
    int16_t  rssi;
    int8_t   snr;
    uint32_t lastUpdateMs;
    bool     hasData;
};

PoleTelemetry pole1 = {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false};
PoleTelemetry pole2 = {2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false};

uint32_t total_packets = 0;
float current_idiff = 0.0f;

enum FaultType {
    FAULT_NONE = 0,
    FAULT_DIFFERENTIAL,
    FAULT_OVERCURRENT,
    FAULT_UNDERVOLTAGE,
    FAULT_OVERVOLTAGE,
    FAULT_POLE_OFFLINE
};

FaultType current_fault = FAULT_NONE;

const char* faultTypeToString(FaultType f) {
    switch (f) {
        case FAULT_DIFFERENTIAL: return "DIFF_LEAKAGE";
        case FAULT_OVERCURRENT:  return "OVERCURRENT";
        case FAULT_UNDERVOLTAGE: return "UNDERVOLTAGE";
        case FAULT_OVERVOLTAGE:  return "OVERVOLTAGE";
        case FAULT_POLE_OFFLINE: return "POLE_OFFLINE";
        default:                 return "NORMAL";
    }
}

// Lightweight JSON value parser (safe and zero-allocation)
float parseJsonFloat(const char* json, const char* key) {
    char searchKey[32];
    snprintf(searchKey, sizeof(searchKey), "\"%s\":", key);
    const char* p = strstr(json, searchKey);
    if (!p) return 0.0f;
    p += strlen(searchKey);
    while (*p == ' ') p++;
    return atof(p);
}

int parseJsonInt(const char* json, const char* key) {
    char searchKey[32];
    snprintf(searchKey, sizeof(searchKey), "\"%s\":", key);
    const char* p = strstr(json, searchKey);
    if (!p) return 0;
    p += strlen(searchKey);
    while (*p == ' ') p++;
    return atoi(p);
}

void evaluateCentralFDIR() {
    uint32_t now = millis();
    current_fault = FAULT_NONE;
    current_idiff = 0.0f;

    // Check if both poles have reported within the active window
    bool p1_online = (pole1.hasData && (now - pole1.lastUpdateMs <= POLE_TIMEOUT_MS));
    bool p2_online = (pole2.hasData && (now - pole2.lastUpdateMs <= POLE_TIMEOUT_MS));

    if (!p1_online || !p2_online) {
        current_fault = FAULT_POLE_OFFLINE;
        return;
    }

    // 1. Calculate Differential Current between Pole 1 and Pole 2
    current_idiff = fabs(pole1.current - pole2.current);

    // 2. Differential Protection Check
    if (current_idiff >= DIFF_CURRENT_THRESHOLD_A) {
        current_fault = FAULT_DIFFERENTIAL;
        return;
    }

    // 3. Overcurrent Protection Check
    if (pole1.current >= OVERCURRENT_THRESHOLD_A || pole2.current >= OVERCURRENT_THRESHOLD_A) {
        current_fault = FAULT_OVERCURRENT;
        return;
    }

    // 4. Voltage Sag / Swell Check
    if (pole1.voltage > 10.0f && pole2.voltage > 10.0f) {
        if (pole1.voltage <= UNDERVOLTAGE_THRESHOLD_V || pole2.voltage <= UNDERVOLTAGE_THRESHOLD_V) {
            current_fault = FAULT_UNDERVOLTAGE;
            return;
        } else if (pole1.voltage >= OVERVOLTAGE_THRESHOLD_V || pole2.voltage >= OVERVOLTAGE_THRESHOLD_V) {
            current_fault = FAULT_OVERVOLTAGE;
            return;
        }
    }
}

void streamFDIRJsonToHost() {
    uint32_t now = millis();
    const char* statusStr = (current_fault == FAULT_NONE) ? "OK" : ((current_fault == FAULT_POLE_OFFLINE) ? "WARN" : "ALERT");
    const char* faultStr  = faultTypeToString(current_fault);

    // Stream single-line compact JSON directly over USB Serial to host dashboard
    Serial.printf(
        "{\"gw_ms\":%lu,\"status\":\"%s\",\"fault\":\"%s\",\"idiff\":%.3f,\"trip_limit\":%.3f,"
        "\"p1\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"rssi\":%d,\"snr\":%d,\"age_ms\":%lu},"
        "\"p2\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"rssi\":%d,\"snr\":%d,\"age_ms\":%lu}}\n",
        now,
        statusStr,
        faultStr,
        current_idiff,
        DIFF_CURRENT_THRESHOLD_A,
        pole1.voltage, pole1.current, pole1.power, pole1.pf, pole1.rssi, pole1.snr,
        pole1.hasData ? (now - pole1.lastUpdateMs) : 99999,
        pole2.voltage, pole2.current, pole2.power, pole2.pf, pole2.rssi, pole2.snr,
        pole2.hasData ? (now - pole2.lastUpdateMs) : 99999
    );
}

void printConsoleSummary() {
    uint32_t now = millis();
    Serial.println("\n=======================================================");
    Serial.println("           GridSense Gateway - Central FDIR Status      ");
    Serial.println("=======================================================");
    Serial.printf(" Pole 1 (Incomer) : V: %.1f V | I: %.3f A | P: %.1f W | RSSI: %d dBm | Age: %lu ms\n",
                  pole1.voltage, pole1.current, pole1.power, pole1.rssi, (now - pole1.lastUpdateMs));
    Serial.printf(" Pole 2 (Outgoing): V: %.1f V | I: %.3f A | P: %.1f W | RSSI: %d dBm | Age: %lu ms\n",
                  pole2.voltage, pole2.current, pole2.power, pole2.rssi, (now - pole2.lastUpdateMs));
    Serial.println("-------------------------------------------------------");
    Serial.printf(" Inter-Pole Diff Current (Idiff) : %.3f A (Trip limit: %.3f A)\n", 
                  current_idiff, DIFF_CURRENT_THRESHOLD_A);
    Serial.printf(" Central FDIR Decision           : [%s] - %s\n",
                  (current_fault == FAULT_NONE) ? "NORMAL" : "TRIP/ALERT", faultTypeToString(current_fault));
    Serial.println("=======================================================\n");
}

void processIncomingPacket(const char* json, int16_t rssi, int8_t snr) {
    int pole = parseJsonInt(json, "pole");
    if (pole == 1) {
        pole1.seq          = parseJsonInt(json, "seq");
        pole1.voltage      = parseJsonFloat(json, "v");
        pole1.current      = parseJsonFloat(json, "i");
        pole1.power        = parseJsonFloat(json, "p");
        pole1.frequency    = parseJsonFloat(json, "freq");
        pole1.pf           = parseJsonFloat(json, "pf");
        pole1.energy       = parseJsonFloat(json, "e");
        pole1.rssi         = rssi;
        pole1.snr          = snr;
        pole1.lastUpdateMs = millis();
        pole1.hasData      = true;
    } else if (pole == 2) {
        pole2.seq          = parseJsonInt(json, "seq");
        pole2.voltage      = parseJsonFloat(json, "v");
        pole2.current      = parseJsonFloat(json, "i");
        pole2.power        = parseJsonFloat(json, "p");
        pole2.frequency    = parseJsonFloat(json, "freq");
        pole2.pf           = parseJsonFloat(json, "pf");
        pole2.energy       = parseJsonFloat(json, "e");
        pole2.rssi         = rssi;
        pole2.snr          = snr;
        pole2.lastUpdateMs = millis();
        pole2.hasData      = true;
    } else {
        return; // Unknown pole ID
    }

    // Run Centralized FDIR Differential Calculation
    evaluateCentralFDIR();

    // Stream line JSON to host dashboard
    streamFDIRJsonToHost();

    // Print readable console diagnostics
    printConsoleSummary();
}

void setup() {
    Serial.begin(115200);
    delay(2000); // Allow USB CDC enumeration

    Serial.println("\n**************************************************");
    Serial.println("   GridSense Central Gateway (Two-Pole FDIR)      ");
    Serial.println("   MCA Project - FISAT                           ");
    Serial.println("**************************************************");

    lora_receiver_init();

    Serial.printf("[GW_INIT] Listening on %u MHz (LoRa Sub-GHz HF)...\n", (uint32_t)(RF_FREQ_IN_HZ / 1000000UL));
    Serial.println("[GW_INIT] Gateway ready. Awaiting telemetry from Pole 1 & Pole 2...\n");
}

void loop() {
    // Process LoRa RX interrupts
    lora_rx_irq_process();

    if (rx_packet_ready) {
        rx_packet_ready = false;
        total_packets++;

        if (last_packet.length < sizeof(last_packet.payload)) {
            last_packet.payload[last_packet.length] = '\0';
        } else {
            last_packet.payload[sizeof(last_packet.payload) - 1] = '\0';
        }

        processIncomingPacket((const char*)last_packet.payload, last_packet.packet_rssi, last_packet.snr);
    }

    delay(5);
}
