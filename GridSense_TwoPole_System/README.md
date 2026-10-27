# GridSense: Two-Pole Distributed FDIR Prototype
**MCA Project | FISAT**

---

## 1. System Overview
GridSense demonstrates an IoT-based Fault Detection, Isolation, and Restoration (FDIR) prototype using three **Waveshare ESP32-S3-LR1121-HF** LoRa modules operating at 866.3 MHz (Indian IN865 license-exempt band):

1. **Pole 1 Edge Node (Incomer):** Clamped to the incoming phase conductor on Electric Pole 1 with a PZEM-004T v4.0 split-core CT.
2. **Pole 2 Edge Node (Outgoing / Load side):** Clamped to the outgoing phase conductor on Electric Pole 2 with a PZEM-004T v4.0 split-core CT.
3. **Central Gateway:** Continuously listens for Sub-GHz LoRa packets from both poles, evaluates inter-pole differential current ($\Delta I = |I_1 - I_2|$), triggers FDIR isolation alerts when $\Delta I \ge 0.35\text{ A}$, and streams correlated JSON over USB Serial to the host dashboard.

---

## 2. Flashing the Boards

### Mandatory Arduino IDE Board Settings (for all 3 boards)
- **Board:** `ESP32S3 Dev Module`
- **USB CDC On Boot:** `Enabled`  *(Crucial for Serial.print)*
- **Flash Size:** `4MB (32Mb)`
- **Flash Mode:** `QIO 80MHz`
- **Partition Scheme:** `Default 4MB with spiffs`
- **PSRAM:** `QSPI PSRAM`

---

### Board 1: Electric Pole 1 (Incomer)
- Open [`EdgeNode_Pole/EdgeNode_Pole.ino`](EdgeNode_Pole/EdgeNode_Pole.ino).
- Verify:
  ```cpp
  #define POLE_ID 1
  #define USE_MOCK_SENSORS true   // Running on Mock Mode for bench testing
  ```
- Select Board 1's COM Port and click **Upload**.

---

### Board 2: Electric Pole 2 (Outgoing)
- Open [`EdgeNode_Pole/EdgeNode_Pole.ino`](EdgeNode_Pole/EdgeNode_Pole.ino).
- Change to:
  ```cpp
  #define POLE_ID 2
  #define USE_MOCK_SENSORS true   // Running on Mock Mode for bench testing
  ```
- Select Board 2's COM Port and click **Upload**.

---

### Board 3: Central Gateway
- Open [`Central_Gateway/Central_Gateway.ino`](Central_Gateway/Central_Gateway.ino).
- Select Board 3's COM Port and click **Upload**.
- Keep Board 3 plugged into the host PC via USB.

---

## 3. Running the SCADA Web Dashboard

The primary supervisory control and outage management desk is built in Next.js in [`web-dashboard/`](../web-dashboard/).

1. Navigate to the web dashboard directory:
   ```bash
   cd web-dashboard
   npm install
   npm run dev
   ```
2. Open [http://localhost:3000](http://localhost:3000) in your browser.
3. Plug the Central Gateway (Board 3) into your PC via USB. The dashboard automatically connects to `COM8` (or auto-detects your port) and streams live telemetry, showing:
   - Real-time Voltages, Currents, Active Power, Frequency, PF, Energy.
   - RF Link Quality (RSSI in dBm, SNR in dB, Packet Sequence, Age).
   - Dynamic **Differential Current Gauge** ($|I_1 - I_2|$) with safety limit marker at $0.350\text{ A}$.
   - Central FDIR Protection Decision banner & Outage Management System (OMS).
   - Live timestamped event and packet log.

> **Remote Cloud Hosting:** If hosting the dashboard on Render, simply run the serial bridge on your laptop:
> ```bash
> npm run bridge -- https://your-app.onrender.com
> ```

---

## 4. Demonstrating Faults (Mock Mode Keyboard Commands)

While running in Mock Mode, open the Arduino **Serial Monitor** (115200 baud) for either Pole Node (Board 1 or Board 2) and type any of these keys:

| Key | Scenario | Edge Node Behavior | Gateway FDIR Action |
| :---: | :--- | :--- | :--- |
| **`n`** | **Normal Grid** | Balanced load ($I_1 \approx I_2 \approx 2.45\text{ A}$) | `LINE_HEALTHY` (Green) |
| **`d`** | **Differential Fault** | Injects high leakage ($I_1 = 3.85\text{ A}$, $I_2 = 1.15\text{ A}$, $\Delta I = 2.70\text{ A}$) | `TRIP_ISOLATE_POLE_1_2` (Red Alert) |
| **`o`** | **Overcurrent** | Simulates overload ($I > 18\text{ A}$) | `TRIP_OVERCURRENT_SHED` |
| **`u`** | **Undervoltage** | Simulates voltage sag ($V < 165\text{ V}$) | `ALARM_UNDERVOLTAGE` |
| **`a`** | **Auto-Cycle Demo** | Automatically cycles normal $\to$ fault $\to$ normal every few packets | Demonstrates full automated recovery cycle |

---

## 5. Wiring Live PZEM-004T v4.0 Sensors (Future Step)

When you are ready to connect physical sensors:
1. Change `#define USE_MOCK_SENSORS false` in `EdgeNode_Pole.ino`.
2. Connect:
   - **PZEM TX** $\to$ **ESP32-S3 GPIO 17** (Serial1 RX)
   - **PZEM RX** $\to$ **ESP32-S3 GPIO 18** (Serial1 TX)
   - **PZEM 5V** $\to$ **5V / VBUS**
   - **PZEM GND** $\to$ **GND**
   - **Split CT clamp** $\to$ Clamp around the phase conductor on that pole.
