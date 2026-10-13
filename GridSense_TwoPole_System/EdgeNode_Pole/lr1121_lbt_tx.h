/*!
 * @file      lr1121_lbt_tx.h
 * @brief     LoRa Node Transceiver with LBT CAD Transmission and Background Relay RX
 * @project   GridSense - MCA Project, FISAT
 */

#ifndef LR1121_LBT_TX_H
#define LR1121_LBT_TX_H

#include "lr1121_config.h"

struct LoRaRxPacketInfo {
    uint8_t payload[256];
    uint8_t length;
    int16_t packet_rssi;
    int8_t  snr;
};

extern volatile bool node_rx_ready;
extern LoRaRxPacketInfo last_node_rx_packet;
extern volatile bool tx_done_flag;
extern volatile bool tx_timeout_flag;

void lora_node_radio_init(void);
void lora_start_node_rx(void);
void lora_node_radio_irq_process(void);
bool lora_is_channel_busy(void);
bool lora_send_with_lbt(const char* message, uint8_t maxRetries = 5, uint32_t minBackoffMs = 100, uint32_t maxBackoffMs = 1500);

#endif // LR1121_LBT_TX_H
