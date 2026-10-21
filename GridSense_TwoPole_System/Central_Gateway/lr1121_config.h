/*!
 * @file      lr1121_config.h
 * @brief     Common LR1121 configuration for Central Gateway (ESP32-S3-LR1121-HF)
 */

#ifndef LR1121_CONFIG_H
#define LR1121_CONFIG_H

#include <Arduino.h>
#include "wavesahre_lora_1121.h"

// 866.3 MHz Indian IN865 Sub-GHz LoRa (Matches Pole nodes)
#define RF_FREQ_IN_HZ           866300000UL
#define PACKET_TYPE             LR11XX_RADIO_PKT_TYPE_LORA
#define TX_OUTPUT_POWER_DBM     22
#define PA_RAMP_TIME            LR11XX_RADIO_RAMP_48_US
#define FALLBACK_MODE           LR11XX_RADIO_FALLBACK_STDBY_RC
#define ENABLE_RX_BOOST_MODE    true         // Boost receiver sensitivity
#define PAYLOAD_LENGTH          255

#define LORA_SPREADING_FACTOR   LR11XX_RADIO_LORA_SF7
#define LORA_BANDWIDTH          LR11XX_RADIO_LORA_BW_125
#define LORA_CODING_RATE        LR11XX_RADIO_LORA_CR_4_5

#define LORA_PREAMBLE_LENGTH    8
#define LORA_PKT_LEN_MODE       LR11XX_RADIO_LORA_PKT_EXPLICIT
#define LORA_IQ                 LR11XX_RADIO_LORA_IQ_STANDARD
#define LORA_CRC                LR11XX_RADIO_LORA_CRC_OFF
#define LORA_SYNCWORD           0x12

extern lr1121_t lr1121;

void lora_system_init( const void* context );
void lora_radio_init( const void* context );

#endif // LR1121_CONFIG_H
