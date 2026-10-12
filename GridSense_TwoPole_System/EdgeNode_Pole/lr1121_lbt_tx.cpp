/*!
 * @file      lr1121_lbt_tx.cpp
 * @brief     Implementation of Listen-Before-Talk (LBT) using LR1121 Hardware CAD
 * @project   GridSense - MCA Project, FISAT
 */

#include "lr1121_lbt_tx.h"

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

// Hardware CAD configuration parameters (optimized for SF7 / BW 125kHz)
static lr11xx_radio_cad_params_t cad_params = {
    .cad_symb_nb     = 2,                                    // 2 symbols for quick, accurate CAD
    .cad_detect_peak = 48,                                   // Sensitivity peak threshold
    .cad_detect_min  = 10,                                   // Detection minimum
    .cad_exit_mode   = LR11XX_RADIO_CAD_EXIT_MODE_STANDBYRC, // Fallback to standby after detection
    .cad_timeout     = 0,
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

    // Configure CAD parameters on the LR1121 transceiver
    lr11xx_radio_set_cad_params( &lr1121, &cad_params );

    lora_init_irq( &lr1121, tx_isr );
}

bool lora_is_channel_busy(void)
{
    // Configure DIO interrupts for CAD DONE & CAD DETECTED
    lr11xx_system_set_dio_irq_params(
        &lr1121,
        LR11XX_SYSTEM_IRQ_CAD_DONE | LR11XX_SYSTEM_IRQ_CAD_DETECTED,
        LR11XX_SYSTEM_IRQ_NONE
    );
    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);

    // Launch hardware CAD assessment
    lr11xx_radio_set_cad(&lr1121);

    // Wait for CAD completion (typically 2-4 ms for SF7/125kHz)
    uint32_t start_ms = millis();
    lr11xx_system_irq_mask_t irq_status = LR11XX_SYSTEM_IRQ_NONE;

    while ((millis() - start_ms) < 40) {
        if (lr11xx_system_get_irq_status(&lr1121, &irq_status) == LR11XX_STATUS_OK) {
            if ((irq_status & LR11XX_SYSTEM_IRQ_CAD_DONE) == LR11XX_SYSTEM_IRQ_CAD_DONE) {
                bool is_detected = ((irq_status & LR11XX_SYSTEM_IRQ_CAD_DETECTED) == LR11XX_SYSTEM_IRQ_CAD_DETECTED);
                lr11xx_system_clear_irq_status(&lr1121, irq_status);
                return is_detected; // true = channel occupied, false = clear
            }
        }
        delay(1);
    }

    lr11xx_system_clear_irq_status(&lr1121, LR11XX_SYSTEM_IRQ_ALL_MASK);
    return false; // Default to clear if timeout
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

    digitalWrite(lr1121.led, LOW); // Active Low LED ON
}

bool lora_send_with_lbt(const char* message, uint8_t maxRetries, uint32_t minBackoffMs, uint32_t maxBackoffMs)
{
    uint8_t len = strlen(message);

    for (uint8_t attempt = 0; attempt <= maxRetries; attempt++) {
        // Step 1: Perform Channel Activity Detection (CAD)
        if (lora_is_channel_busy()) {
            // Channel is currently occupied by another node!
            uint32_t backoff = random(minBackoffMs, maxBackoffMs);
            Serial.printf("[LBT CAD] Channel BUSY! Backing off for %u ms (Retry %d/%d)...\n",
                          backoff, attempt + 1, maxRetries);
            delay(backoff);
        } else {
            // Step 2: Channel is clear! Transmit immediately
            lora_execute_tx((const uint8_t*)message, len);
            return true;
        }
    }

    // Fallback: If channel remained busy after all retries, transmit with warning
    Serial.println("[LBT CAD] Channel continuously busy after all retries. Force transmitting...");
    lora_execute_tx((const uint8_t*)message, len);
    return false;
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
