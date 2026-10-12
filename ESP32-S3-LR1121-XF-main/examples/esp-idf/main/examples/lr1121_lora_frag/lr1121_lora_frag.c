#include "lr1121_lora_frag.h"
#include "lr1121_config.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include <stdio.h>
#include <string.h>

#define LORA_FRAG_ROLE_RX 1
#define LORA_FRAG_ROLE_TX 2

#ifndef LORA_FRAG_ROLE
// Switch LORA_FRAG_ROLE to enable RX or TX mode
#define LORA_FRAG_ROLE LORA_FRAG_ROLE_RX 
#endif

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
static volatile bool irq_flag = false;
static void IRAM_ATTR isr(void *arg)
{
    (void)arg;
    irq_flag = true;
}
#endif

#define LORA_PHY_MAX_PAYLOAD 255

static void lr_frag_print_prompt( void )
{
#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
    printf( "RX>" );
#else
    printf( "TX>" );
#endif
    printf( " " );
    fflush( stdout );
}

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
static void radio_enter_rx(const void *ctx)
{
    lr11xx_system_set_dio_irq_params(ctx, LR11XX_SYSTEM_IRQ_RX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_HEADER_ERROR | LR11XX_SYSTEM_IRQ_CRC_ERROR | LR11XX_SYSTEM_IRQ_FSK_LEN_ERROR, 0);
    lr11xx_system_clear_irq_status(ctx, LR11XX_SYSTEM_IRQ_ALL_MASK);

    if (PACKET_TYPE == LR11XX_RADIO_PKT_TYPE_LORA)
    {
        lr11xx_radio_pkt_params_lora_t p = {
            .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
            .header_type = LORA_PKT_LEN_MODE,
            .pld_len_in_bytes = LORA_PHY_MAX_PAYLOAD,
            .crc = LORA_CRC,
            .iq = LORA_IQ,
        };
        lr11xx_radio_set_lora_pkt_params(ctx, &p);
    }
    else
    {
        lr11xx_radio_pkt_params_gfsk_t g = {
            .preamble_len_in_bits = FSK_PREAMBLE_LENGTH,
            .sync_word_len_in_bits = FSK_SYNCWORD_LENGTH,
            .address_filtering = FSK_ADDRESS_FILTERING,
            .header_type = FSK_HEADER_TYPE,
            .pld_len_in_bytes = LORA_PHY_MAX_PAYLOAD,
            .crc_type = FSK_CRC_TYPE,
            .dc_free = FSK_DC_FREE,
        };
        lr11xx_radio_set_gfsk_pkt_params(ctx, &g);
    }
    lr11xx_radio_set_rx(ctx, 0);
}

#endif

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_TX
static void radio_tx_buf(const void *ctx, const uint8_t *buf, uint8_t len)
{
    lr11xx_system_set_dio_irq_params( ctx, LR11XX_SYSTEM_IRQ_TX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT, 0 );
    lr11xx_system_clear_irq_status( ctx, LR11XX_SYSTEM_IRQ_ALL_MASK );

    if (PACKET_TYPE == LR11XX_RADIO_PKT_TYPE_LORA)
    {
        lr11xx_radio_pkt_params_lora_t p = {
            .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
            .header_type = LORA_PKT_LEN_MODE,
            .pld_len_in_bytes = len,
            .crc = LORA_CRC,
            .iq = LORA_IQ,
        };
        lr11xx_radio_set_lora_pkt_params(ctx, &p);
        lr11xx_regmem_write_buffer8(ctx, buf, len);
        lr11xx_radio_set_tx(ctx, 0);
        return;
    }
    lr11xx_radio_pkt_params_gfsk_t g = {
        .preamble_len_in_bits = FSK_PREAMBLE_LENGTH,
        .sync_word_len_in_bits = FSK_SYNCWORD_LENGTH,
        .address_filtering = FSK_ADDRESS_FILTERING,
        .header_type = FSK_HEADER_TYPE,
        .pld_len_in_bytes = len,
        .crc_type = FSK_CRC_TYPE,
        .dc_free = FSK_DC_FREE,
    };
    lr11xx_radio_set_gfsk_pkt_params(ctx, &g);
    lr11xx_regmem_write_buffer8(ctx, buf, len);
    lr11xx_radio_set_tx(ctx, 0);
}

static bool radio_wait_tx_done( const void* ctx, const uint32_t timeout_ms )
{
    const TickType_t start    = xTaskGetTickCount();
    const TickType_t timeout  = pdMS_TO_TICKS( timeout_ms );

    while( ( xTaskGetTickCount() - start ) < timeout )
    {
        lr11xx_system_irq_mask_t irq = 0;
        lr11xx_system_get_irq_status( ctx, &irq );

        if( ( irq & LR11XX_SYSTEM_IRQ_TX_DONE ) == LR11XX_SYSTEM_IRQ_TX_DONE )
        {
            lr11xx_system_clear_irq_status( ctx, irq );
            return true;
        }

        if( ( irq & LR11XX_SYSTEM_IRQ_TIMEOUT ) == LR11XX_SYSTEM_IRQ_TIMEOUT )
        {
            lr11xx_system_clear_irq_status( ctx, irq );
            return false;
        }

        vTaskDelay( pdMS_TO_TICKS( 5 ) );
    }
    return false;
}

static void radio_tx_sliced( const void* ctx, const uint8_t* msg, const uint16_t msg_len )
{
    if( msg_len == 0 )
    {
        return;
    }

    const uint16_t slice_max = LORA_PHY_MAX_PAYLOAD;
    const uint16_t slice_cnt = ( uint16_t ) ( ( msg_len + ( slice_max - 1 ) ) / slice_max );

    for( uint16_t slice_idx = 0; slice_idx < slice_cnt; slice_idx++ )
    {
        const uint16_t off       = ( uint16_t ) ( slice_idx * slice_max );
        const uint16_t remaining = ( off < msg_len ) ? ( msg_len - off ) : 0;
        const uint16_t slice_len = ( remaining > slice_max ) ? slice_max : remaining;

        printf( "TX slice %u/%u len=%u\r\n", ( unsigned ) ( slice_idx + 1 ), ( unsigned ) slice_cnt,
                ( unsigned ) slice_len );
        radio_tx_buf( ctx, &msg[off], ( uint8_t ) slice_len );

        const bool ok = radio_wait_tx_done( ctx, 4000 );
        if( ok == false )
        {
            printf( "TX timeout\r\n" );
            return;
        }
        vTaskDelay( pdMS_TO_TICKS( 20 ) );
    }
}

#endif

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
static void process_irq(const void *ctx)
{
    lr11xx_system_irq_mask_t irq = 0;
    lr11xx_system_get_irq_status(ctx, &irq);
    if ((irq & LR11XX_SYSTEM_IRQ_RX_DONE) == LR11XX_SYSTEM_IRQ_RX_DONE)
    {
        lr11xx_radio_rx_buffer_status_t st;
        lr11xx_radio_get_rx_buffer_status(ctx, &st);
        const uint16_t raw_len = st.pld_len_in_bytes;
        const uint8_t  len = ( raw_len > LORA_PHY_MAX_PAYLOAD ) ? LORA_PHY_MAX_PAYLOAD : ( uint8_t ) raw_len;
        uint8_t buf[LORA_PHY_MAX_PAYLOAD];
        lr11xx_regmem_read_buffer8(ctx, buf, st.buffer_start_pointer, len);
        lr11xx_system_clear_irq_status(ctx, irq);
        radio_enter_rx(ctx);

        printf( "RX len=%u: ", ( unsigned ) len );
        fwrite( buf, 1, len, stdout );
        printf( "\r\n" );
        lr_frag_print_prompt();
        return;
    }

    if( ( irq & ( LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_HEADER_ERROR | LR11XX_SYSTEM_IRQ_CRC_ERROR |
                 LR11XX_SYSTEM_IRQ_FSK_LEN_ERROR ) ) != 0 )
    {
        lr11xx_system_clear_irq_status(ctx, irq);
        radio_enter_rx(ctx);
        return;
    }
    lr11xx_system_clear_irq_status(ctx, irq);
}

static void lora_rx_task(void *arg)
{
    while (true)
    {
        if (irq_flag)
        {
            irq_flag = false;
            process_irq(&lr1121);
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

#endif

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_TX
static void console_to_lora_task(void* arg)
{
    (void)arg;
    uint8_t  rx[255];
    uint8_t  tx[1024];
    uint16_t pos = 0;
    TickType_t last = xTaskGetTickCount();
    const TickType_t win = pdMS_TO_TICKS(40);
    while(true)
    {
        int data = usb_serial_jtag_read_bytes(rx, sizeof(rx), 10);
        if(data > 0)
        {
            for(int i = 0; i < data; ++i)
            {
                uint8_t receive_data = rx[i];
                if(receive_data == '\r') continue;
                if(receive_data == '\n')
                {
                    if(pos > 0)
                    {
                        radio_tx_sliced( &lr1121, tx, pos );
                        pos = 0;
                        lr_frag_print_prompt();
                    }
                    last = xTaskGetTickCount();
                    continue;
                }
                if( pos < sizeof( tx ) )
                {
                    tx[pos++] = receive_data;
                    last = xTaskGetTickCount();
                    continue;
                }
                radio_tx_sliced( &lr1121, tx, pos );
                pos = 0;
                lr_frag_print_prompt();
            }
        }
        if(pos > 0)
        {
            TickType_t now = xTaskGetTickCount();
            if((now - last) >= win)
            {
                radio_tx_sliced( &lr1121, tx, pos );
                pos = 0;
                lr_frag_print_prompt();
            }
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

#endif

void lr1121_lora_frag_test(void)
{
    vTaskDelay(pdMS_TO_TICKS(100));
    lora_init_io_context(&lr1121);
    lora_init_io(&lr1121);
    lora_spi_init(&lr1121);
    lora_system_init(&lr1121);
    lora_radio_init(&lr1121);

    printf( "LoRaFrag role=%s packet=%s freq=%u\r\n",
            ( LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX ) ? "RX" : "TX",
            ( PACKET_TYPE == LR11XX_RADIO_PKT_TYPE_LORA ) ? "LORA" : "GFSK", ( unsigned ) RF_FREQ_IN_HZ );
    lr_frag_print_prompt();
#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
    lora_init_irq(&lr1121, isr);
    radio_enter_rx(&lr1121);
    xTaskCreate(lora_rx_task, "lora_rx", 4096, NULL, 5, NULL);
#else
    usb_serial_jtag_driver_config_t cfg = { .rx_buffer_size = 256, .tx_buffer_size = 256 };
    usb_serial_jtag_driver_install(&cfg);
    xTaskCreate(console_to_lora_task, "console_to_lora", 4096, NULL, 5, NULL);
#endif
}
