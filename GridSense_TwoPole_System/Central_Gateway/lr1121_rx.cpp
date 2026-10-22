/*!
 * @file      lr1121_rx.cpp
 * @brief     Central Gateway LoRa RX implementation
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
    rx_pkt_params.pld_len_in_bytes = 255;
    lr11xx_radio_set_lora_pkt_params(&lr1121, &rx_pkt_params);

    lr11xx_system_set_dio_irq_params(&lr1121, RX_IRQ_MASK, LR11XX_SYSTEM_IRQ_NONE);
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    lr11xx_radio_set_rx(&lr1121, 0);

    digitalWrite(lr1121.led, HIGH);
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

    // If hardware CRC or header error occurred, discard the corrupted burst immediately
    if (radio_irq & (LR11XX_SYSTEM_IRQ_CRC_ERROR | LR11XX_SYSTEM_IRQ_HEADER_ERROR))
    {
        Serial.printf("[GW RF] Frame Corrupted (%s) - Dropped.\n",
                      (radio_irq & LR11XX_SYSTEM_IRQ_CRC_ERROR) ? "CRC_ERROR" : "HEADER_ERROR");
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
        return;
    }

    if((radio_irq & LR11XX_SYSTEM_IRQ_RX_DONE) == LR11XX_SYSTEM_IRQ_RX_DONE)
    {
        lr11xx_radio_rx_buffer_status_t rx_buffer_status;
        lr11xx_radio_pkt_status_lora_t  pkt_status;

        lr11xx_radio_get_rx_buffer_status(&lr1121, &rx_buffer_status);
        last_packet.length = rx_buffer_status.pld_len_in_bytes;

        memset(last_packet.payload, 0, sizeof(last_packet.payload));
        lr11xx_regmem_read_buffer8(&lr1121, last_packet.payload, 
                                   rx_buffer_status.buffer_start_pointer, 
                                   last_packet.length);

        lr11xx_radio_get_lora_pkt_status(&lr1121, &pkt_status);
        last_packet.packet_rssi = pkt_status.rssi_pkt_in_dbm;
        last_packet.signal_rssi = pkt_status.signal_rssi_pkt_in_dbm;
        last_packet.snr         = pkt_status.snr_pkt_in_db;

        rx_packet_ready = true;

        digitalWrite(lr1121.led, LOW);
        delay(25);
        digitalWrite(lr1121.led, HIGH);

        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
    else if((radio_irq & LR11XX_SYSTEM_IRQ_TIMEOUT) == LR11XX_SYSTEM_IRQ_TIMEOUT)
    {
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
    else
    {
        lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        lora_start_rx();
    }
}
