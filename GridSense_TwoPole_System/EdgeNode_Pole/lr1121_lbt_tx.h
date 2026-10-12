/*!
 * @file      lr1121_lbt_tx.h
 * @brief     LoRa Transmitter with Listen-Before-Talk (LBT) using Channel Activity Detection (CAD)
 * @project   GridSense - MCA Project, FISAT
 */

#ifndef LR1121_LBT_TX_H
#define LR1121_LBT_TX_H

#include "lr1121_config.h"

extern volatile bool tx_done_flag;
extern volatile bool tx_timeout_flag;

void lora_transmitter_init(void);

/**
 * @brief Checks if the RF channel currently has active LoRa packets using Hardware CAD
 * @return true if channel is BUSY, false if channel is CLEAR
 */
bool lora_is_channel_busy(void);

/**
 * @brief Transmits a LoRa packet using Listen-Before-Talk (LBT) and random backoff jitter
 * @param message The string payload to send
 * @param maxRetries Maximum backoff retry attempts if channel is occupied
 * @param minBackoffMs Minimum backoff jitter (default 100 ms)
 * @param maxBackoffMs Maximum backoff jitter (default 1500 ms)
 * @return true if transmitted successfully, false if channel was persistently occupied
 */
bool lora_send_with_lbt(const char* message, uint8_t maxRetries = 5, uint32_t minBackoffMs = 100, uint32_t maxBackoffMs = 1500);

void lora_tx_irq_process(void);

#endif // LR1121_LBT_TX_H
