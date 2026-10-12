/*!
 * @file      pole_ble_service.cpp
 * @brief     BLE Lineman Diagnostic Service (Nordic UART Service - NUS)
 * @details   Allows linemen/field technicians to connect to the pole node wirelessly
 *            using any standard mobile app (e.g., Serial Bluetooth Terminal on Android/iOS)
 *            to inspect live AC telemetry, view fault diagnostics, and send test commands.
 */

#include "pole_ble_service.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

static BLEServer* pServer = nullptr;
static BLECharacteristic* pTxCharacteristic = nullptr;
static bool deviceConnected = false;
static bool oldDeviceConnected = false;
static BLECommandCallback commandCallback = nullptr;
static uint8_t activePoleId = 1;

class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("[BLE] Smartphone connected!");
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("[BLE] Smartphone disconnected.");
    }
};

class RxCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String rxValue = pCharacteristic->getValue();
        if (rxValue.length() > 0) {
            rxValue.trim();
            Serial.printf("[BLE RX] Command received: %s\n", rxValue.c_str());

            char cmd = rxValue.charAt(0);
            if (commandCallback) {
                commandCallback(cmd);
            }

            // Interactive response to smartphone
            if (rxValue.equalsIgnoreCase("help") || rxValue.equalsIgnoreCase("?")) {
                sendPoleBLEMessage(
                    "\n--- GridSense Lineman Help ---\n"
                    "Commands:\n"
                    " 'status' : Show full pole metrics\n"
                    " 'n'      : Normal load mode\n"
                    " 'd'      : Inject differential leakage\n"
                    " 'o'      : Inject overcurrent\n"
                    " 'u'      : Inject undervoltage\n"
                    " 'p'      : Inject power cut (0V)\n"
                    " 'c'      : Inject line charging\n"
                    "-----------------------------\n"
                );
            }
        }
    }
};

void initPoleBLE(uint8_t poleId, BLECommandCallback cmdCallback) {
    activePoleId = poleId;
    commandCallback = cmdCallback;

    char devName[32];
    snprintf(devName, sizeof(devName), "GridSense-Pole-%d", poleId);

    Serial.printf("[BLE] Initializing Bluetooth Service: %s ...\n", devName);
    BLEDevice::init(devName);
    BLEDevice::setMTU(512);

    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    BLEService *pService = pServer->createService(SERVICE_UUID);

    // TX Characteristic (Notify to Phone)
    pTxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID_TX,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pTxCharacteristic->addDescriptor(new BLE2902());

    // RX Characteristic (Write from Phone)
    BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID_RX,
        BLECharacteristic::PROPERTY_WRITE
    );
    pRxCharacteristic->setCallbacks(new RxCallbacks());

    pService->start();

    // Start Advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);  // iPhone connection helper
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.printf("[BLE] Advertising as '%s'. Ready for mobile pairing.\n", devName);
}

void updatePoleBLE() {
    // Handle disconnection restart advertising
    if (!deviceConnected && oldDeviceConnected) {
        delay(100);
        pServer->startAdvertising();
        Serial.println("[BLE] Restarted advertising.");
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
        // Greet newly connected phone
        char welcome[128];
        snprintf(welcome, sizeof(welcome), 
                 "\n[CONNECTED] GridSense Pole %d Diagnostics\nType '?' for commands.\n", activePoleId);
        sendPoleBLEMessage(welcome);
    }
}

void sendPoleBLEMessage(const char* msg) {
    if (!deviceConnected || !pTxCharacteristic) return;
    size_t len = strlen(msg);
    size_t offset = 0;
    while (offset < len) {
        size_t chunk = (len - offset > 20) ? 20 : (len - offset);
        pTxCharacteristic->setValue((uint8_t*)(msg + offset), chunk);
        pTxCharacteristic->notify();
        offset += chunk;
        if (offset < len) delay(15);
    }
}

void sendPoleBLEData(float v, float i, float p, float freq, float pf, float e, const char* stateStr) {
    if (!deviceConnected || !pTxCharacteristic) return;

    char buf[160];
    snprintf(buf, sizeof(buf),
             "[P%d] V:%.1fV | I:%.3fA | P:%.1fW | F:%.1fHz | PF:%.2f | %s\n",
             activePoleId, v, i, p, freq, pf, stateStr);

    sendPoleBLEMessage(buf);
}

bool isBLEClientConnected() {
    return deviceConnected;
}
