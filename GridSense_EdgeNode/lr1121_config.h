/*!
 * @file      lr1121_config.h
 * @brief     Common LR1121 configuration parameters for ESP32-S3-LR1121-HF Edge Node
 */

#ifndef LR1121_CONFIG_H
#define LR1121_CONFIG_H

#include <Arduino.h>
#include "wavesahre_lora_1121.h"

// Operating frequency: 868 MHz (Sub-GHz HF band for India/EU)
#define RF_FREQ_IN_HZ           868000000UL
#define PACKET_TYPE             LR11XX_RADIO_PKT_TYPE_LORA
#define TX_OUTPUT_POWER_DBM     22           // 22 dBm max power
#define PA_RAMP_TIME            LR11XX_RADIO_RAMP_48_US
#define FALLBACK_MODE           LR11XX_RADIO_FALLBACK_STDBY_RC
#define ENABLE_RX_BOOST_MODE    false
#define PAYLOAD_LENGTH          200          // Supports full JSON telemetry packet

#define LORA_SPREADING_FACTOR   LR11XX_RADIO_LORA_SF7
#define LORA_BANDWIDTH          LR11XX_RADIO_LORA_BW_125
#define LORA_CODING_RATE        LR11XX_RADIO_LORA_CR_4_5

#define LORA_PREAMBLE_LENGTH    8
#define LORA_PKT_LEN_MODE       LR11XX_RADIO_LORA_PKT_EXPLICIT
#define LORA_IQ                 LR11XX_RADIO_LORA_IQ_STANDARD
#define LORA_CRC                LR11XX_RADIO_LORA_CRC_OFF
#define LORA_SYNCWORD           0x12  // Private network

extern lr1121_t lr1121;

void lora_system_init( const void* context );
void lora_radio_init( const void* context );

#endif // LR1121_CONFIG_H
