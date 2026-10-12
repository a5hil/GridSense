/*!
 * @file      lr1121_config.cpp
 * @brief     LR1121 initialization implementation for GridSense Gateway
 */

#include "lr1121_config.h"

lr1121_t lr1121;

static lr11xx_radio_mod_params_lora_t lora_mod_params = {
  .sf   = LORA_SPREADING_FACTOR,
  .bw   = LORA_BANDWIDTH,
  .cr   = LORA_CODING_RATE,
  .ldro = 0
};

static lr11xx_radio_pkt_params_lora_t lora_pkt_params = {
  .preamble_len_in_symb = LORA_PREAMBLE_LENGTH,
  .header_type          = LORA_PKT_LEN_MODE,
  .pld_len_in_bytes     = PAYLOAD_LENGTH,
  .crc                  = LORA_CRC,
  .iq                   = LORA_IQ,
};

void lora_system_init( const void* context )
{
    lr11xx_system_reset( ( void* ) context );
    lr11xx_hal_wakeup( ( void* ) context );

    lr11xx_system_enable_spi_crc(( void* ) context, false);
    lr11xx_system_set_standby(( void* ) context, LR11XX_SYSTEM_STANDBY_CFG_XOSC);

    // Calibrate image for 863 ~ 870 MHz (HF module)
    lr11xx_system_calibrate_image(( void* ) context, 0xD7, 0xDB);

    const lr11xx_system_reg_mode_t regulator = smtc_shield_lr11xx_common_get_reg_mode();
    lr11xx_system_set_reg_mode( ( void* ) context, regulator );

    const lr11xx_system_rfswitch_cfg_t* rf_switch_setup = smtc_shield_lr11xx_common_get_rf_switch_cfg();
    lr11xx_system_set_dio_as_rf_switch( context, rf_switch_setup );

    lr11xx_system_set_tcxo_mode( context, LR11XX_SYSTEM_TCXO_CTRL_3_0V, 300 );
    lr11xx_system_cfg_lfclk( context, LR11XX_SYSTEM_LFCLK_XTAL, true );

    lr11xx_system_clear_errors( context );
    lr11xx_system_calibrate( context, 0x3F );
    lr11xx_system_clear_errors( context );
    lr11xx_system_clear_irq_status( context, LR11XX_SYSTEM_IRQ_ALL_MASK );
}

void lora_radio_init( const void* context )
{
    const smtc_shield_lr11xx_pa_pwr_cfg_t* pa_pwr_cfg =
          smtc_shield_lr1121mb1gis_get_pa_pwr_cfg( RF_FREQ_IN_HZ, TX_OUTPUT_POWER_DBM );

    if( pa_pwr_cfg == NULL )
    {
        Serial.println("[ERROR] Invalid target frequency or power level!");
        while( true ) { delay(1000); }
    }

    lr11xx_radio_set_pkt_type( context, PACKET_TYPE );
    lr11xx_radio_set_rf_freq( context, RF_FREQ_IN_HZ );
    lr11xx_radio_set_rssi_calibration(context, smtc_shield_lr11xx_get_rssi_calibration_table( RF_FREQ_IN_HZ ));
    lr11xx_radio_set_pa_cfg( context, &( pa_pwr_cfg->pa_config ) );
    lr11xx_radio_set_tx_params( context, pa_pwr_cfg->power, PA_RAMP_TIME );
    lr11xx_radio_set_rx_tx_fallback_mode( context, FALLBACK_MODE );
    lr11xx_radio_cfg_rx_boosted( context, ENABLE_RX_BOOST_MODE );

    lora_mod_params.ldro = smtc_shield_lr11xx_common_compute_lora_ldro( LORA_SPREADING_FACTOR, LORA_BANDWIDTH );
    lr11xx_radio_set_lora_mod_params( context, &lora_mod_params );
    lr11xx_radio_set_lora_pkt_params( context, &lora_pkt_params );
    lr11xx_radio_set_lora_sync_word( context, LORA_SYNCWORD );
}
