/*!
 * @file      lr1121_rx.h
 * @brief     Receiver helper header for ESP32-S3-LR1121-HF
 */

#ifndef LR1121_RX_H
#define LR1121_RX_H

#include "lr1121_config.h"

struct LoRaPacketInfo {
    uint8_t payload[256];
    uint8_t length;
    int16_t packet_rssi;
    int16_t signal_rssi;
    int8_t  snr;
};

extern volatile bool rx_packet_ready;
extern LoRaPacketInfo last_packet;

void lora_receiver_init(void);
void lora_start_rx(void);
void lora_rx_irq_process(void);

#endif // LR1121_RX_H
