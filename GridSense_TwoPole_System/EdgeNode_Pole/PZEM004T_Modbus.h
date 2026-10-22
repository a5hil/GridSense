/*!
 * @file      PZEM004T_Modbus.h
 * @brief     Lightweight, direct Modbus-RTU reader for Peacefair PZEM-004T v4.0 (Split CT)
 *            Supports single-module and multi-drop addressing (0x01–0xF7) on a shared UART.
 *            Zero external library dependencies.
 * @project   GridSense - MCA Project, FISAT
 */

#ifndef PZEM004T_MODBUS_H
#define PZEM004T_MODBUS_H

#include <Arduino.h>
#include <HardwareSerial.h>

struct PZEMData {
    float voltage;       // Volts (0.1V resolution)
    float current;       // Amperes (0.001A resolution)
    float power;         // Watts (0.1W resolution)
    float energy;        // Watt-hours (1Wh resolution)
    float frequency;     // Hertz (0.1Hz resolution)
    float pf;            // Power factor (0.01 resolution)
    bool  alarm;         // Over-power alarm status
    bool  isValid;       // True if last reading had valid CRC & response
    uint32_t lastReadMs; // Timestamp of last successful read
};

class PZEM004T_Modbus {
public:
    PZEM004T_Modbus(HardwareSerial& serialPort, int8_t rxPin, int8_t txPin, uint8_t addr = 0xF8);

    void begin();

    /**
     * @brief Polls default slave address configured at construction.
     */
    bool read(PZEMData& data);

    /**
     * @brief Polls a specific Modbus slave address on the shared UART bus.
     * @param slaveAddr Target address (0x01 to 0xF7, or 0xF8 default).
     */
    bool readFrom(uint8_t slaveAddr, PZEMData& data);

    /**
     * @brief Reprograms the slave address of the connected PZEM module.
     * @details Uses Modbus Command 0x06 (Write Single Register) at register 0x0002.
     *          Connect only ONE PZEM module to the bus during address programming!
     * @param targetAddr Current address (or 0xF8 default).
     * @param newAddr New slave address (0x01–0xF7).
     * @return true if module acknowledged and updated its EEPROM.
     */
    bool setSlaveAddress(uint8_t targetAddr, uint8_t newAddr);

    uint8_t getAddress() const { return _addr; }
    void setAddress(uint8_t addr) { _addr = addr; }

private:
    HardwareSerial& _serial;
    int8_t _rxPin;
    int8_t _txPin;
    uint8_t _addr;

    uint16_t calculateCRC(const uint8_t* buffer, uint16_t len);
    void sendReadCommand(uint8_t slaveAddr);
    bool receiveResponse(uint8_t* buffer, uint16_t expectedLen, uint32_t timeoutMs = 250);
};

#endif // PZEM004T_MODBUS_H
