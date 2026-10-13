/*!
 * @file      Transmitter_HF.ino
 * @brief     LoRa Transmitter Sketch for Waveshare ESP32-S3-LR1121-HF
 * @details   Sends a LoRa data packet periodically (every 3 seconds).
 *            Blinks the onboard LED during transmission and logs status.
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
 * - Always attach the IPEX / SMA antenna before transmitting to avoid damaging the RF power amplifier!
 */

#include "lr1121_tx.h"

uint32_t packet_counter = 0;
unsigned long last_tx_time = 0;
const unsigned long TX_INTERVAL_MS = 3000; // Transmit every 3 seconds

void setup() 
{
    // Initialize serial communication
    Serial.begin(115200);
    delay(2000); // Allow time for USB CDC serial to connect

    Serial.println("\n==============================================");
    Serial.println("  Waveshare ESP32-S3-LR1121-HF - Transmitter  ");
    Serial.println("==============================================");

    // Initialize radio hardware and LR1121 subsystem
    lora_transmitter_init();

    Serial.println("\n[INFO] Radio initialized successfully!");
    Serial.printf("[INFO] Frequency: %u MHz | Output Power: %d dBm\n", 
                  (uint32_t)(RF_FREQ_IN_HZ / 1000000UL), TX_OUTPUT_POWER_DBM);
    Serial.println("[INFO] Ready to transmit packets...\n");
}

void loop() 
{
    // Always process any pending radio interrupts
    lora_tx_irq_process();

    if (tx_done_flag) 
    {
        tx_done_flag = false;
        Serial.printf("[TX DONE] Packet #%u sent successfully!\n\n", packet_counter);
    }

    if (tx_timeout_flag)
    {
        tx_timeout_flag = false;
        Serial.printf("[TX TIMEOUT] Packet #%u transmission timed out!\n\n", packet_counter);
    }

    // Check if it's time to send the next packet
    unsigned long current_time = millis();
    if (current_time - last_tx_time >= TX_INTERVAL_MS) 
    {
        last_tx_time = current_time;
        packet_counter++;

        // Prepare message payload
        char message[64];
        snprintf(message, sizeof(message), "GridSense Node-01 | Pkt: %u | Up: %lus", 
                 packet_counter, current_time / 1000);

        Serial.printf("[TX START] Sending: \"%s\" (Length: %u bytes)...\n", 
                      message, (unsigned int)strlen(message));

        lora_send_string(message);
    }

    delay(10); // Small yield
}
