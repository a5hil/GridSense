#include "gridsense_crypto.h"
#include "mbedtls/aes.h"
#include "mbedtls/base64.h"
#include <string.h>

/*!
 * @file      gridsense_crypto.cpp
 * @brief     ESP32-S3 Hardware AES-128-CTR Implementation for Central Gateway
 * @project   GridSense - MCA Project, FISAT
 */

// GridSense Shared AES-128 Master Network Key (16 bytes / 128 bits: "GSFISAT2026KSEB!")
static const uint8_t GRIDSENSE_AES128_KEY[16] = {
    0x47, 0x53, 0x46, 0x49, 0x53, 0x41, 0x54, 0x32,
    0x30, 0x32, 0x36, 0x4B, 0x53, 0x45, 0x42, 0x21
};

static void build_nonce(uint8_t srcId, uint16_t seq, uint8_t nonce[16]) {
    // 8-byte domain prefix
    const uint8_t prefix[8] = {'G', 'R', 'I', 'D', 'S', 'E', 'N', 'S'};
    memcpy(nonce, prefix, 8);
    nonce[8]  = srcId;
    nonce[9]  = 0xAA;
    nonce[10] = (uint8_t)(seq >> 8);
    nonce[11] = (uint8_t)(seq & 0xFF);
    nonce[12] = 0x00;
    nonce[13] = 0x00;
    nonce[14] = 0x00;
    nonce[15] = 0x01; // Initial counter block
}

bool gridsense_crypto_init(void) {
    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);
    int ret = mbedtls_aes_setkey_enc(&ctx, GRIDSENSE_AES128_KEY, 128);
    mbedtls_aes_free(&ctx);
    return (ret == 0);
}

bool gridsense_encrypt_payload(const char* plaintext, uint8_t srcId, uint16_t seq, char* outCiphertext, size_t maxLen) {
    if (!plaintext || !outCiphertext || maxLen < 16) return false;

    size_t plainLen = strlen(plaintext);
    if (plainLen == 0 || plainLen > 140) return false;

    uint8_t cipherBuf[160];
    uint8_t nonce[16];
    uint8_t streamBlock[16] = {0};
    size_t nc_off = 0;

    build_nonce(srcId, seq, nonce);

    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);
    if (mbedtls_aes_setkey_enc(&ctx, GRIDSENSE_AES128_KEY, 128) != 0) {
        mbedtls_aes_free(&ctx);
        return false;
    }

    int ret = mbedtls_aes_crypt_ctr(&ctx, plainLen, &nc_off, nonce, streamBlock,
                                    (const unsigned char*)plaintext, cipherBuf);
    mbedtls_aes_free(&ctx);

    if (ret != 0) return false;

    // Base64 encode the ciphertext
    if (maxLen < 8) return false;
    outCiphertext[0] = 'E';
    outCiphertext[1] = 'N';
    outCiphertext[2] = 'C';
    outCiphertext[3] = ':';

    size_t b64Len = 0;
    int b64Ret = mbedtls_base64_encode((unsigned char*)(outCiphertext + 4),
                                       maxLen - 5, &b64Len,
                                       cipherBuf, plainLen);
    if (b64Ret != 0) return false;

    outCiphertext[4 + b64Len] = '\0';
    return true;
}

bool gridsense_decrypt_payload(const char* inPayload, uint8_t srcId, uint16_t seq, char* outPlaintext, size_t maxLen) {
    if (!inPayload || !outPlaintext || maxLen < 2) return false;

    // If not prefixed with "ENC:", copy plaintext directly (backward compatible)
    if (strncmp(inPayload, "ENC:", 4) != 0) {
        strncpy(outPlaintext, inPayload, maxLen - 1);
        outPlaintext[maxLen - 1] = '\0';
        return false; // Indicates packet was not encrypted
    }

    const char* b64Str = inPayload + 4;
    size_t b64Len = strlen(b64Str);
    if (b64Len == 0) {
        outPlaintext[0] = '\0';
        return false;
    }

    uint8_t cipherBuf[160];
    size_t cipherLen = 0;

    int b64Ret = mbedtls_base64_decode(cipherBuf, sizeof(cipherBuf), &cipherLen,
                                       (const unsigned char*)b64Str, b64Len);
    if (b64Ret != 0 || cipherLen == 0) {
        strncpy(outPlaintext, inPayload, maxLen - 1);
        outPlaintext[maxLen - 1] = '\0';
        return false;
    }

    uint8_t nonce[16];
    uint8_t streamBlock[16] = {0};
    size_t nc_off = 0;

    build_nonce(srcId, seq, nonce);

    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);
    if (mbedtls_aes_setkey_enc(&ctx, GRIDSENSE_AES128_KEY, 128) != 0) {
        mbedtls_aes_free(&ctx);
        return false;
    }

    int ret = mbedtls_aes_crypt_ctr(&ctx, cipherLen, &nc_off, nonce, streamBlock,
                                    cipherBuf, (unsigned char*)outPlaintext);
    mbedtls_aes_free(&ctx);

    if (ret != 0) {
        strncpy(outPlaintext, inPayload, maxLen - 1);
        outPlaintext[maxLen - 1] = '\0';
        return false;
    }

    if (cipherLen < maxLen) {
        outPlaintext[cipherLen] = '\0';
    } else {
        outPlaintext[maxLen - 1] = '\0';
    }

    return true;
}
