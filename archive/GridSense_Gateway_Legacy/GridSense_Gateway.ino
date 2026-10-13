/*!
 * @file      GridSense_Gateway.ino
 * @brief     GridSense LoRa-to-USB Gateway for ESP32-S3-LR1121-HF
 * @details   Continuously receives LoRa telemetry and FDIR alerts from GridSense Edge Nodes,
 *            appends RF reception metadata (RSSI, SNR, timestamp), and streams JSON over USB
 *            Serial to the host machine running the GridSense dashboard.
 *
 * @project   GridSense - MCA Project, FISAT
 */

#include "lr1121_rx.h"

uint32_t total_packets = 0;

void setup() {
    Serial.begin(115200);
    delay(2000); // Allow USB CDC enumeration

    Serial.println("\n=======================================================");
    Serial.println("         GridSense Gateway - LoRa USB Bridge           ");
    Serial.println("             MCA Project - FISAT                       ");
    Serial.println("=======================================================");

    lora_receiver_init();

    Serial.printf("[GW_INIT] Listening on %u MHz (LoRa Sub-GHz HF)...\n", (uint32_t)(RF_FREQ_IN_HZ / 1000000UL));
    Serial.println("[GW_INIT] Gateway is ready. Streaming JSON to host...\n");
}

void loop() {
    // Process LoRa RX interrupts
    lora_rx_irq_process();

    if (rx_packet_ready) {
        rx_packet_ready = false;
        total_packets++;

        // Ensure string is null-terminated
        if (last_packet.length < sizeof(last_packet.payload)) {
            last_packet.payload[last_packet.length] = '\0';
        } else {
            last_packet.payload[sizeof(last_packet.payload) - 1] = '\0';
        }

        // Stream JSON output over USB Serial to host dashboard
        // If the payload is already JSON (starts with '{' and ends with '}'), embed it directly
        char* rawPayload = (char*)last_packet.payload;
        if (rawPayload[0] == '{' && rawPayload[last_packet.length - 1] == '}') {
            Serial.printf("{\"gw_time\":%lu,\"rssi\":%d,\"snr\":%d,\"data\":%s}\n",
                          millis(), last_packet.packet_rssi, last_packet.snr, rawPayload);
        } else {
            Serial.printf("{\"gw_time\":%lu,\"rssi\":%d,\"snr\":%d,\"raw\":\"%s\"}\n",
                          millis(), last_packet.packet_rssi, last_packet.snr, rawPayload);
        }
    }

    delay(5);
}
