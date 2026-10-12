/*!
 * @file      Receiver_HF.ino
 * @brief     LoRa Receiver Sketch for Waveshare ESP32-S3-LR1121-HF
 * @details   Continuously listens for LoRa packets sent by Transmitter_HF.
 *            Extracts string payload and displays signal quality (RSSI, SNR).
 *            Blinks the onboard LED upon receiving each packet.
 *
 * IMPORTANT ARDUINO IDE SETTINGS:
 * - Board: "ESP32S3 Dev Module"
 * - USB CDC On Boot: "Enabled" (Required to see Serial Monitor prints!)
 * - Flash Size: 4MB (32Mb)
 * - Flash Mode: QIO 80MHz
 * - PSRAM: QSPI PSRAM
 * - Partition Scheme: Default 4MB with spiffs
 *
 * ANTENNA WARNING:
 * - Always attach the IPEX / SMA antenna to receive properly and protect the RF frontend!
 */

#include "lr1121_rx.h"

uint32_t received_count = 0;

void setup() 
{
    Serial.begin(115200);
    delay(2000); // Allow time for USB CDC serial to connect

    Serial.println("\n===========================================");
    Serial.println("  Waveshare ESP32-S3-LR1121-HF - Receiver  ");
    Serial.println("===========================================");

    // Initialize radio hardware and LR1121 receiver
    lora_receiver_init();

    Serial.println("\n[INFO] Receiver initialized successfully!");
    Serial.printf("[INFO] Listening on Frequency: %u MHz\n", (uint32_t)(RF_FREQ_IN_HZ / 1000000UL));
    Serial.println("[INFO] Waiting for incoming LoRa packets...\n");
}

void loop() 
{
    // Process radio interrupts
    lora_rx_irq_process();

    // Check if a new packet was received
    if (rx_packet_ready) 
    {
        rx_packet_ready = false;
        received_count++;

        Serial.println("--------------------------------------------------");
        Serial.printf("[RX #%u] Packet Received!\n", received_count);
        Serial.printf("  Length     : %u bytes\n", last_packet.length);
        Serial.printf("  Packet RSSI: %d dBm\n", last_packet.packet_rssi);
        Serial.printf("  Signal RSSI: %d dBm\n", last_packet.signal_rssi);
        Serial.printf("  SNR        : %d dB\n", last_packet.snr);

        // Print payload as string if printable
        bool is_ascii = true;
        for (int i = 0; i < last_packet.length; i++) {
            if (last_packet.payload[i] < 32 || last_packet.payload[i] > 126) {
                is_ascii = false;
                break;
            }
        }

        if (is_ascii && last_packet.length > 0) 
        {
            last_packet.payload[last_packet.length] = '\0';
            Serial.printf("  Payload (Text): \"%s\"\n", (char*)last_packet.payload);
        } 
        else 
        {
            Serial.print("  Payload (Hex) : ");
            for (int i = 0; i < last_packet.length; i++) {
                Serial.printf("%02X ", last_packet.payload[i]);
            }
            Serial.println();
        }
        Serial.println("--------------------------------------------------\n");
    }

    delay(5); // Small yield
}
