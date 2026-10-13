/*!
 * @file      lr1121_rx.cpp
 * @brief     Receiver helper implementation for ESP32-S3-LR1121-HF
 */

#include "lr1121_rx.h"

volatile bool rx_packet_ready = false;
static volatile bool raw_irq_flag = false;
LoRaPacketInfo last_packet;

#define RX_IRQ_MASK (LR11XX_SYSTEM_IRQ_RX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_CRC_ERROR | LR11XX_SYSTEM_IRQ_HEADER_ERROR)

static lr11xx_radio_pkt_params_lora_t rx_pkt_params = {
    .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
    .header_type          = LORA_PKT_LEN_MODE,
    .pld_len_in_bytes     = PAYLOAD_LENGTH,
    .crc                  = LORA_CRC,
    .iq                   = LORA_IQ
};

static void ARDUINO_ISR_ATTR rx_isr() {
    raw_irq_flag = true;
}

void lora_start_rx(void)
{
    // Configure maximum expected packet length for explicit header
    rx_pkt_params.pld_len_in_bytes = 255;
    lr11xx_radio_set_lora_pkt_params(&lr1121, &rx_pkt_params);

    // Set IRQ parameters on DIO9
    lr11xx_system_set_dio_irq_params(&lr1121, RX_IRQ_MASK, LR11XX_SYSTEM_IRQ_NONE);
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    // Enter continuous RX mode (timeout = 0 means continuous)
    lr11xx_radio_set_rx(&lr1121, 0);

    digitalWrite(lr1121.led, HIGH); // LED off in standby/listen
}

void lora_receiver_init(void)
{
    lora_init_io_context( &lr1121 );
    lora_init_io( &lr1121 );
    lora_spi_init( &lr1121 );

    lora_system_init( &lr1121 );
    lora_print_version( &lr1121 );
    lora_radio_init( &lr1121 );

    lora_init_irq( &lr1121, rx_isr );

    // Start listening
    lora_start_rx();
}

void lora_rx_irq_process(void)
{
    if (!raw_irq_flag) return;
    raw_irq_flag = false;

    lr11xx_system_irq_mask_t radio_irq = LR11XX_SYSTEM_IRQ_NONE;
    if(lr11xx_system_get_irq_status(&lr1121, &radio_irq) != LR11XX_STATUS_OK)
    {
        return;
    }

    radio_irq &= RX_IRQ_MASK;

    if((radio_irq & LR11XX_SYSTEM_IRQ_RX_DONE) == LR11XX_SYSTEM_IRQ_RX_DONE)
    {
        lr11xx_radio_rx_buffer_status_t rx_buffer_status;
        lr11xx_radio_pkt_status_lora_t  pkt_status;

        // Get received packet payload size & FIFO start pointer
        lr11xx_radio_get_rx_buffer_status(&lr1121, &rx_buffer_status);
        last_packet.length = rx_buffer_status.pld_len_in_bytes;

        // Read packet bytes from FIFO
        memset(last_packet.payload, 0, sizeof(last_packet.payload));
        lr11xx_regmem_read_buffer8(&lr1121, last_packet.payload, 
                                   rx_buffer_status.buffer_start_pointer, 
                                   last_packet.length);

        // Get RSSI and SNR metrics
        lr11xx_radio_get_lora_pkt_status(&lr1121, &pkt_status);
        last_packet.packet_rssi = pkt_status.rssi_pkt_in_dbm;
        last_packet.signal_rssi = pkt_status.signal_rssi_pkt_in_dbm;
        last_packet.snr         = pkt_status.snr_pkt_in_db;

        rx_packet_ready = true;

        // Blink LED momentarily to indicate packet reception
        digitalWrite(lr1121.led, LOW);
        delay(30);
        digitalWrite(lr1121.led, HIGH);

        // Clear IRQ status and re-enter RX mode
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
    else if((radio_irq & LR11XX_SYSTEM_IRQ_TIMEOUT) == LR11XX_SYSTEM_IRQ_TIMEOUT)
    {
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
    else if(radio_irq & LR11XX_SYSTEM_IRQ_CRC_ERROR)
    {
        Serial.println("[WARN] Received packet CRC Error!");
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
    else if(radio_irq & LR11XX_SYSTEM_IRQ_HEADER_ERROR)
    {
        Serial.println("[WARN] Received packet Header Error!");
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
    else
    {
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
}
