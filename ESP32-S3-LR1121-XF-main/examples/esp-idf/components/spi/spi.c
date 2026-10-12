/*****************************************************************************
 * | File         :   spi.c
 * | Author       :   Waveshare team
 * | Function     :   Hardware underlying interface
 * | Info         :
 * |                 SPI driver code for SPI communication.
 * ----------------
 * | This version :   V1.0
 * | Date         :   2025-06-23
 * | Info         :   Basic version
 *
 ******************************************************************************/

#include "spi.h"  // Include SPI driver header for SPI functions
static const char *TAG = "spi";  // Define a tag for logging

spi_device_handle_t spi;

void DEV_SPI_Init()
{
    spi_bus_config_t buscfg = {
        .mosi_io_num = RADIO_MOSI,
        .miso_io_num = RADIO_MISO,
        .sclk_io_num = RADIO_CLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 64,
    };

    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = 8 * 1000 * 1000,  // 8 MHz
        .mode = 0,                          // SPI mode 0: CPOL=0, CPHA=0
        .spics_io_num = -1,
        .queue_size = 1,
    };

    // Initialize SPI bus
    ESP_ERROR_CHECK(spi_bus_initialize(SPI_HOST, &buscfg, SPI_DMA_CH_AUTO));

    // Add SPI device to bus
    ESP_ERROR_CHECK(spi_bus_add_device(SPI_HOST, &devcfg, &spi));
    ESP_LOGI(TAG, "SPI initialized\r");
}


void DEV_SPI_Write_Bytes(const uint8_t* tx_buf, size_t length)
{
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = length * 8;       // Length is in bits
    t.tx_buffer = tx_buf;

    ESP_ERROR_CHECK(spi_device_transmit(spi, &t));
}

void DEV_SPI_Read_Bytes(uint8_t* rx_buf, size_t length)
{
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = length * 8;       // Length is in bits
    t.rx_buffer = rx_buf;

    ESP_ERROR_CHECK(spi_device_transmit(spi, &t));
}
