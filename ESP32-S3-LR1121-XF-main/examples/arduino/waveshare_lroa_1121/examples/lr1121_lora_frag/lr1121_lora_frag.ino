#include "lr1121_config.h"
#include <Arduino.h>
#include <stdio.h>
#include <string.h>

// ==========================================
// User Configuration
// ==========================================

#define LORA_FRAG_ROLE_RX 1
#define LORA_FRAG_ROLE_TX 2

#ifndef LORA_FRAG_ROLE
// Select role: LORA_FRAG_ROLE_RX = Receiver (RX), LORA_FRAG_ROLE_TX = Transmitter (TX)
#define LORA_FRAG_ROLE LORA_FRAG_ROLE_RX 
#endif

#define LORA_PHY_MAX_PAYLOAD 255

// ==========================================
// Global Variables and Interrupts
// ==========================================
volatile bool irq_fired = false;

// ISR: set flag only; avoid heavy operations
void IRAM_ATTR isr(void)
{
    irq_fired = true;
}

// Print prompt
static void print_prompt( void )
{
#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
    Serial.print( "RX>" );
#else
    Serial.print( "TX>" );
#endif
    Serial.print( " " );
}

// ==========================================
// LoRa Core Operations
// ==========================================

// Enter RX mode
static void radio_enter_rx(const void *ctx)
{
    // IRQ mask: RX done, timeout, CRC error, etc.
    lr11xx_system_set_dio_irq_params(ctx, LR11XX_SYSTEM_IRQ_RX_DONE | LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_HEADER_ERROR | LR11XX_SYSTEM_IRQ_CRC_ERROR | LR11XX_SYSTEM_IRQ_FSK_LEN_ERROR, 0);
    lr11xx_system_clear_irq_status(ctx, LR11XX_SYSTEM_IRQ_ALL_MASK);

    // Packet parameters
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
        // GFSK parameters: keep default configuration
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
    // Issue RX command
    lr11xx_radio_set_rx(ctx, 0);
}

// Transmit a single packet (low-level)
static void radio_tx_buf(const void *ctx, const uint8_t *buf, uint8_t len)
{
    // IRQ mask: TX done and timeout only
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
    }
    else
    {
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
    }
    
    // Write buffer and trigger TX
    lr11xx_regmem_write_buffer8(ctx, buf, len);
    lr11xx_radio_set_tx(ctx, 0);
}

// Wait for TX done (blocking)
static bool radio_wait_tx_done( const void* ctx, const uint32_t timeout_ms )
{
    const unsigned long start = millis();
    
    while( ( millis() - start ) < timeout_ms )
    {
        if( irq_fired )
        {
            irq_fired = false;
            lr11xx_system_irq_mask_t irq = 0;
            lr11xx_system_get_irq_status( ctx, &irq );
            lr11xx_system_clear_irq_status( ctx, irq );

            if( ( irq & LR11XX_SYSTEM_IRQ_TX_DONE ) == LR11XX_SYSTEM_IRQ_TX_DONE )
            {
                return true;
            }
            if( ( irq & LR11XX_SYSTEM_IRQ_TIMEOUT ) == LR11XX_SYSTEM_IRQ_TIMEOUT )
            {
                return false;
            }
        }
        delay(1);
    }
    return false;
}

// Sliced TX logic
static void radio_tx_sliced( const void* ctx, const uint8_t* msg, const uint16_t msg_len )
{
    if( msg_len == 0 ) return;

    const uint16_t slice_max = LORA_PHY_MAX_PAYLOAD;
    const uint16_t slice_cnt = ( msg_len + slice_max - 1 ) / slice_max;

    for( uint16_t i = 0; i < slice_cnt; i++ )
    {
        uint16_t offset = i * slice_max;
        uint16_t len = (msg_len - offset) > slice_max ? slice_max : (msg_len - offset);

        Serial.printf("TX slice %u/%u len=%u\r\n", i + 1, slice_cnt, len);
        
        radio_tx_buf( ctx, &msg[offset], (uint8_t)len );

        if( !radio_wait_tx_done( ctx, 4000 ) )
        {
            Serial.println("TX Timeout!");
            return;
        }
        delay(10); // Small delay between packets to avoid RX overload
    }
}

// Handle IRQ events (shared by RX/TX, mainly for RX)
static void process_irq(const void *ctx)
{
    lr11xx_system_irq_mask_t irq = 0;
    lr11xx_system_get_irq_status(ctx, &irq);
    lr11xx_system_clear_irq_status(ctx, irq);

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
    // RX done
    if ((irq & LR11XX_SYSTEM_IRQ_RX_DONE) == LR11XX_SYSTEM_IRQ_RX_DONE)
    {
        lr11xx_radio_rx_buffer_status_t st;
        lr11xx_radio_get_rx_buffer_status(ctx, &st);
        
        uint8_t len = ( st.pld_len_in_bytes > LORA_PHY_MAX_PAYLOAD ) ? LORA_PHY_MAX_PAYLOAD : st.pld_len_in_bytes;
        uint8_t buf[LORA_PHY_MAX_PAYLOAD];
        
        lr11xx_regmem_read_buffer8(ctx, buf, st.buffer_start_pointer, len);
        
        Serial.printf( "RX len=%u: ", len );
        Serial.write( buf, len );
        Serial.println();
        
        // Continue receiving
        radio_enter_rx(ctx);
        print_prompt();
        return;
    }

    // RX error handling
    if( ( irq & ( LR11XX_SYSTEM_IRQ_TIMEOUT | LR11XX_SYSTEM_IRQ_HEADER_ERROR | LR11XX_SYSTEM_IRQ_CRC_ERROR ) ) != 0 )
    {
        Serial.println("RX Error/Timeout");
        radio_enter_rx(ctx);
        print_prompt();
    }
#endif
}

// ==========================================
// Arduino Standard Functions
// ==========================================

void setup() {
    // Key fix: enlarge UART RX buffer to avoid loss on large paste
    Serial.setRxBufferSize(4096);
    Serial.begin(115200);
    while(!Serial); // Wait for serial connection
    
    // Hardware initialization
    lora_init_io_context(&lr1121);
    lora_init_io(&lr1121);
    lora_spi_init(&lr1121);
    lora_system_init(&lr1121);
    lora_radio_init(&lr1121);

    // Attach IRQ
    lora_init_irq(&lr1121, isr);

    Serial.printf( "\r\nLoRa Frag Simple Demo\r\nRole: %s\r\n", 
                   (LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX) ? "RX" : "TX" );

#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_RX
    radio_enter_rx(&lr1121);
#endif

    print_prompt();
}

void loop() {
    // 1. Handle LoRa events
    if (irq_fired) {
        irq_fired = false;
        process_irq(&lr1121);
    }

    // 2. Handle UART TX (TX mode only)
#if LORA_FRAG_ROLE == LORA_FRAG_ROLE_TX
    if (Serial.available()) {
        static uint8_t tx_buf[2048]; // Larger application buffer
        int len = 0;
        unsigned long last_rx_time = millis();

        // Read until no new data for 50ms, or buffer is full
        while ((millis() - last_rx_time < 50) && (len < sizeof(tx_buf))) {
            if (Serial.available()) {
                tx_buf[len++] = Serial.read();
                last_rx_time = millis();
            }
        }
        
        if (len > 0) {
            // Optional: trim trailing newlines
            while(len > 0 && (tx_buf[len-1] == '\r' || tx_buf[len-1] == '\n')) {
                len--;
            }
            
            if (len > 0) {
                Serial.printf("\r\n[System] Received %d bytes from Serial, starting LoRa TX...\r\n", len);
                radio_tx_sliced(&lr1121, tx_buf, len);
                print_prompt();
            }
        }
    }
#endif
}
