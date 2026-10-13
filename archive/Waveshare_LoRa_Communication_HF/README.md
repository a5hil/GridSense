# Waveshare ESP32-S3-LR1121-HF LoRa Communication Guide

This project provides complete code and setup instructions for point-to-point wireless communication between two **Waveshare ESP32-S3-LR1121-HF** LoRa modules using the Arduino IDE.

---

## 1. Hardware Overview & Pinout

The **ESP32-S3-LR1121-HF** features an ESP32-S3 dual-core microcontroller and the Semtech **LR1121** multi-band transceiver configured for High-Frequency (HF) operation:
- **Sub-GHz LoRa Band**: 850 MHz ~ 930 MHz (868 MHz EU/IN, 915 MHz US/AU)
- **S-Band**: 1.9 GHz ~ 2.1 GHz
- **2.4 GHz Band**: 2400 MHz ~ 2500 MHz

### Internal SPI & Control Pinout
The LR1121 is connected to the ESP32-S3 on the board via the following internal pins:
| Signal / Macro | ESP32-S3 GPIO | Description |
| :--- | :---: | :--- |
| `RADIO_CS` | **GPIO 42** | SPI Chip Select |
| `RADIO_CLK` (SCK) | **GPIO 40** | SPI Clock |
| `RADIO_MOSI` | **GPIO 45** | SPI Master Out Slave In |
| `RADIO_MISO` | **GPIO 46** | SPI Master In Slave Out |
| `RADIO_RESET` | **GPIO 39** | Radio Reset |
| `RADIO_BUSY` | **GPIO 41** | Radio Busy Line |
| `RADIO_IRQ` | **GPIO 38** | Radio DIO Interrupt |
| `RADIO_LED` | **GPIO 2** | Onboard User Status LED |

> [!CAUTION]
> **Antenna Warning:** Always connect the provided IPEX-1 / SMA antenna to **BOTH** modules before powering them on or transmitting. Transmitting without an antenna can permanently damage the radio's Power Amplifier (PA).

---

## 2. Arduino IDE Setup & Library Installation

### Step A: Install ESP32 Board Package
1. In Arduino IDE, open **File** -> **Preferences**.
2. Add the Espressif ESP32 package URL to *Additional boards manager URLs*:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Go to **Tools** -> **Board** -> **Boards Manager**, search for `esp32` and install version `2.0.x` or `3.x`.

### Step B: Install Waveshare LR1121 Driver Library
Copy the `waveshare_lroa_1121` folder from your cloned repository into your Arduino `libraries` folder:
- **Source Folder:**  
  `ESP32-S3-LR1121-XF-main\examples\arduino\waveshare_lroa_1121`
- **Destination Folder:**  
  `C:\Users\<YourUsername>\Documents\Arduino\libraries\waveshare_lroa_1121`

*(In Arduino IDE, check `File` -> `Preferences` -> `Sketchbook location` to confirm your `libraries` path).*

---

## 3. Mandatory Arduino IDE Board Configuration

When uploading sketches to the ESP32-S3-LR1121 module, select:
- **Board:** `"ESP32S3 Dev Module"`
- **USB CDC On Boot:** **`"Enabled"`** *(CRITICAL: If disabled, `Serial.print()` will NOT display on the USB Serial Monitor!)*
- **CPU Frequency:** `"240MHz (WiFi)"`
- **Flash Mode:** `"QIO 80MHz"`
- **Flash Size:** `"4MB (32Mb)"`
- **Partition Scheme:** `"Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)"`
- **PSRAM:** `"QSPI PSRAM"`
- **Upload Mode:** `"UART0 / Hardware CDC"`

---

## 4. Communication Modes Included

### Project 1: One-Way Transmitter & Receiver
Ideal for telemetry, sensor data transfer, or remote commands.

1. **Module 1 (Transmitter):**
   - Open [Transmitter_HF.ino](file:///c:/Users/Ashil/Desktop/MCA%20Project/GridSense/LoRa_Communication_HF/Transmitter_HF/Transmitter_HF.ino).
   - Select your COM port for Board 1.
   - Click **Upload**.
   - It will transmit a packet every 3 seconds: `GridSense Node-01 | Pkt: X | Up: Ys`.
   - The onboard LED blinks during transmission.

2. **Module 2 (Receiver):**
   - Open [Receiver_HF.ino](file:///c:/Users/Ashil/Desktop/MCA%20Project/GridSense/LoRa_Communication_HF/Receiver_HF/Receiver_HF.ino).
   - Select the COM port for Board 2.
   - Click **Upload**.
   - Open Serial Monitor at **115200 baud**.
   - When each packet is received, the onboard LED blinks and logs:
     - Received Payload text
     - Packet RSSI (dBm)
     - Signal RSSI (dBm)
     - SNR (dB)

---

### Project 2: Bidirectional Ping-Pong (Two-Way)
Ideal for testing round-trip latency, packet loss, and full-duplex responsiveness.

- Open [Bidirectional_PingPong_HF.ino](file:///c:/Users/Ashil/Desktop/MCA%20Project/GridSense/LoRa_Communication_HF/Bidirectional_PingPong_HF/Bidirectional_PingPong_HF.ino).
- **For Board 1:**
  - Leave `#define IS_MASTER 1`
  - Upload to Board 1.
- **For Board 2:**
  - Change to `#define IS_MASTER 0`
  - Upload to Board 2.
- **Operation:**
  - Board 1 sends `PING #1`.
  - Board 2 receives `PING #1` and replies `PONG #1`.
  - Board 1 receives `PONG #1`, computes Round-Trip Time (RTT in ms), prints signal metrics (RSSI / SNR), and sends `PING #2`.

---

## 5. Frequency & Region Configuration

In `lr1121_config.h` in each project folder, the frequency is set to `868000000UL` by default:
```c
#define RF_FREQ_IN_HZ  868000000UL  // 868 MHz (Europe / India)
```

If you are located in the Americas, Australia, or Asia where 915 MHz is standard, simply change it on both nodes:
```c
#define RF_FREQ_IN_HZ  915000000UL  // 915 MHz (US / Australia / Americas)
```

> [!NOTE]
> **Image Calibration for HF:** Unlike generic vendor samples that defaulted to 430–440 MHz (which triggers calibration errors on HF boards), these sketches automatically configure the image calibration registers for your selected frequency (868 MHz or 915 MHz).
