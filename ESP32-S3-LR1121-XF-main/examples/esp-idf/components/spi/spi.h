/*****************************************************************************
 * | File         :   spi.h
 * | Author       :   Waveshare team
 * | Function     :   Hardware underlying interface
 * | Info         :
 * |                 I2C driver code for I2C communication.
 * ----------------
 * | This version :   V1.0
 * | Date         :   2024-11-26
 * | Info         :   Basic version
 *
 ******************************************************************************/

#ifndef __I2C_H
#define __I2C_H

#include <stdio.h>          // Standard input/output library
#include <string.h>         // String manipulation functions
#include "driver/spi_master.h"    // ESP32 I2C master driver library
#include "esp_log.h"        // ESP32 logging library for debugging
#include "gpio.h"           // GPIO header for pin configuration

// Function prototypes for SPI communication
#define SPI_HOST    SPI2_HOST

void DEV_SPI_Init();

void DEV_SPI_Write_Bytes(const uint8_t* tx_buf, size_t length);
void DEV_SPI_Read_Bytes(uint8_t* rx_buf, size_t length);

#endif
