#pragma once
#include <Arduino.h>

/*!
 * @file      gridsense_crypto.h
 * @brief     Hardware-Accelerated AES-128 Encryption & Decryption for GridSense Central Gateway
 * @details   Utilizes ESP32-S3 dedicated hardware cryptographic engine via mbedtls.
 *            Implements AES-128-CTR with dynamic Nonce counter derived from packet sequence,
 *            preventing replay attacks and securing LoRa telemetry over public RF spectrum.
 * @project   GridSense - MCA Project, FISAT
 */

// Initialize hardware AES-128 engine
bool gridsense_crypto_init(void);

// Encrypt plaintext JSON payload using AES-128-CTR (output prefixed with "ENC:<base64>")
bool gridsense_encrypt_payload(const char* plaintext, uint8_t srcId, uint16_t seq, char* outCiphertext, size_t maxLen);

// Decrypt "ENC:<base64>" payload. Returns true if encrypted & successfully decrypted, false if plaintext
bool gridsense_decrypt_payload(const char* inPayload, uint8_t srcId, uint16_t seq, char* outPlaintext, size_t maxLen);
