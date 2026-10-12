/*!
 * @file      Bidirectional_PingPong_HF.ino
 * @brief     Bidirectional LoRa Ping-Pong for Waveshare ESP32-S3-LR1121-HF
 * @details   One module acts as MASTER (sends PING, waits for PONG).
 *            The other module acts as SLAVE (waits for PING, replies with PONG).
 *            Measures round-trip time, Packet RSSI, Signal RSSI, and SNR.
 *
 * HOW TO USE:
 * 1. For Board 1: Leave "#define IS_MASTER 1", compile & upload.
 * 2. For Board 2: Change to "#define IS_MASTER 0", compile & upload.
 *
 * IMPORTANT ARDUINO IDE SETTINGS:
 * - Board: "ESP32S3 Dev Module"
 * - USB CDC On Boot: "Enabled"
 * - Flash Size: 4MB (32Mb)
 * - Flash Mode: QIO 80MHz
 * - PSRAM: QSPI PSRAM
 * - Partition Scheme: Default 4MB with spiffs
 */

#include "lr1121_config.h"

/* =========================================================================
 * ROLE SELECTION:
 * Set to 1 on Board 1 (Master)
 * Set to 0 on Board 2 (Slave/Responder)
 * ========================================================================= */
#define IS_MASTER 0

static volatile bool raw_irq_flag = false;
static uint32_t iteration = 0;
static unsigned long ping_sent_timestamp = 0;
static unsigned long last_ping_attempt = 0;

static lr11xx_radio_pkt_params_lora_t pingpong_pkt_params = {
    .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
    .header_type          = LORA_PKT_LEN_MODE,
    .pld_len_in_bytes     = PAYLOAD_LENGTH,
    .crc                  = LORA_CRC,
    .iq                   = LORA_IQ
};

void ARDUINO_ISR_ATTR radio_isr() {
    raw_irq_flag = true;
}

void enter_rx_mode(void) {
    pingpong_pkt_params.pld_len_in_bytes = PAYLOAD_LENGTH;
    lr11xx_radio_set_lora_pkt_params(&lr1121, &pingpong_pkt_params);

    lr11xx_system_set_dio_irq_params(&lr1121, 
        LR11XX_SYSTEM_IRQ_RX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_CRC_ERROR, 
        LR11XX_SYSTEM_IRQ_NONE);
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);
    
    // Set RX with timeout 3000ms
    lr11xx_radio_set_rx(&lr1121, 3000);
}

void transmit_packet(const char* text) {
    uint8_t tx_buf[PAYLOAD_LENGTH];
    memset(tx_buf, 0, sizeof(tx_buf));
    strncpy((char*)tx_buf, text, sizeof(tx_buf) - 1);

    lr11xx_system_set_dio_irq_params(&lr1121, 
        LR11XX_SYSTEM_IRQ_TX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT, 
        LR11XX_SYSTEM_IRQ_NONE);
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    pingpong_pkt_params.pld_len_in_bytes = PAYLOAD_LENGTH;
    lr11xx_radio_set_lora_pkt_params(&lr1121, &pingpong_pkt_params);
    lr11xx_regmem_write_buffer8(&lr1121, tx_buf, PAYLOAD_LENGTH);

    lr11xx_radio_set_tx(&lr1121, 0);

    digitalWrite(lr1121.led, LOW); // LED ON
}

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println("\n==============================================");
    #if IS_MASTER
    Serial.println("  ESP32-S3-LR1121-HF: MASTER NODE (Initiator) ");
    #else
    Serial.println("  ESP32-S3-LR1121-HF: SLAVE NODE (Responder)  ");
    #endif
    Serial.println("==============================================");

    lora_init_io_context(&lr1121);
    lora_init_io(&lr1121);
    lora_spi_init(&lr1121);

    lora_system_init(&lr1121);
    lora_print_version(&lr1121);
    lora_radio_init(&lr1121);
    lora_init_irq(&lr1121, radio_isr);

    #if IS_MASTER
    delay(1000);
    iteration++;
    char ping_msg[32];
    snprintf(ping_msg, sizeof(ping_msg), "PING #%u", iteration);
    Serial.printf("[MASTER] Sending initial \"%s\"...\n", ping_msg);
    ping_sent_timestamp = millis();
    transmit_packet(ping_msg);
    #else
    Serial.println("[SLAVE] Listening for PING from Master...");
    enter_rx_mode();
    #endif
}

void loop() {
    if (raw_irq_flag) {
        raw_irq_flag = false;
        lr11xx_system_irq_mask_t radio_irq = LR11XX_SYSTEM_IRQ_NONE;

        if (lr11xx_system_get_irq_status(&lr1121, &radio_irq) == LR11XX_STATUS_OK) {
            // --- TX DONE ---
            if ((radio_irq & LR11XX_SYSTEM_IRQ_TX_DONE) == LR11XX_SYSTEM_IRQ_TX_DONE) {
                lr11xx_system_clear_irq_status(&lr1121, radio_irq);
                digitalWrite(lr1121.led, HIGH); // LED OFF
                // After TX finishes, switch to RX to wait for response
                enter_rx_mode();
            }
            // --- RX DONE ---
            else if ((radio_irq & LR11XX_SYSTEM_IRQ_RX_DONE) == LR11XX_SYSTEM_IRQ_RX_DONE) {
                uint8_t rx_buf[PAYLOAD_LENGTH + 1];
                memset(rx_buf, 0, sizeof(rx_buf));
                
                lr11xx_radio_rx_buffer_status_t rx_buffer_status;
                lr11xx_radio_get_rx_buffer_status(&lr1121, &rx_buffer_status);
                lr11xx_regmem_read_buffer8(&lr1121, rx_buf, rx_buffer_status.buffer_start_pointer, rx_buffer_status.pld_len_in_bytes);

                lr11xx_radio_pkt_status_lora_t pkt_status;
                lr11xx_radio_get_lora_pkt_status(&lr1121, &pkt_status);

                lr11xx_system_clear_irq_status(&lr1121, radio_irq);

                #if IS_MASTER
                if (strncmp((char*)rx_buf, "PONG", 4) == 0) {
                    unsigned long rtt = millis() - ping_sent_timestamp;
                    Serial.printf("[MASTER] Received \"%s\" | RTT: %lu ms | RSSI: %d dBm | SNR: %d dB\n", 
                                  rx_buf, rtt, pkt_status.rssi_pkt_in_dbm, pkt_status.snr_pkt_in_db);
                    
                    delay(1500); // Pace pings
                    iteration++;
                    char ping_msg[32];
                    snprintf(ping_msg, sizeof(ping_msg), "PING #%u", iteration);
                    Serial.printf("\n[MASTER] Sending \"%s\"...\n", ping_msg);
                    ping_sent_timestamp = millis();
                    transmit_packet(ping_msg);
                }
                #else
                if (strncmp((char*)rx_buf, "PING", 4) == 0) {
                    Serial.printf("[SLAVE] Received \"%s\" | RSSI: %d dBm | SNR: %d dB\n", 
                                  rx_buf, pkt_status.rssi_pkt_in_dbm, pkt_status.snr_pkt_in_db);
                    
                    delay(200); // Small turnaround delay
                    char pong_msg[32];
                    snprintf(pong_msg, sizeof(pong_msg), "PONG %s", (char*)rx_buf + 5);
                    Serial.printf("[SLAVE] Replying \"%s\"...\n", pong_msg);
                    transmit_packet(pong_msg);
                }
                #endif
            }
            // --- TIMEOUT ---
            else if ((radio_irq & LR11XX_SYSTEM_IRQ_TIMEOUT) == LR11XX_SYSTEM_IRQ_TIMEOUT) {
                lr11xx_system_clear_irq_status(&lr1121, radio_irq);
                #if IS_MASTER
                Serial.println("[MASTER] RX Timeout (No PONG received). Retrying...");
                delay(1000);
                iteration++;
                char ping_msg[32];
                snprintf(ping_msg, sizeof(ping_msg), "PING #%u", iteration);
                ping_sent_timestamp = millis();
                transmit_packet(ping_msg);
                #else
                enter_rx_mode();
                #endif
            }
            else {
                lr11xx_system_clear_irq_status(&lr1121, radio_irq);
                enter_rx_mode();
            }
        }
    }

    #if IS_MASTER
    // Failsafe watchdog if no IRQ triggered for 6 seconds
    if (millis() - ping_sent_timestamp > 6000) {
        Serial.println("[MASTER] Watchdog trigger: restarting Ping...");
        iteration++;
        char ping_msg[32];
        snprintf(ping_msg, sizeof(ping_msg), "PING #%u", iteration);
        ping_sent_timestamp = millis();
        transmit_packet(ping_msg);
    }
    #endif

    delay(10);
}
