/*!
 * @file      lr1121_tx.cpp
 * @brief     Edge Node LoRa TX implementation
 */

#include "lr1121_tx.h"

volatile bool tx_done_flag = false;
volatile bool tx_timeout_flag = false;
static volatile bool raw_irq_flag = false;

static lr11xx_radio_pkt_params_lora_t tx_pkt_params = {
    .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
    .header_type          = LORA_PKT_LEN_MODE,
    .pld_len_in_bytes     = PAYLOAD_LENGTH,
    .crc                  = LORA_CRC,
    .iq                   = LORA_IQ
};

static void ARDUINO_ISR_ATTR tx_isr() {
    raw_irq_flag = true;
}

void lora_transmitter_init(void)
{
    lora_init_io_context( &lr1121 );
    lora_init_io( &lr1121 );
    lora_spi_init( &lr1121 );

    lora_system_init( &lr1121 );
    lora_print_version( &lr1121 );
    lora_radio_init( &lr1121 );

    lora_init_irq( &lr1121, tx_isr );
}

void lora_send_packet(const uint8_t* payload, uint8_t length)
{
    tx_done_flag = false;
    tx_timeout_flag = false;

    lr11xx_system_set_dio_irq_params(&lr1121, LR11XX_SYSTEM_IRQ_TX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT, LR11XX_SYSTEM_IRQ_NONE);
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    tx_pkt_params.pld_len_in_bytes = length;
    lr11xx_radio_set_lora_pkt_params(&lr1121, &tx_pkt_params);
    lr11xx_regmem_write_buffer8(&lr1121, payload, length);

    lr11xx_radio_set_tx(&lr1121, 0);

    digitalWrite(lr1121.led, LOW); // Active Low LED ON
}

void lora_send_string(const char* message)
{
    lora_send_packet((const uint8_t*)message, strlen(message));
}

void lora_tx_irq_process(void)
{
    if (!raw_irq_flag) return;
    raw_irq_flag = false;

    lr11xx_system_irq_mask_t radio_irq = LR11XX_SYSTEM_IRQ_NONE;
    if(lr11xx_system_get_irq_status(&lr1121, &radio_irq) == LR11XX_STATUS_OK)
    {
        if((radio_irq & LR11XX_SYSTEM_IRQ_TX_DONE) == LR11XX_SYSTEM_IRQ_TX_DONE)
        {
            lr11xx_system_clear_irq_status(&lr1121, radio_irq);
            tx_done_flag = true;
            digitalWrite(lr1121.led, HIGH); // LED OFF
        }
        else if((radio_irq & LR11XX_SYSTEM_IRQ_TIMEOUT) == LR11XX_SYSTEM_IRQ_TIMEOUT)
        {
            lr11xx_system_clear_irq_status(&lr1121, radio_irq);
            tx_timeout_flag = true;
            digitalWrite(lr1121.led, HIGH);
        }
        else
        {
            lr11xx_system_clear_irq_status(&lr1121, radio_irq);
        }
    }
}
