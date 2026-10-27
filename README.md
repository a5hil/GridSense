# GridSense ⚡
### IoT-Based Low-Voltage Feeder Fault Detection, Isolation & Intelligent Reporting
**MCA Final Year Project | Federal Institute of Science And Technology (FISAT)**

---

## 📌 Project Overview
**GridSense** is an advanced, distributed IoT Supervisory and FDIR (Fault Detection, Isolation, and Restoration) system engineered for low-voltage (230V, 50Hz) electric distribution feeders (modeled on Kerala State Electricity Board / KSEB feeder topologies).

By combining split-core CT AC energy monitors (**PZEM-004T v4.0**), Sub-GHz LoRa transceivers (**Waveshare ESP32-S3-LR1121-HF**), and an architecture adapted from **Meshtastic**, GridSense detects, localizes, and reports overhead line faults in real-time.

```
 [ Substation ]
       │
       ▼
 [ Central Gateway ] ◄────── LoRa Sub-GHz (868 MHz) ──────┐
       │ (USB Serial)                                      │
       ▼                                                   │
 [ Tkinter FDIR Dashboard ]                                │
                                                           │
   [ Span 1 ]                           [ Span 1-2 ]       │
────────────────── Electric Pole 1 ────────────────── Electric Pole 2
                   (Incomer Node)                      (Outgoing Node)
                   - CT Sensor Clamp                   - CT Sensor Clamp
                   - BLE Lineman Service               - BLE Lineman Service
                   - Mesh Repeater Relay               - Leaf Endpoint Node
                   - AES-128 Crypto Engine             - AES-128 Crypto Engine
                   - Last Gasp Broadcast               - Last Gasp Broadcast
```

---

## 🚀 Key Architectural Innovations

| Feature | Mechanism & Implementation |
|---|---|
| **Central FDIR Engine** | Calculates inter-pole differential current ($\|I_1 - I_2\|$). Flags conductor breaks (`LINE_BREAK`), vegetation leakage/tapping (`DIFF_LEAKAGE` $\ge 0.350\text{A}$), overcurrent (`OVERCURRENT` $> 16\text{A}$), and scheduled load shedding (`POWERCUT`). |
| **BLE Lineman Access** | Nordic UART Service (NUS) over ESP32-S3 BLE allows field technicians to view live voltage/current and inject test scenarios via Android phone (*Serial Bluetooth Terminal*). |
| **Hop-Limited Mesh Framing** | `GS\|src\|relay\|dest\|seq\|hopLimit\|hopsTaken\|msgType\|payload` structure with a 32-entry, 30-second deduplication cache preventing broadcast storms. |
| **Role-Based Forwarding** | Supports `ROLE_ENDPOINT` (leaf node) and `ROLE_REPEATER` (zero-knowledge forwarding with LBT CAD collision avoidance and randomized backoff jitter). |
| **"Last Gasp" Dying Broadcast** | Instant event-driven packet (`MSG_TYPE_LAST_GASP = 0x04`) triggered upon voltage collapse ($< 50\text{V}$), eliminating the 10-second offline timeout and alerting crews within milliseconds. |
| **Hardware AES-128 Encryption** | Silicon-accelerated AES-128-CTR with Nonce binding to sequence numbers, securing Sub-GHz telemetry over public RF spectrum against eavesdropping and replay attacks. |

---

## 📂 Repository Directory Layout

```
├── web-dashboard/                     # 🌐 NEXT.JS SCADA OPERATIONS DESK & OMS
│   ├── src/app/                       # Next.js App Router (ADMS, Settings, OMS)
│   ├── src/components/scada/          # GisFeederMap, WorkforceOmsPanel, TrendChart
│   ├── src/lib/network/               # Physical topology, FDIR engine, ANSI protection
│   └── README.md                      # Web dashboard operating instructions
│
├── GridSense_TwoPole_System/          # 🌟 FIRMWARE & HARDWARE SYSTEM
│   ├── EdgeNode_Pole/                 # Edge Node Firmware (Pole 1 & Pole 2)
│   │   ├── EdgeNode_Pole.ino          # Core edge logic & FDIR simulation
│   │   ├── PZEM004T_Modbus.cpp/.h     # Modbus-RTU driver (RX 17, TX 18)
│   │   ├── lr1121_lbt_tx.cpp/.h       # LR1121 LBT CAD transceiver driver
│   │   ├── gridsense_packet.cpp/.h    # Hop-limited framing & deduplicator
│   │   ├── gridsense_crypto.cpp/.h    # ESP32-S3 hardware AES-128 engine
│   │   └── pole_ble_service.cpp/.h    # BLE Nordic UART Lineman service
│   ├── Central_Gateway/               # Central Gateway Substation Firmware
│   │   ├── Central_Gateway.ino        # Central FDIR evaluation & JSON streamer
│   │   ├── gridsense_crypto.cpp/.h    # Hardware AES-128 decryption
│   │   ├── gridsense_packet.cpp/.h    # Frame decoder & deduplicator
│   │   └── lr1121_rx.cpp/.h           # LR1121 background LoRa receiver
│   └── README.md                      # Detailed firmware flashing & wiring instructions
```

---

## ⚡ Quick Start Guide

### 1. Web SCADA & OMS Dashboard
```bash
cd web-dashboard
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
* Zero configuration required (runs with embedded simulation & in-memory database).
* Connects automatically to the Gateway USB serial port (`COM8` or auto-detected) if plugged in.

### 2. Flashing the Hardware (Arduino IDE)
* **Board:** `ESP32S3 Dev Module` (USB CDC On Boot: *Enabled*, Flash Size: *4MB*)
* **Flash Gateway:** Open [`GridSense_TwoPole_System/Central_Gateway/Central_Gateway.ino`](GridSense_TwoPole_System/Central_Gateway/Central_Gateway.ino) and upload.
* **Flash Pole 1 (Repeater):** Open [`GridSense_TwoPole_System/EdgeNode_Pole/EdgeNode_Pole.ino`](GridSense_TwoPole_System/EdgeNode_Pole/EdgeNode_Pole.ino), ensure `#define POLE_ID 1`, and upload.
* **Flash Pole 2 (Endpoint):** In `EdgeNode_Pole.ino`, set `#define POLE_ID 2`, and upload.

### 3. Remote Cloud Hosting (Render)
To stream local physical hardware to a cloud-deployed dashboard:
```bash
cd web-dashboard
npm run bridge -- https://your-gridsense-app.onrender.com
```
