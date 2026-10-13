/*!
 * @file      lr1121_lbt_tx.cpp
 * @brief     Implementation of Node Transceiver with LBT CAD TX and Background Relay RX
 * @project   GridSense - MCA Project, FISAT
 */

#include "lr1121_lbt_tx.h"

volatile bool node_rx_ready = false;
LoRaRxPacketInfo last_node_rx_packet;

volatile bool tx_done_flag = false;
volatile bool tx_timeout_flag = false;
static volatile bool raw_irq_flag = false;

#define RADIO_IRQ_MASK (LR11XX_SYSTEM_IRQ_TX_DONE | LR11XX_SYSTEM_IRQ_RX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_CRC_ERROR | LR11XX_SYSTEM_IRQ_HEADER_ERROR)

static lr11xx_radio_pkt_params_lora_t tx_pkt_params = {
    .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
    .header_type          = LORA_PKT_LEN_MODE,
    .pld_len_in_bytes     = PAYLOAD_LENGTH,
    .crc                  = LORA_CRC,
    .iq                   = LORA_IQ
};

static lr11xx_radio_pkt_params_lora_t rx_pkt_params = {
    .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
    .header_type          = LORA_PKT_LEN_MODE,
    .pld_len_in_bytes     = 255,
    .crc                  = LORA_CRC,
    .iq                   = LORA_IQ
};

// Hardware CAD configuration parameters (optimized for SF7 / BW 125kHz)
static lr11xx_radio_cad_params_t cad_params = {
    .cad_symb_nb     = 2,                                    // 2 symbols for fast, accurate CAD
    .cad_detect_peak = 48,                                   // Sensitivity peak threshold
    .cad_detect_min  = 10,                                   // Detection minimum
    .cad_exit_mode   = LR11XX_RADIO_CAD_EXIT_MODE_STANDBYRC, // Fallback to standby after detection
    .cad_timeout     = 0,
};

static void ARDUINO_ISR_ATTR radio_isr() {
    raw_irq_flag = true;
}

void lora_start_node_rx(void)
{
    lr11xx_radio_set_lora_pkt_params(&lr1121, &rx_pkt_params);
    lr11xx_system_set_dio_irq_params(&lr1121, RADIO_IRQ_MASK, LR11XX_SYSTEM_IRQ_NONE);
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    lr11xx_radio_set_rx(&lr1121, 0); // Continuous RX mode
    digitalWrite(lr1121.led, HIGH);
}

void lora_node_radio_init(void)
{
    lora_init_io_context( &lr1121 );
    lora_init_io( &lr1121 );
    lora_spi_init( &lr1121 );

    lora_system_init( &lr1121 );
    lora_print_version( &lr1121 );
    lora_radio_init( &lr1121 );

    // Configure CAD parameters on the LR1121 transceiver
    lr11xx_radio_set_cad_params( &lr1121, &cad_params );

    lora_init_irq( &lr1121, radio_isr );
    lora_start_node_rx();
}

bool lora_is_channel_busy(void)
{
    lr11xx_system_set_dio_irq_params(
        &lr1121,
        LR11XX_SYSTEM_IRQ_CAD_DONE | LR11XX_SYSTEM_IRQ_CAD_DETECTED,
        LR11XX_SYSTEM_IRQ_NONE
    );
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    lr11xx_radio_set_cad(&lr1121);

    uint32_t start_ms = millis();
    lr11xx_system_irq_mask_t irq_status = LR11XX_SYSTEM_IRQ_NONE;

    while ((millis() - start_ms) < 40) {
        if (lr11xx_system_get_irq_status(&lr1121, &irq_status) == LR11XX_STATUS_OK) {
            if ((irq_status & LR11XX_SYSTEM_IRQ_CAD_DONE) == LR11XX_SYSTEM_IRQ_CAD_DONE) {
                bool is_detected = ((irq_status & LR11XX_SYSTEM_IRQ_CAD_DETECTED) == LR11XX_SYSTEM_IRQ_CAD_DETECTED);
                lr11xx_system_clear_irq_status(&lr1121, irq_status);
                return is_detected; // true = channel busy
            }
        }
        delay(1);
    }

    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);
    return false;
}

static void lora_execute_tx(const uint8_t* payload, uint8_t length)
{
    tx_done_flag = false;
    tx_timeout_flag = false;

    lr11xx_system_set_dio_irq_params(
        &lr1121,
        LR11XX_SYSTEM_IRQ_TX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT,
        LR11XX_SYSTEM_IRQ_NONE
    );
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    tx_pkt_params.pld_len_in_bytes = length;
    lr11xx_radio_set_lora_pkt_params(&lr1121, &tx_pkt_params);
    lr11xx_regmem_write_buffer8(&lr1121, payload, length);

    lr11xx_radio_set_tx(&lr1121, 0);
    digitalWrite(lr1121.led, LOW); // Active Low LED ON during TX

    // Wait synchronously for TX completion (typically 25-45 ms for SF7/125kHz)
    uint32_t t_start = millis();
    lr11xx_system_irq_mask_t status = LR11XX_SYSTEM_IRQ_NONE;

    while ((millis() - t_start) < 250) {
        if (lr11xx_system_get_irq_status(&lr1121, &status) == LR11XX_STATUS_OK) {
            if (status & LR11XX_SYSTEM_IRQ_TX_DONE) {
                lr11xx_system_clear_irq_status(&lr1121, status);
                tx_done_flag = true;
                break;
            } else if (status & LR11XX_SYSTEM_IRQ_TIMEOUT) {
                lr11xx_system_clear_irq_status(&lr1121, status);
                tx_timeout_flag = true;
                break;
            }
        }
        delay(2);
    }

    digitalWrite(lr1121.led, HIGH); // LED OFF

    // Return radio immediately to background RX mode
    lora_start_node_rx();
}

bool lora_send_with_lbt(const char* message, uint8_t maxRetries, uint32_t minBackoffMs, uint32_t maxBackoffMs)
{
    uint8_t len = strlen(message);

    for (uint8_t attempt = 0; attempt <= maxRetries; attempt++) {
        // Step 1: Check Channel Activity Detection (CAD)
        if (lora_is_channel_busy()) {
            uint32_t backoff = random(minBackoffMs, maxBackoffMs);
            Serial.printf("[LBT CAD] Channel BUSY! Backing off %u ms (Retry %d/%d)...\n",
                          backoff, attempt + 1, maxRetries);
            delay(backoff);
        } else {
            // Step 2: Channel clear, transmit!
            lora_execute_tx((const uint8_t*)message, len);
            return true;
        }
    }

    // Fallback: If channel remained busy after all retries, force transmit
    Serial.println("[LBT CAD] Channel persistently busy. Force transmitting...");
    lora_execute_tx((const uint8_t*)message, len);
    return false;
}

void lora_node_radio_irq_process(void)
{
    if (!raw_irq_flag) return;
    raw_irq_flag = false;

    lr11xx_system_irq_mask_t radio_irq = LR11XX_SYSTEM_IRQ_NONE;
    if(lr11xx_system_get_irq_status(&lr1121, &radio_irq) != LR11XX_STATUS_OK)
    {
        return;
    }

    radio_irq &= RADIO_IRQ_MASK;

    if((radio_irq & LR11XX_SYSTEM_IRQ_RX_DONE) == LR11XX_SYSTEM_IRQ_RX_DONE)
    {
        lr11xx_radio_rx_buffer_status_t rx_buffer_status;
        lr11xx_radio_pkt_status_lora_t  pkt_status;

        lr11xx_radio_get_rx_buffer_status(&lr1121, &rx_buffer_status);
        last_node_rx_packet.length = rx_buffer_status.pld_len_in_bytes;

        memset(last_node_rx_packet.payload, 0, sizeof(last_node_rx_packet.payload));
        lr11xx_regmem_read_buffer8(&lr1121, last_node_rx_packet.payload, 
                                   rx_buffer_status.buffer_start_pointer, 
                                   last_node_rx_packet.length);

        lr11xx_radio_get_lora_pkt_status(&lr1121, &pkt_status);
        last_node_rx_packet.packet_rssi = pkt_status.rssi_pkt_in_dbm;
        last_node_rx_packet.snr         = pkt_status.snr_pkt_in_db;

        node_rx_ready = true;

        digitalWrite(lr1121.led, LOW);
        delay(15);
        digitalWrite(lr1121.led, HIGH);

        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_node_rx();
    }
    else if((radio_irq & LR11XX_SYSTEM_IRQ_TIMEOUT) == LR11XX_SYSTEM_IRQ_TIMEOUT)
    {
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_node_rx();
    }
    else
    {
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
    }
}
