# GridSense Legacy & Reference Archive

This directory contains early single-pole test sketches, vendor test firmware, and preliminary validation code preserved for project defense, historical evaluation, and reference.

---

### Archive Directory Structure

| Directory | Description | Purpose / History |
|---|---|---|
| `GridSense_EdgeNode_Legacy/` | Early single-pole edge node firmware | Initial PZEM-004T driver & raw LoRa TX bench testing prior to multi-pole mesh framing. |
| `GridSense_Gateway_Legacy/` | Early single-receiver gateway sketch | Preliminary raw packet receiver test before multi-pole FDIR engine was built. |
| `Waveshare_LoRa_Communication_HF/` | Factory Waveshare LoRa sub-GHz examples | Vendor sample sketches (`Bidirectional_PingPong_HF`, `Receiver_HF`, `Transmitter_HF`) used to verify LR1121 SPI communication. |

---

### Official Active Codebase

For the complete, production-grade Two-Pole System featuring:
- **Hop-Limited Framing & Deduplication**
- **Role-Based Routing** (`ROLE_REPEATER` vs `ROLE_ENDPOINT`)
- **BLE Lineman Smartphone Access** (Nordic UART Service)
- **"Last Gasp" Dying Outage Broadcast**
- **Hardware-Accelerated AES-128 Encryption**
- **Real-Time Central FDIR Supervisory Dashboard**

👉 **Go to:** [`GridSense_TwoPole_System/`](../GridSense_TwoPole_System/)
