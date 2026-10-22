/*!
 * @file      Central_Gateway.ino
 * @brief     GridSense Central Gateway Firmware (Centralized Polyphase FDIR Engine)
 * @details   Receives LoRa telemetry from Electric Pole 1 and Electric Pole 2,
 *            supports Protocol v2 (GS2|...) multi-phase framing and legacy GS| frames,
 *            calculates per-phase inter-pole differential currents (|I_Pole1 - I_Pole2|),
 *            evaluates polyphase FDIR protection trips (Ground Leakage, Broken Conductor,
 *            Broken Neutral, Overcurrent, Voltage Sag/Swell, Offline),
 *            and streams real-time JSON over USB Serial to the host machine / dashboard.
 *
 * @project   GridSense - Enterprise ADMS Architecture
 *            MCA Project, FISAT
 */

#include "lr1121_rx.h"
#include "gridsense_packet.h"
#include "gridsense_crypto.h"
#include <math.h>

PacketDeduplicator gatewayDeduplicator;
bool hw_crypto_active = false;

/* =========================================================================
 * FDIR PROTECTION THRESHOLDS
 * ========================================================================= */
#define DIFF_CURRENT_THRESHOLD_A    0.35f   // Differential trip threshold (350 mA)
#define OVERCURRENT_THRESHOLD_A     16.00f  // Overcurrent threshold (16 Amperes)
#define UNDERVOLTAGE_THRESHOLD_V    180.0f  // Undervoltage threshold (180 Volts)
#define OVERVOLTAGE_THRESHOLD_V     265.0f  // Overvoltage threshold (265 Volts)
#define UNBALANCE_TRIP_PCT          15.0f   // NEMA voltage unbalance trip (broken neutral)
#define POLE_TIMEOUT_MS             20000   // 20s timeout before declaring pole offline

struct PoleTelemetry {
    uint8_t  poleId;
    uint32_t seq;
    float    voltage;       // Phase R / Primary Voltage
    float    current;       // Phase R / Primary Current
    float    power;         // Phase R / Primary Power
    float    frequency;
    float    pf;
    float    energy;

    // Polyphase Phase Readings
    float    vr, ir, pr, pfr;
    float    vy, iy, py, pfy;
    float    vb, ib, pb, pfb;
    bool     isThreePhase;
    uint8_t  phaseMask;
    float    neutralCurrent;
    float    voltageUnbalancePct;

    int16_t  rssi;
    int8_t   snr;
    uint32_t lastUpdateMs;
    bool     hasData;
    uint8_t  relayId;
    uint8_t  hops;
};

PoleTelemetry pole1 = {
    1, 0, 0, 0, 0, 50.0f, 0.96f, 0,
    0, 0, 0, 0.96f, 0, 0, 0, 0.96f, 0, 0, 0, 0.96f,
    false, PHASE_MASK_R, 0, 0,
    0, 0, 0, false, 1, 0
};

PoleTelemetry pole2 = {
    2, 0, 0, 0, 0, 50.0f, 0.96f, 0,
    0, 0, 0, 0.96f, 0, 0, 0, 0.96f, 0, 0, 0, 0.96f,
    false, PHASE_MASK_R, 0, 0,
    0, 0, 0, false, 2, 0
};

uint32_t total_packets = 0;
float current_idiff = 0.0f;
float idiff_r = 0.0f;
float idiff_y = 0.0f;
float idiff_b = 0.0f;
const char* fault_phase = "NONE";

enum FaultType {
    FAULT_NONE = 0,
    FAULT_DIFFERENTIAL,
    FAULT_BROKEN_CONDUCTOR,
    FAULT_BROKEN_NEUTRAL,
    FAULT_OVERCURRENT,
    FAULT_UNDERVOLTAGE,
    FAULT_OVERVOLTAGE,
    FAULT_POWERCUT,
    FAULT_POLE_OFFLINE
};

FaultType current_fault = FAULT_NONE;

const char* faultTypeToString(FaultType f) {
    switch (f) {
        case FAULT_DIFFERENTIAL:     return "DIFF_LEAKAGE";
        case FAULT_BROKEN_CONDUCTOR: return "BROKEN_CONDUCTOR";
        case FAULT_BROKEN_NEUTRAL:   return "BROKEN_NEUTRAL";
        case FAULT_OVERCURRENT:      return "OVERCURRENT";
        case FAULT_UNDERVOLTAGE:     return "UNDERVOLTAGE";
        case FAULT_OVERVOLTAGE:      return "OVERVOLTAGE";
        case FAULT_POWERCUT:         return "POWERCUT";
        case FAULT_POLE_OFFLINE:     return "POLE_OFFLINE";
        default:                     return "NORMAL";
    }
}

// Lightweight JSON value parser (safe, non-destructive & zero-allocation)
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

// Extract nested JSON value (e.g. object "phases" -> "y" -> "v")
float parseNestedJsonFloat(const char* json, const char* objKey, const char* subKey, const char* valKey) {
    char searchSection[48];
    snprintf(searchSection, sizeof(searchSection), "\"%s\"", objKey);
    const char* pObj = strstr(json, searchSection);
    if (!pObj) return 0.0f;

    snprintf(searchSection, sizeof(searchSection), "\"%s\"", subKey);
    const char* pSub = strstr(pObj, searchSection);
    if (!pSub) return 0.0f;

    return parseJsonFloat(pSub, valKey);
}

void evaluateCentralFDIR() {
    uint32_t now = millis();
    current_fault = FAULT_NONE;
    current_idiff = 0.0f;
    idiff_r = 0.0f;
    idiff_y = 0.0f;
    idiff_b = 0.0f;
    fault_phase = "NONE";

    // 1. Check if both poles have reported within the active window
    bool p1_online = (pole1.hasData && (now - pole1.lastUpdateMs <= POLE_TIMEOUT_MS));
    bool p2_online = (pole2.hasData && (now - pole2.lastUpdateMs <= POLE_TIMEOUT_MS));

    if (!p1_online || !p2_online) {
        current_fault = FAULT_POLE_OFFLINE;
        return;
    }

    // 2. Check for Complete Feeder De-energization (Scheduled Power Cut / Blackout)
    if (pole1.voltage < 50.0f && pole2.voltage < 50.0f) {
        current_fault = FAULT_POWERCUT;
        fault_phase = "ALL";
        return;
    }

    // 3. Broken Conductor Check per phase
    // Pole 1 energized on this phase (V >= 180V), Pole 2 collapsed (V < 50V)
    if (pole1.vr >= 180.0f && pole2.vr < 50.0f) {
        current_fault = FAULT_BROKEN_CONDUCTOR;
        fault_phase = "R";
        return;
    }
    if (pole1.isThreePhase && pole2.isThreePhase) {
        if (pole1.vy >= 180.0f && pole2.vy < 50.0f) {
            current_fault = FAULT_BROKEN_CONDUCTOR;
            fault_phase = "Y";
            return;
        }
        if (pole1.vb >= 180.0f && pole2.vb < 50.0f) {
            current_fault = FAULT_BROKEN_CONDUCTOR;
            fault_phase = "B";
            return;
        }

        // 4. Broken Neutral Check (Severe voltage unbalance spread)
        if (pole1.voltageUnbalancePct >= UNBALANCE_TRIP_PCT || pole2.voltageUnbalancePct >= UNBALANCE_TRIP_PCT) {
            current_fault = FAULT_BROKEN_NEUTRAL;
            fault_phase = "NEUTRAL";
            return;
        }
    }

    // 5. Differential Protection Check (Vegetation touch / illegal tapping leakage)
    bool p1_active = (pole1.vr > 50.0f && pole1.ir > 0.05f);
    bool p2_active = (pole2.vr > 50.0f && pole2.ir > 0.05f);

    if (p1_active && p2_active) {
        idiff_r = fabsf(pole1.ir - pole2.ir);
        current_idiff = idiff_r;

        if (idiff_r >= DIFF_CURRENT_THRESHOLD_A) {
            current_fault = FAULT_DIFFERENTIAL;
            fault_phase = "R";
            return;
        }
    }

    // If 3-phase, evaluate Y and B differential leakage
    if (pole1.isThreePhase && pole2.isThreePhase) {
        if (pole1.vy > 50.0f && pole2.vy > 50.0f) {
            idiff_y = fabsf(pole1.iy - pole2.iy);
            if (idiff_y >= DIFF_CURRENT_THRESHOLD_A) {
                current_fault = FAULT_DIFFERENTIAL;
                current_idiff = idiff_y;
                fault_phase = "Y";
                return;
            }
        }
        if (pole1.vb > 50.0f && pole2.vb > 50.0f) {
            idiff_b = fabsf(pole1.ib - pole2.ib);
            if (idiff_b >= DIFF_CURRENT_THRESHOLD_A) {
                current_fault = FAULT_DIFFERENTIAL;
                current_idiff = idiff_b;
                fault_phase = "B";
                return;
            }
        }
    }

    // 6. Overcurrent Protection Check
    if (pole1.ir >= OVERCURRENT_THRESHOLD_A || pole2.ir >= OVERCURRENT_THRESHOLD_A) {
        current_fault = FAULT_OVERCURRENT;
        fault_phase = "R";
        return;
    }
    if (pole1.isThreePhase && (pole1.iy >= OVERCURRENT_THRESHOLD_A || pole2.iy >= OVERCURRENT_THRESHOLD_A)) {
        current_fault = FAULT_OVERCURRENT;
        fault_phase = "Y";
        return;
    }
    if (pole1.isThreePhase && (pole1.ib >= OVERCURRENT_THRESHOLD_A || pole2.ib >= OVERCURRENT_THRESHOLD_A)) {
        current_fault = FAULT_OVERCURRENT;
        fault_phase = "B";
        return;
    }

    // 7. Voltage Sag / Swell Check
    if (pole1.vr > 10.0f && pole2.vr > 10.0f) {
        if (pole1.vr <= UNDERVOLTAGE_THRESHOLD_V || pole2.vr <= UNDERVOLTAGE_THRESHOLD_V) {
            current_fault = FAULT_UNDERVOLTAGE;
            fault_phase = "R";
            return;
        } else if (pole1.vr >= OVERVOLTAGE_THRESHOLD_V || pole2.vr >= OVERVOLTAGE_THRESHOLD_V) {
            current_fault = FAULT_OVERVOLTAGE;
            fault_phase = "R";
            return;
        }
    }
}

void streamFDIRJsonToHost() {
    uint32_t now = millis();
    const char* statusStr = (current_fault == FAULT_NONE) ? "OK" : ((current_fault == FAULT_POLE_OFFLINE) ? "WARN" : "ALERT");
    const char* faultStr  = faultTypeToString(current_fault);

    // Stream compact, full-fidelity JSON directly over USB Serial to host dashboard
    Serial.printf(
        "{\"gw_ms\":%lu,\"sec\":\"%s\",\"status\":\"%s\",\"fault\":\"%s\",\"fault_phase\":\"%s\",\"idiff\":%.3f,\"trip_limit\":%.3f,"
        "\"p1\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"freq\":%.1f,\"rssi\":%d,\"snr\":%d,\"relay\":%u,\"hops\":%u,\"age_ms\":%lu,\"mask\":%u,"
        "\"phases\":{\"r\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"LIVE\"},"
        "\"y\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"},"
        "\"b\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"}},"
        "\"in\":%.3f,\"unb\":%.1f},"
        "\"p2\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"freq\":%.1f,\"rssi\":%d,\"snr\":%d,\"relay\":%u,\"hops\":%u,\"age_ms\":%lu,\"mask\":%u,"
        "\"phases\":{\"r\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"LIVE\"},"
        "\"y\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"},"
        "\"b\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"}},"
        "\"in\":%.3f,\"unb\":%.1f}}\n",
        now,
        hw_crypto_active ? "AES128" : "NONE",
        statusStr,
        faultStr,
        fault_phase,
        current_idiff,
        DIFF_CURRENT_THRESHOLD_A,
        pole1.voltage, pole1.current, pole1.power, pole1.pf, pole1.frequency, pole1.rssi, pole1.snr, pole1.relayId, pole1.hops,
        pole1.hasData ? (now - pole1.lastUpdateMs) : 99999, pole1.phaseMask,
        pole1.vr, pole1.ir, pole1.pr, pole1.pfr,
        pole1.vy, pole1.iy, pole1.py, pole1.pfy, pole1.isThreePhase ? "LIVE" : "NOT_INSTRUMENTED",
        pole1.vb, pole1.ib, pole1.pb, pole1.pfb, pole1.isThreePhase ? "LIVE" : "NOT_INSTRUMENTED",
        pole1.neutralCurrent, pole1.voltageUnbalancePct,
        pole2.voltage, pole2.current, pole2.power, pole2.pf, pole2.frequency, pole2.rssi, pole2.snr, pole2.relayId, pole2.hops,
        pole2.hasData ? (now - pole2.lastUpdateMs) : 99999, pole2.phaseMask,
        pole2.vr, pole2.ir, pole2.pr, pole2.pfr,
        pole2.vy, pole2.iy, pole2.py, pole2.pfy, pole2.isThreePhase ? "LIVE" : "NOT_INSTRUMENTED",
        pole2.vb, pole2.ib, pole2.pb, pole2.pfb, pole2.isThreePhase ? "LIVE" : "NOT_INSTRUMENTED",
        pole2.neutralCurrent, pole2.voltageUnbalancePct
    );
}

void printConsoleSummary() {
    Serial.println("\n================================================================================");
    Serial.println("           GridSense Central Gateway - Polyphase FDIR Engine Status             ");
    Serial.println("================================================================================");
    Serial.printf(" Pole 1 (Incomer)  | Mask: 0x%02X | RSSI: %d dBm | Relay: Pole %u (Hops: %u)\n",
                  pole1.phaseMask, pole1.rssi, pole1.relayId, pole1.hops);
    Serial.printf("   Phase R: %.1f V | %.3f A | %.1f W\n", pole1.vr, pole1.ir, pole1.pr);
    if (pole1.isThreePhase) {
        Serial.printf("   Phase Y: %.1f V | %.3f A | %.1f W\n", pole1.vy, pole1.iy, pole1.py);
        Serial.printf("   Phase B: %.1f V | %.3f A | %.1f W\n", pole1.vb, pole1.ib, pole1.pb);
        Serial.printf("   Neutral: %.3f A | V-Unbalance: %.1f%%\n", pole1.neutralCurrent, pole1.voltageUnbalancePct);
    } else {
        Serial.println("   Phases Y & B: [NOT INSTRUMENTED - Single PZEM Live Setup]");
    }

    Serial.println("--------------------------------------------------------------------------------");
    Serial.printf(" Pole 2 (Outgoing) | Mask: 0x%02X | RSSI: %d dBm | Relay: Pole %u (Hops: %u)\n",
                  pole2.phaseMask, pole2.rssi, pole2.relayId, pole2.hops);
    Serial.printf("   Phase R: %.1f V | %.3f A | %.1f W\n", pole2.vr, pole2.ir, pole2.pr);
    if (pole2.isThreePhase) {
        Serial.printf("   Phase Y: %.1f V | %.3f A | %.1f W\n", pole2.vy, pole2.iy, pole2.py);
        Serial.printf("   Phase B: %.1f V | %.3f A | %.1f W\n", pole2.vb, pole2.ib, pole2.pb);
        Serial.printf("   Neutral: %.3f A | V-Unbalance: %.1f%%\n", pole2.neutralCurrent, pole2.voltageUnbalancePct);
    } else {
        Serial.println("   Phases Y & B: [NOT INSTRUMENTED - Single PZEM Live Setup]");
    }

    Serial.println("--------------------------------------------------------------------------------");
    Serial.printf(" Inter-Pole Diff (Idiff) : %.3f A (Phase %s) | Trip limit: %.3f A\n", 
                  current_idiff, fault_phase, DIFF_CURRENT_THRESHOLD_A);
    Serial.printf(" Central FDIR Decision   : [%s] - %s (Phase %s)\n",
                  (current_fault == FAULT_NONE) ? "NORMAL" : "TRIP/ALERT", faultTypeToString(current_fault), fault_phase);
    Serial.printf(" Security / Crypto Layer : ESP32-S3 Hardware AES-128 [%s]\n",
                  hw_crypto_active ? "ACTIVE" : "DISABLED");
    Serial.println("================================================================================\n");
}

void processIncomingPacket(const char* rawPacket, int16_t rssi, int8_t snr) {
    GridSensePacket pkt;
    int pole = 0;
    uint32_t seq = 0;
    uint8_t hops = 0;
    uint8_t relay = 0;
    uint8_t msgType = MSG_TYPE_TELEMETRY;
    uint8_t phaseMask = PHASE_MASK_R;
    char decryptedPayload[256];
    bool isEncrypted = false;
    const char* json = rawPacket;

    if (deserializeGridSensePacket(rawPacket, pkt)) {
        // Deduplication Table Check
        if (gatewayDeduplicator.isDuplicate(pkt.header.srcId, pkt.header.seq)) {
            Serial.printf("[GW DEDUP] Dropping duplicate packet from Pole %u (Seq %u | Hops: %u)\n",
                          pkt.header.srcId, pkt.header.seq, pkt.header.hopsTaken);
            return;
        }
        gatewayDeduplicator.record(pkt.header.srcId, pkt.header.seq);

        pole      = pkt.header.srcId;
        relay     = pkt.header.relayId;
        seq       = pkt.header.seq;
        hops      = pkt.header.hopsTaken;
        msgType   = pkt.header.msgType;
        phaseMask = pkt.header.phaseMask;

        // Attempt Hardware AES-128 Decryption
        isEncrypted = gridsense_decrypt_payload(pkt.payload, pkt.header.srcId, pkt.header.seq,
                                                decryptedPayload, sizeof(decryptedPayload));
        json = decryptedPayload;

        if (isEncrypted) {
            Serial.printf("[GW SECURITY] AES-128 Decrypted (Pole %u | Seq %u | Mask 0x%02X) >>> %s\n",
                          pkt.header.srcId, pkt.header.seq, phaseMask, json);
        }

        Serial.printf("[GW RX %s] Pole: %u | Relay: %u | Seq: %u | TTL: %u | Hops: %u | Mask: 0x%02X%s\n",
                      (pkt.header.protoVer == 2) ? "GS2" : "GS1",
                      pkt.header.srcId, pkt.header.relayId, pkt.header.seq, pkt.header.hopLimit, pkt.header.hopsTaken,
                      phaseMask, isEncrypted ? " [SEC: AES-128]" : "");
    } else {
        // Fallback for raw JSON
        pole  = parseJsonInt(rawPacket, "pole");
        relay = pole;
        seq   = parseJsonInt(rawPacket, "seq");
        if (pole == 0) return;
        json  = rawPacket;
    }

    // Emergency Outage Broadcast ("Last Gasp") handling
    if (msgType == MSG_TYPE_LAST_GASP) {
        float v_prev = parseJsonFloat(json, "v_prev");
        float i_prev = parseJsonFloat(json, "i_prev");

        Serial.printf(
            "{\"gw_ms\":%lu,\"type\":\"LAST_GASP\",\"pole\":%d,\"relay\":%u,\"hops\":%u,\"v_prev\":%.1f,\"i_prev\":%.3f,\"rssi\":%d,\"snr\":%d,\"status\":\"ALERT\",\"fault\":\"OUTAGE_LAST_GASP\",\"action\":\"DISPATCH_CREW_OUTAGE\"}\n",
            millis(), pole, relay, hops, v_prev, i_prev, rssi, snr
        );

        Serial.println("\n*******************************************************");
        Serial.printf(" [GW EMERGENCY] LAST GASP OUTAGE BROADCAST FROM POLE #%d!\n", pole);
        Serial.printf(" Relay: Pole #%u | Hops: %u | RSSI: %d dBm | Prior V: %.1fV | Prior I: %.3fA\n",
                      relay, hops, rssi, v_prev, i_prev);
        Serial.println(" Immediate Action: Lineman crew alerted for feeder section dispatch.");
        Serial.println("*******************************************************\n");
    }

    PoleTelemetry* target = (pole == 1) ? &pole1 : ((pole == 2) ? &pole2 : nullptr);
    if (!target) return;

    target->seq          = seq;
    target->voltage      = parseJsonFloat(json, "v");
    target->current      = parseJsonFloat(json, "i");
    target->power        = parseJsonFloat(json, "p");
    target->frequency    = parseJsonFloat(json, "freq");
    target->pf           = parseJsonFloat(json, "pf");
    target->energy       = parseJsonFloat(json, "e");
    target->rssi         = rssi;
    target->snr          = snr;
    target->lastUpdateMs = millis();
    target->hasData      = true;
    target->relayId      = relay;
    target->hops         = hops;
    target->phaseMask    = phaseMask;

    // Phase R assignment
    target->vr  = target->voltage;
    target->ir  = target->current;
    target->pr  = target->power;
    target->pfr = target->pf;

    // Check if packet contains 3-phase readings (compact "vy": or nested "phases")
    float vy = parseJsonFloat(json, "vy");
    float iy = parseJsonFloat(json, "iy");
    float py = parseJsonFloat(json, "py");
    float vb = parseJsonFloat(json, "vb");
    float ib = parseJsonFloat(json, "ib");
    float pb = parseJsonFloat(json, "pb");

    if (vy == 0.0f && strstr(json, "\"phases\"")) {
        vy = parseNestedJsonFloat(json, "phases", "y", "v");
        iy = parseNestedJsonFloat(json, "phases", "y", "i");
        py = parseNestedJsonFloat(json, "phases", "y", "p");
        vb = parseNestedJsonFloat(json, "phases", "b", "v");
        ib = parseNestedJsonFloat(json, "phases", "b", "i");
        pb = parseNestedJsonFloat(json, "phases", "b", "p");
    }

    if (vy > 10.0f || vb > 10.0f || (phaseMask & PHASE_MASK_3PHASE) == PHASE_MASK_3PHASE) {
        target->vy  = vy;
        target->iy  = iy;
        target->py  = py;
        target->pfy = target->pf;

        target->vb  = vb;
        target->ib  = ib;
        target->pb  = pb;
        target->pfb = target->pf;

        target->neutralCurrent      = parseJsonFloat(json, "in");
        target->voltageUnbalancePct = parseJsonFloat(json, "unb");
        target->isThreePhase        = true;
    } else {
        target->vy = 0.0f;
        target->iy = 0.0f;
        target->py = 0.0f;
        target->pfy = 0.0f;
        target->vb = 0.0f;
        target->ib = 0.0f;
        target->pb = 0.0f;
        target->pfb = 0.0f;
        target->neutralCurrent = target->current;
        target->voltageUnbalancePct = 0.0f;
        target->isThreePhase = false;
    }

    // Run Centralized FDIR Protection Evaluation
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
    Serial.println("   GridSense Central Gateway (Polyphase FDIR)     ");
    Serial.println("   Enterprise ADMS Sub-GHz Gateway (Protocol v2)  ");
    Serial.println("   MCA Project - FISAT                           ");
    Serial.println("**************************************************");

    hw_crypto_active = gridsense_crypto_init();
    if (hw_crypto_active) {
        Serial.println("[GW_INIT] ESP32-S3 Hardware AES-128 Crypto Engine: ACTIVE");
    } else {
        Serial.println("[GW_INIT] Hardware AES Crypto: Initialization Failed!");
    }

    lora_receiver_init();

    Serial.printf("[GW_INIT] Listening on %.1f MHz (IN865 LoRa Sub-GHz HF)...\n", (float)RF_FREQ_IN_HZ / 1000000.0f);
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

        Serial.printf("\n[GW RX RAW] Captured %u bytes (RSSI: %d dBm | SNR: %d dB): %s\n",
                      last_packet.length, last_packet.packet_rssi, last_packet.snr, (const char*)last_packet.payload);

        processIncomingPacket((const char*)last_packet.payload, last_packet.packet_rssi, last_packet.snr);
    }

    // Periodic heartbeat every 5 seconds if waiting for packets
    static uint32_t last_heartbeat_ms = 0;
    if (millis() - last_heartbeat_ms >= 5000) {
        last_heartbeat_ms = millis();
        if (total_packets == 0) {
            Serial.printf("[GW HEARTBEAT] Radio Active @ 866.3 MHz | Listening... (Packets: %lu | Pole 1: %s | Pole 2: %s)\n",
                          total_packets,
                          pole1.hasData ? "ONLINE" : "OFFLINE",
                          pole2.hasData ? "ONLINE" : "OFFLINE");
        }
    }

    delay(5);
}
