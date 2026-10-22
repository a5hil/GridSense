/*!
 * @file      EdgeNode_Pole.ino
 * @brief     GridSense Pole Edge Node Firmware (IMeter Abstraction + Protocol v2 Multi-Phase)
 * @details   Supports:
 *            - METER_MODE_SINGLE_PZEM: 1x physical PZEM-004T v4.0 on Phase R (Y & B uninstrumented)
 *            - METER_MODE_MULTI_PZEM:  3x physical PZEM-004T v4.0 multi-drop on Serial1 (Addrs 0x01, 0x02, 0x03)
 *            - METER_MODE_MOCK_3PHASE: 3-phase Indian grid bench synthesizer with fault injection
 *
 *            Transmits telemetry to Central Gateway via Sub-GHz LoRa using Listen-Before-Talk (LBT)
 *            with Channel Activity Detection (CAD) and random backoff jitter (100-1500 ms).
 *
 * @project   GridSense - MCA Project, FISAT
 *
 * HOW TO FLASH:
 * - For Electric Pole 1 (Incomer): Set "#define POLE_ID 1", compile & upload.
 * - For Electric Pole 2 (Outgoing): Set "#define POLE_ID 2", compile & upload.
 *
 * HARDWARE CONNECTIONS (When using physical PZEMs):
 * - PZEM TX -> ESP32-S3 GPIO 17 (Serial1 RX)
 * - PZEM RX -> ESP32-S3 GPIO 18 (Serial1 TX)
 * - PZEM 5V -> 5V / VBUS (Drives internal optocouplers)
 * - PZEM GND -> GND
 * - Split CT clamp -> Live AC Phase wire on this pole
 */

#include "IMeter.h"
#include "PZEM_Drivers.h"
#include "lr1121_lbt_tx.h"
#include "pole_ble_service.h"
#include "gridsense_packet.h"
#include "gridsense_crypto.h"

PacketDeduplicator deduplicator;

/* =========================================================================
 * POLE SELECTION, ROLE & METER MODE CONFIGURATION
 * ========================================================================= */
enum NodeRole {
    ROLE_ENDPOINT = 0,  // Leaf pole: monitors own AC line & transmits
    ROLE_REPEATER = 1   // Relay pole: monitors own line + relays downstream packets
};

#define POLE_ID                     2       // Set to 1 for Pole 1, set to 2 for Pole 2
#define NODE_ROLE                   (POLE_ID == 1 ? ROLE_REPEATER : ROLE_ENDPOINT)

// Metering Sensor Driver Selection
#define METER_MODE_SINGLE_PZEM      0       // 1x Physical PZEM-004T on Phase R (User's real hardware setup)
#define METER_MODE_MULTI_PZEM       1       // 3x Physical PZEM-004T multi-drop on Serial1 (Addrs 0x01, 0x02, 0x03)
#define METER_MODE_MOCK_3PHASE      2       // 3-Phase Polyphase bench synthesizer with fault injection

#define ACTIVE_METER_MODE           METER_MODE_SINGLE_PZEM  // Set to METER_MODE_SINGLE_PZEM for live hardware

#define TELEMETRY_INTERVAL_MS       3000    // Telemetry transmission interval (3 seconds)
#define ENABLE_BLE_LINEMAN_ACCESS   true    // Enable Bluetooth Low Energy for field technicians
#define ENABLE_AES_ENCRYPTION       true    // Enable Hardware-Accelerated AES-128 payload encryption

/* =========================================================================
 * HARDWARE PINOUT (HardwareSerial1)
 * ========================================================================= */
#define PZEM_RX_PIN                 17      // Connects to PZEM TX
#define PZEM_TX_PIN                 18      // Connects to PZEM RX

// Driver instances
SinglePZEMMeter singlePzemMeter(Serial1, PZEM_RX_PIN, PZEM_TX_PIN, 0xF8);
MultiPZEMMeter  multiPzemMeter(Serial1, PZEM_RX_PIN, PZEM_TX_PIN, 0x01, 0x02, 0x03);
Mock3PhaseMeter mock3PhaseMeter(POLE_ID);

IMeter* activeMeter = nullptr;
uint8_t currentMeterMode = ACTIVE_METER_MODE;
ThreePhaseReadings latestReadings;

// Telemetry state tracking
uint32_t packet_seq = 0;
unsigned long last_tx_ms = 0;
float last_known_voltage = 230.0f;
float last_known_current = 2.45f;
bool last_gasp_broadcast_sent = false;

const char* getMeterModeString(uint8_t mode) {
    switch (mode) {
        case METER_MODE_SINGLE_PZEM: return "SINGLE_PZEM (Phase R Live)";
        case METER_MODE_MULTI_PZEM:  return "MULTI_PZEM (3x Modbus RTU)";
        case METER_MODE_MOCK_3PHASE: return "MOCK_3PHASE (Polyphase Synth)";
        default:                     return "UNKNOWN";
    }
}

void selectMeter(uint8_t mode) {
    currentMeterMode = mode;
    switch (mode) {
        case METER_MODE_SINGLE_PZEM:
            activeMeter = &singlePzemMeter;
            break;
        case METER_MODE_MULTI_PZEM:
            activeMeter = &multiPzemMeter;
            break;
        case METER_MODE_MOCK_3PHASE:
        default:
            activeMeter = &mock3PhaseMeter;
            break;
    }
    activeMeter->begin();
}

void sendLastGaspBroadcast(float last_v, float last_i) {
    packet_seq++;

    char dyingJson[160];
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
    pkt.header.phaseMask = (activeMeter->getInstrumentedPhaseCount() == 3) ? PHASE_MASK_3PHASE : PHASE_MASK_R;
    pkt.header.protoVer  = 2;

    #if ENABLE_AES_ENCRYPTION
    char encBuf[256];
    if (gridsense_encrypt_payload(dyingJson, POLE_ID, (uint16_t)packet_seq, encBuf, sizeof(encBuf))) {
        strncpy(pkt.payload, encBuf, sizeof(pkt.payload) - 1);
    } else {
        strncpy(pkt.payload, dyingJson, sizeof(pkt.payload) - 1);
    }
    #else
    strncpy(pkt.payload, dyingJson, sizeof(pkt.payload) - 1);
    #endif
    pkt.payload[sizeof(pkt.payload) - 1] = '\0';

    char loraTxBuf[300];
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
        mock3PhaseMeter.setScenario(MOCK3P_NORMAL);
        last_gasp_broadcast_sent = false;
        Serial.println("\n[CMD] Set MOCK3P_NORMAL (Normal Balanced Grid Operation)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Mode set to NORMAL.\n");
        #endif
    } else if (ch == 'd' || ch == 'D') {
        mock3PhaseMeter.setScenario(MOCK3P_DIFFERENTIAL_FAULT);
        Serial.println("\n[CMD] Set MOCK3P_DIFFERENTIAL_FAULT (Phase R line leakage/tapping)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected DIFFERENTIAL FAULT.\n");
        #endif
    } else if (ch == 'y' || ch == 'Y') {
        mock3PhaseMeter.setScenario(MOCK3P_BROKEN_CONDUCTOR);
        Serial.println("\n[CMD] Set MOCK3P_BROKEN_CONDUCTOR (Phase Y downstream snap)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected BROKEN CONDUCTOR (Phase Y).\n");
        #endif
    } else if (ch == 'b' || ch == 'B') {
        mock3PhaseMeter.setScenario(MOCK3P_BROKEN_NEUTRAL);
        Serial.println("\n[CMD] Set MOCK3P_BROKEN_NEUTRAL (Neutral shift 180V/270V/235V)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected BROKEN NEUTRAL.\n");
        #endif
    } else if (ch == 'o' || ch == 'O') {
        mock3PhaseMeter.setScenario(MOCK3P_OVERCURRENT);
        Serial.println("\n[CMD] Set MOCK3P_OVERCURRENT (Overload > 16A)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected OVERCURRENT.\n");
        #endif
    } else if (ch == 'u' || ch == 'U') {
        mock3PhaseMeter.setScenario(MOCK3P_BROKEN_NEUTRAL);
        Serial.println("\n[CMD] Injected Voltage Sag/Spread");
    } else if (ch == 'p' || ch == 'P') {
        mock3PhaseMeter.setScenario(MOCK3P_POWERCUT);
        Serial.println("\n[CMD] Set MOCK3P_POWERCUT (0V / 0A De-energized Outage)");
        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEMessage("[ALERT] Injected POWERCUT / OUTAGE (0V).\n");
        #endif
        if (!last_gasp_broadcast_sent) {
            float v_rep = (latestReadings.r().isValid && latestReadings.r().voltage > 10.0f)
                          ? latestReadings.r().voltage : last_known_voltage;
            float i_rep = (latestReadings.r().isValid && latestReadings.r().current > 0.01f)
                          ? latestReadings.r().current : last_known_current;
            sendLastGaspBroadcast(v_rep, i_rep);
            last_gasp_broadcast_sent = true;
        }
    } else if (ch == 'a' || ch == 'A') {
        mock3PhaseMeter.setScenario(MOCK3P_AUTO_CYCLE);
        last_gasp_broadcast_sent = false;
        Serial.println("\n[CMD] Switched to MOCK3P_AUTO_CYCLE (Periodic fault cycling)");
    } else if (ch == 'm' || ch == 'M') {
        // Toggle driver between Single PZEM and Mock 3-Phase
        uint8_t nextMode = (currentMeterMode == METER_MODE_SINGLE_PZEM) ? METER_MODE_MOCK_3PHASE : METER_MODE_SINGLE_PZEM;
        selectMeter(nextMode);
        Serial.printf("\n[CMD] Switched Driver Mode: %s\n", getMeterModeString(currentMeterMode));
    }
}

void processSerialCommands() {
    if (Serial.available()) {
        char ch = Serial.read();
        handleCommand(ch);
    }
}

void printDiagnostics() {
    Serial.println("--------------------------------------------------------------------------------");
    Serial.printf(" [Electric Pole #%d] Driver: %s | Protocol: v2 (GS2)\n",
                  POLE_ID, activeMeter->getDriverName());

    const PhaseReading& r = latestReadings.r();
    const PhaseReading& y = latestReadings.y();
    const PhaseReading& b = latestReadings.b();

    Serial.printf("  Phase R : V: %.1f V | I: %.3f A | P: %.1f W | PF: %.2f | %s\n",
                  r.voltage, r.current, r.power, r.pf, r.isInstrumented ? "LIVE [PZEM]" : "NOT_INSTRUMENTED");

    if (activeMeter->getInstrumentedPhaseCount() == 3) {
        Serial.printf("  Phase Y : V: %.1f V | I: %.3f A | P: %.1f W | PF: %.2f | %s\n",
                      y.voltage, y.current, y.power, y.pf, y.isInstrumented ? "LIVE [PZEM]" : "NOT_INSTRUMENTED");
        Serial.printf("  Phase B : V: %.1f V | I: %.3f A | P: %.1f W | PF: %.2f | %s\n",
                      b.voltage, b.current, b.power, b.pf, b.isInstrumented ? "LIVE [PZEM]" : "NOT_INSTRUMENTED");
        Serial.printf("  Summary : Neutral: %.3f A | V-Unbalance: %.1f%% | I-Unbalance: %.1f%%\n",
                      latestReadings.neutralCurrent, latestReadings.voltageUnbalancePct, latestReadings.currentUnbalancePct);
    } else {
        Serial.println("  Phase Y : [NOT INSTRUMENTED - Single PZEM Demo Setup]");
        Serial.println("  Phase B : [NOT INSTRUMENTED - Single PZEM Demo Setup]");
    }
    Serial.println("--------------------------------------------------------------------------------");
}

void setup() {
    Serial.begin(115200);
    delay(2000); // Allow USB CDC enumeration

    Serial.println("\n**************************************************");
    Serial.printf("   GridSense FDIR Prototype - Electric Pole #%d\n", POLE_ID);
    Serial.println("   Enterprise ADMS & Sub-GHz LoRa Mesh System    ");
    Serial.println("   MCA Project - FISAT                           ");
    Serial.println("**************************************************");

    // Initialize Meter Driver
    selectMeter(ACTIVE_METER_MODE);
    Serial.printf("[INIT] Meter Driver Active: %s\n", activeMeter->getDriverName());

    #if ENABLE_BLE_LINEMAN_ACCESS
    Serial.println("[INIT] BLE Lineman Smartphone Access: ENABLED");
    initPoleBLE(POLE_ID, handleCommand);
    #endif

    #if ENABLE_AES_ENCRYPTION
    if (gridsense_crypto_init()) {
        Serial.println("[INIT] ESP32-S3 Hardware AES-128 Crypto Engine: ACTIVE");
    } else {
        Serial.println("[INIT] Hardware AES Crypto: Init Failed!");
    }
    #endif

    Serial.printf("[INIT] Pole Role: %s\n",
                  (NODE_ROLE == ROLE_REPEATER) ? "REPEATER (Relays downstream poles)" : "ENDPOINT (Leaf node)");

    // Initialize LR1121 Transceiver with Hardware CAD support
    Serial.println("[INIT] Initializing Waveshare LR1121 Sub-GHz LoRa Transceiver...");
    lora_node_radio_init();

    Serial.printf("[INIT] Ready. Frequency: %.1f MHz (IN865) | Output: %d dBm\n\n",
                  (float)RF_FREQ_IN_HZ / 1000000.0f, TX_OUTPUT_POWER_DBM);

    // Stagger initial transmission phase between Pole 1 and Pole 2 to eliminate RF collision
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

        char relayBuf[300];
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

    processSerialCommands();

    unsigned long current_ms = millis();

    if (current_ms - last_tx_ms >= TELEMETRY_INTERVAL_MS) {
        last_tx_ms = current_ms;
        packet_seq++;

        float prev_v = latestReadings.r().voltage;
        float prev_i = latestReadings.r().current;

        // Poll readings from active meter driver
        activeMeter->read(latestReadings);

        const PhaseReading& r = latestReadings.r();
        const PhaseReading& y = latestReadings.y();
        const PhaseReading& b = latestReadings.b();

        // Track last known healthy voltage & current on Phase R
        if (r.isValid && r.voltage >= 150.0f) {
            last_known_voltage = r.voltage;
            last_known_current = r.current;
            last_gasp_broadcast_sent = false;
        }

        // Automatic voltage collapse detection (e.g. real AC mains cut or feeder trip)
        if (r.isValid && prev_v >= 150.0f && r.voltage < 50.0f && !last_gasp_broadcast_sent) {
            sendLastGaspBroadcast(prev_v, prev_i);
            last_gasp_broadcast_sent = true;
        }

        printDiagnostics();

        #if ENABLE_BLE_LINEMAN_ACCESS
        sendPoleBLEData(r.voltage, r.current, r.power,
                        r.frequency, r.pf, r.energy,
                        "ACTIVE");
        #endif

        // Format Protocol v2 Inner JSON Telemetry Payload
        char innerJson[240];

        if (activeMeter->getInstrumentedPhaseCount() == 3) {
            // Polyphase 3-Phase telemetry payload
            snprintf(innerJson, sizeof(innerJson),
                "{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"freq\":%.1f,\"pf\":%.2f,\"e\":%.1f,"
                "\"phases\":{\"r\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"},"
                "\"y\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"},"
                "\"b\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"%s\"}},"
                "\"in\":%.3f,\"unb\":%.1f}",
                r.voltage, r.current, r.power, r.frequency, r.pf, r.energy,
                r.voltage, r.current, r.power, r.pf, r.isInstrumented ? "LIVE" : "SIM",
                y.voltage, y.current, y.power, y.pf, y.isInstrumented ? "LIVE" : "SIM",
                b.voltage, b.current, b.power, b.pf, b.isInstrumented ? "LIVE" : "SIM",
                latestReadings.neutralCurrent, latestReadings.voltageUnbalancePct
            );
        } else {
            // Single-Phase Phase R hardware live payload (backwards-compatible with v1 schema)
            snprintf(innerJson, sizeof(innerJson),
                "{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"freq\":%.1f,\"pf\":%.2f,\"e\":%.1f,"
                "\"ph\":\"R\",\"phases\":{\"r\":{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"pf\":%.2f,\"src\":\"LIVE\"},"
                "\"y\":{\"v\":0.0,\"i\":0.0,\"p\":0.0,\"pf\":0.0,\"src\":\"NOT_INSTRUMENTED\"},"
                "\"b\":{\"v\":0.0,\"i\":0.0,\"p\":0.0,\"pf\":0.0,\"src\":\"NOT_INSTRUMENTED\"}}}",
                r.voltage, r.current, r.power, r.frequency, r.pf, r.energy,
                r.voltage, r.current, r.power, r.pf
            );
        }

        // Wrap into Hop-Limited GridSense Packet with TTL & Deduplication info
        GridSensePacket pkt;
        pkt.header.srcId     = POLE_ID;
        pkt.header.relayId   = POLE_ID;
        pkt.header.destId    = 0x00; // Target Gateway
        pkt.header.seq       = (uint16_t)packet_seq;
        pkt.header.hopLimit  = 3;    // TTL = 3 hops max
        pkt.header.hopsTaken = 0;    // 0 hops initially
        pkt.header.msgType   = MSG_TYPE_TELEMETRY;
        pkt.header.phaseMask = (activeMeter->getInstrumentedPhaseCount() == 3) ? PHASE_MASK_3PHASE : PHASE_MASK_R;
        pkt.header.protoVer  = 2;

        #if ENABLE_AES_ENCRYPTION
        char encBuf[256];
        if (gridsense_encrypt_payload(innerJson, POLE_ID, (uint16_t)packet_seq, encBuf, sizeof(encBuf))) {
            strncpy(pkt.payload, encBuf, sizeof(pkt.payload) - 1);
        } else {
            strncpy(pkt.payload, innerJson, sizeof(pkt.payload) - 1);
        }
        #else
        strncpy(pkt.payload, innerJson, sizeof(pkt.payload) - 1);
        #endif
        pkt.payload[sizeof(pkt.payload) - 1] = '\0';

        char loraTxBuf[300];
        serializeGridSensePacket(pkt, loraTxBuf, sizeof(loraTxBuf));

        // Record our sequence in the local deduplication cache
        deduplicator.record(POLE_ID, (uint16_t)packet_seq);

        Serial.printf("[POLE #%d TX #%u | Mask: 0x%02X | TTL: %d] Checking channel & sending...\n",
                      POLE_ID, packet_seq, pkt.header.phaseMask, pkt.header.hopLimit);

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
