/*!
 * @file      lr1121_tx.h
 * @brief     Edge Node LoRa TX helper
 */

#ifndef LR1121_TX_H
#define LR1121_TX_H

#include "lr1121_config.h"

extern volatile bool tx_done_flag;
extern volatile bool tx_timeout_flag;

void lora_transmitter_init(void);
void lora_send_packet(const uint8_t* payload, uint8_t length);
void lora_send_string(const char* message);
void lora_tx_irq_process(void);

#endif // LR1121_TX_H
