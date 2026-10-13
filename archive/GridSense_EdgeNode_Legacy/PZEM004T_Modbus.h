/*!
 * @file      PZEM004T_Modbus.h
 * @brief     Lightweight, direct Modbus-RTU reader for Peacefair PZEM-004T v3.0 / v4.0
 *            Designed for ESP32-S3 HardwareSerial without external library dependencies.
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
    bool read(PZEMData& data);
    uint8_t getAddress() const { return _addr; }

private:
    HardwareSerial& _serial;
    int8_t _rxPin;
    int8_t _txPin;
    uint8_t _addr;

    uint16_t calculateCRC(const uint8_t* buffer, uint16_t len);
    void sendReadCommand();
    bool receiveResponse(uint8_t* buffer, uint16_t expectedLen, uint32_t timeoutMs = 250);
};

#endif // PZEM004T_MODBUS_H
