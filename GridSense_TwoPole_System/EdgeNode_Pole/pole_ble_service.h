#pragma once
#include <Arduino.h>

typedef void (*BLECommandCallback)(char cmd);

void initPoleBLE(uint8_t poleId, BLECommandCallback cmdCallback = nullptr);
void updatePoleBLE();
void sendPoleBLEData(float v, float i, float p, float freq, float pf, float e, const char* stateStr);
void sendPoleBLEMessage(const char* msg);
bool isBLEClientConnected();
