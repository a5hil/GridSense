/*****************************************************************************
 * | File         :   main.c
 * | Author       :   Waveshare team
 * | Function     :   Main function
 * | Info         :
 * |                 
 * ----------------
 * | This version :   V1.0
 * | Date         :   2025-6-27
 * | Info         :   Basic version
 *
 ******************************************************************************/
#ifdef LR1121_CAD    
#include "lr1121_cad.h"
#elif LR1121_FIRMWARE_UPDATE
#include "lr1121_firmware_update.h"
#elif LR1121_PER
#include "lr1121_per.h"
#elif LR1121_PING_PONG
#include "lr1121_ping_pong.h"
#elif LR1121_LORA_FRAG
#include "lr1121_lora_frag.h"
#elif LR1121_LR_FHSS
#include "lr1121_lr_fhss.h"
#elif LR1121_READ
#include "lr1121_read.h"
#elif LR1121_WRITE
#include "lr1121_write.h"
#elif LR1121_SIGFOX
#include "lr1121_sigfox.h"
#elif LR1121_SPECTRAL_SCAN
#include "lr1121_spectral_scan.h"
#elif LR1121_SPETRUM_DISPLAY 
#include "lr1121_spetrum_display.h"
#elif LR1121_TX_CW
#include "lr1121_tx_cw.h"
#elif LR1121_TX_INFINITE_PRERMBLE
#include "lr1121_tx_infinite_preamble.h" 
#elif LR1121_LORAWAN
#warning "12345\r\n"
#include "lr1121_LoRaWAN.h" 
#endif

/**
 * @brief Main application entry point.
 *
 * This function initializes the I2C interface and the IO EXTENSION hardware,
 * then enters a loop to toggle a backlight on and off with a 500ms interval.
 */
void app_main()
{
#ifdef LR1121_CAD
    lr1121_cad_test();
#elif LR1121_FIRMWARE_UPDATE
    lr1121_firmware_update();
#elif LR1121_PER
    lr1121_per_test();
#elif LR1121_PING_PONG
    lr1121_ping_pong_test();
#elif LR1121_LORA_FRAG
    lr1121_lora_frag_test();
#elif LR1121_LR_FHSS
    lr1121_lr_fhss_test();
#elif LR1121_READ
    lr1121_read_test();
#elif LR1121_WRITE
    lr1121_write_test();
#elif LR1121_SIGFOX
    lr1121_sigfox_test();
#elif LR1121_SPECTRAL_SCAN
    lr1121_spectral_scan_test();
#elif LR1121_SPETRUM_DISPLAY 
    lora_spetrum_display_test();
#elif LR1121_TX_CW
    lr1121_tx_cw_test();
#elif LR1121_TX_INFINITE_PRERMBLE 
    lr1121_tx_infinite_preamble_test();
#elif LR1121_LORAWAN
    lr1121_LoRaWAN_test();
#endif

}
