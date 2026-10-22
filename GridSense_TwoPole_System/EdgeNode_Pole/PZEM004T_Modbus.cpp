/*!
 * @file      PZEM004T_Modbus.cpp
 * @brief     Lightweight, direct Modbus-RTU implementation for PZEM-004T v4.0 (Split CT)
 *            Supports single-module and multi-drop addressing (0x01–0xF7) on a shared UART.
 * @project   GridSense - MCA Project, FISAT
 */

#include "PZEM004T_Modbus.h"

#define CMD_READ_INPUT_REGISTERS 0x04
#define CMD_WRITE_SINGLE_REG     0x06
#define START_REGISTER           0x0000
#define NUM_REGISTERS            0x000A // 10 registers = 20 data bytes
#define ADDR_REGISTER            0x0002 // Register for Modbus slave address
#define RESPONSE_FRAME_SIZE      25     // 1(addr) + 1(cmd) + 1(len) + 20(data) + 2(crc)

PZEM004T_Modbus::PZEM004T_Modbus(HardwareSerial& serialPort, int8_t rxPin, int8_t txPin, uint8_t addr)
    : _serial(serialPort), _rxPin(rxPin), _txPin(txPin), _addr(addr) {}

void PZEM004T_Modbus::begin() {
    _serial.begin(9600, SERIAL_8N1, _rxPin, _txPin);
    while (_serial.available()) {
        _serial.read();
    }
}

uint16_t PZEM004T_Modbus::calculateCRC(const uint8_t* buffer, uint16_t len) {
    uint16_t crc = 0xFFFF;
    for (uint16_t pos = 0; pos < len; pos++) {
        crc ^= (uint16_t)buffer[pos];
        for (int i = 8; i != 0; i--) {
            if ((crc & 0x0001) != 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

void PZEM004T_Modbus::sendReadCommand(uint8_t slaveAddr) {
    while (_serial.available()) {
        _serial.read();
    }

    uint8_t cmd[8];
    cmd[0] = slaveAddr;
    cmd[1] = CMD_READ_INPUT_REGISTERS;
    cmd[2] = (START_REGISTER >> 8) & 0xFF;
    cmd[3] = (START_REGISTER) & 0xFF;
    cmd[4] = (NUM_REGISTERS >> 8) & 0xFF;
    cmd[5] = (NUM_REGISTERS) & 0xFF;

    uint16_t crc = calculateCRC(cmd, 6);
    cmd[6] = crc & 0xFF;
    cmd[7] = (crc >> 8) & 0xFF;

    _serial.write(cmd, sizeof(cmd));
    _serial.flush();
}

bool PZEM004T_Modbus::receiveResponse(uint8_t* buffer, uint16_t expectedLen, uint32_t timeoutMs) {
    uint32_t startMs = millis();
    uint16_t bytesRead = 0;

    while ((millis() - startMs) < timeoutMs && bytesRead < expectedLen) {
        if (_serial.available()) {
            buffer[bytesRead++] = _serial.read();
        } else {
            delay(1);
        }
    }

    return (bytesRead == expectedLen);
}

bool PZEM004T_Modbus::read(PZEMData& data) {
    return readFrom(_addr, data);
}

bool PZEM004T_Modbus::readFrom(uint8_t slaveAddr, PZEMData& data) {
    sendReadCommand(slaveAddr);

    uint8_t response[RESPONSE_FRAME_SIZE];
    memset(response, 0, sizeof(response));

    if (!receiveResponse(response, RESPONSE_FRAME_SIZE, 300)) {
        data.isValid = false;
        return false;
    }

    // Verify Slave Addr, Command, and Byte Count
    if (response[0] != slaveAddr || response[1] != CMD_READ_INPUT_REGISTERS || response[2] != 0x14) {
        data.isValid = false;
        return false;
    }

    uint16_t calcCRC = calculateCRC(response, RESPONSE_FRAME_SIZE - 2);
    uint16_t recvCRC = response[23] | (response[24] << 8);

    if (calcCRC != recvCRC) {
        data.isValid = false;
        return false;
    }

    // Decode registers
    // Reg 0: Voltage (0.1V)
    uint16_t v_raw = ((uint16_t)response[3] << 8) | response[4];
    data.voltage = v_raw * 0.1f;

    // Reg 1-2: Current (32-bit Little-Endian, 0.001A)
    uint32_t i_low  = ((uint32_t)response[5] << 8) | response[6];
    uint32_t i_high = ((uint32_t)response[7] << 8) | response[8];
    uint32_t i_raw  = (i_high << 16) | i_low;
    data.current = i_raw * 0.001f;

    // Reg 3-4: Power (32-bit, 0.1W)
    uint32_t p_low  = ((uint32_t)response[9] << 8) | response[10];
    uint32_t p_high = ((uint32_t)response[11] << 8) | response[12];
    uint32_t p_raw  = (p_high << 16) | p_low;
    data.power = p_raw * 0.1f;

    // Reg 5-6: Energy (32-bit, 1Wh)
    uint32_t e_low  = ((uint32_t)response[13] << 8) | response[14];
    uint32_t e_high = ((uint32_t)response[15] << 8) | response[16];
    uint32_t e_raw  = (e_high << 16) | e_low;
    data.energy = (float)e_raw;

    // Reg 7: Frequency (0.1Hz)
    uint16_t f_raw = ((uint16_t)response[17] << 8) | response[18];
    data.frequency = f_raw * 0.1f;

    // Reg 8: Power Factor (0.01)
    uint16_t pf_raw = ((uint16_t)response[19] << 8) | response[20];
    data.pf = pf_raw * 0.01f;

    // Reg 9: Alarm Status
    uint16_t alarm_raw = ((uint16_t)response[21] << 8) | response[22];
    data.alarm = (alarm_raw == 0xFFFF);

    data.isValid = true;
    data.lastReadMs = millis();
    return true;
}

bool PZEM004T_Modbus::setSlaveAddress(uint8_t targetAddr, uint8_t newAddr) {
    if (newAddr < 0x01 || newAddr > 0xF7) {
        return false;
    }

    while (_serial.available()) {
        _serial.read();
    }

    uint8_t cmd[8];
    cmd[0] = targetAddr;
    cmd[1] = CMD_WRITE_SINGLE_REG;
    cmd[2] = (ADDR_REGISTER >> 8) & 0xFF;
    cmd[3] = (ADDR_REGISTER) & 0xFF;
    cmd[4] = 0x00;
    cmd[5] = newAddr;

    uint16_t crc = calculateCRC(cmd, 6);
    cmd[6] = crc & 0xFF;
    cmd[7] = (crc >> 8) & 0xFF;

    _serial.write(cmd, sizeof(cmd));
    _serial.flush();

    // The PZEM module echoes back the 8-byte write command upon success
    uint8_t response[8];
    if (!receiveResponse(response, 8, 300)) {
        return false;
    }

    uint16_t respCRC = calculateCRC(response, 6);
    uint16_t expectedCRC = response[6] | (response[7] << 8);

    if (respCRC != expectedCRC) {
        return false;
    }

    // Verify write echo
    if (response[0] == targetAddr && response[1] == CMD_WRITE_SINGLE_REG && response[5] == newAddr) {
        _addr = newAddr;
        return true;
    }

    return false;
}
