# GridSense ADMS: Engineering Reconciliation & Viva Defense Specification
**Document Version:** 3.0.0 (Comprehensive Engineering & Defense Specification)  
**Target System:** GridSense 415V/230V Low-Tension (LT) Distribution Network ADMS & Hardware-in-the-Loop Testbed  
**Classification:** Academic Thesis Specification & Experimental Verification Protocol  

---

## 1. Executive Engineering Assessment

This document serves as the authoritative, peer-reviewed engineering specification and implementation plan for the GridSense Advanced Distribution Management System (ADMS). It directly resolves all technical edge-cases, physical constraints, metrological limits, and safety-interlock logic identified during comprehensive system reviews.

### Core Tenets of the v3.0.0 Architecture:
1. **Physical Conservation (KCL):** Reconciles the lab test bench (carrying ~2.4 A) with the simulated 28-pole digital twin by introducing **dynamically scaled downstream loads** on Feeder LT-1, guaranteeing that Kirchhoff's Current Law is mathematically preserved across the entire radial corridor.
2. **Deterministic RF Telemetry (No On-Air Collisions):** Eliminates on-air LoRa packet collisions and asynchronous clock drift by replacing uncoordinated random transmissions with **Gateway-Polled Time-Division Ingestion (TDMA)**.
3. **Safe, Multi-Layered Protection State Machine:** Eliminates unsafe auto-closing of outage tickets, accounts for line-powered sensor blackout during broken conductor events, incorporates multi-cycle debounce with hysteresis, and handles undervoltage fault ambiguity ($0.22\text{ p.u.} < V < 0.78\text{ p.u.}$).
4. **Authentic Metrology & Scaling Defense:** Corrects component datasheets (SDIC SD3004, Class 1.0, non-THD), replaces US standards with statutory Indian Grid Regulations (**CEA Regulations 2023 / IS 12360**), and provides the theoretical foundation for dual-slope percentage-restrained differential protection at utility scale.
5. **Test-First Automated Verification:** Precedes code changes with an automated invariant test suite (`fdir_invariants.test.ts`) that verifies KCL conservation, monotonic voltage drop, debounce hold-off, and state transitions against recorded real-world serial streams.

---

## 2. RF Telemetry, Time Alignment & Collision Plan

### 2.1 The Asynchronous Drift & Collision Vulnerability
* **The Physics:** Operating two LoRa nodes transmitting 40-byte frames (Time-on-Air $\approx 285\text{ ms}$ at SF9, 125 kHz BW, CR 4/5) at uncoordinated intervals causes on-air packet overlap probability to exceed **50%**, resulting in packet corruption. Furthermore, comparing raw `rtu_ms` millisecond counters between two free-running microcontroller crystals is invalid because crystal oscillator offsets cause severe clock drift within minutes.
* **The Architecture Fix: Gateway-Polled TDMA Architecture:**
  * The Substation Gateway operates as the **master clock coordinator**.
  * The Gateway issues periodic polling requests every **1,000 ms**:
    $$\text{Gateway} \xrightarrow{\text{POLL\_P01}} \text{Pole 1} \xrightarrow{\text{RESP\_P01 (285 ms)}} \text{Gateway} \xrightarrow{\text{POLL\_P02}} \text{Pole 2} \xrightarrow{\text{RESP\_P02 (285 ms)}} \text{Gateway}$$
  * **Benefits:**
    1. **Zero on-air collisions:** Only one node transmits on 866.3 MHz at any instant.
    2. **Deterministic time synchronization:** Telemetry frames are paired based on the Gateway's internal high-resolution monotonic clock ($T_{\text{gw\_epoch}}$), eliminating crystal skew.
    3. **Deterministic packet age:** Each node reports at known 1,000 ms intervals.

### 2.2 Quality Flag State Machine
Instead of arbitrary timeout thresholds, each RTU node is governed by a formal three-state quality flag:
```
  [ GOOD ] ──(Packet age > 1,500 ms)──> [ STALE ] ──(Packet age > 4,000 ms)──> [ TIMEOUT ]
     ▲                                      │                                      │
     └──────────(Valid Packet Ingest)───────┴──────────────────────────────────────┘
```

* **Quality States:**
  * **`GOOD`**: Packet age $\le 1,500\text{ ms}$. Protection fully active.
  * **`STALE`**: $1,500\text{ ms} < \text{Age} \le 4,000\text{ ms}$. Node visually greyed out on SLD. Hold last valid differential state for a maximum of **$1,500\text{ ms}$**.
  * **`TIMEOUT`**: $\text{Age} > 4,000\text{ ms}$ ($> 3$ consecutively missed polling cycles). Transition global banner to **`PROTECTION BLIND / DEGRADED`**. Trip logic is frozen; audible alarm sounds for communication degradation.

### 2.3 Skew Pairing, Multi-Sample Debounce & Hysteresis
1. **Pairing Guard:** A differential calculation $\Delta I = |I_{\text{P01}} - I_{\text{P02}}|$ is evaluated only if both node packets have a Gateway arrival time skew $\Delta t \le 600\text{ ms}$. If skew exceeds $600\text{ ms}$, mark calculation as `SKEW_UNCERTAIN`.
2. **3-Cycle Debounce:** An ANSI 87L differential trip requires **3 consecutive over-threshold paired cycles** (~2.5–3.0 seconds total hold-off). This eliminates false tripping caused by inrush currents or single-packet transmission noise during domestic appliance switching.
3. **Trip / Reset Hysteresis:**
   * **Trip Pickup ($I_{\text{pickup}}$):** Determined empirically from the 2-hour Null Test (nominal target: **$0.350\text{ A}$**).
   * **Reset Threshold ($I_{\text{reset}}$):** Set to **$0.250\text{ A}$** (a 100 mA deadband preventing relay chatter at the decision boundary).

---

## 3. Physical Consistency & KCL Reconciliation

### 3.1 Dynamic KCL Load Scaling ($k$)
* **The Reality:** The physical bench carries small loads (~2.4 A). The downstream poles on Feeder LT-1 model 8 distribution poles feeding consumer houses.
* **The Solution:** The digital twin calculates a dynamic scaling factor $k_{\text{bench}}$ at every load-flow cycle based on live measured current $I_{\text{P02}}$:
  $$k_{\text{bench}} = \frac{I_{\text{P02, measured}}}{\sum_{n=3}^{10} I_{\text{base}, n}}$$
  * Simulated loads on `LT1-P03` through `LT1-P10` are multiplied by $k_{\text{bench}}$ so that:
    $$I_{\text{P02}} = \sum_{n=3}^{10} I_{\text{load}, n} + I_{\text{span\_losses}} + I_{\text{leak}}$$
  * Feeders LT-2 (Commercial) and LT-3 (Industrial Lane) remain at full utility scale (tens of amperes) to demonstrate macro DTR loading (250 kVA pad transformer).
  * **SLD Labeling:** Feeder LT-1 is explicitly labeled: `FEEDER LT-1 (BENCH-SCALED LOAD MODEL: k = {k_bench.toFixed(3)})`.
  * **Impedance Note:** Conductor impedance ($Z_{\text{cable}}$) is kept at physical ACSR/ABC values. Consequently, the voltage drop along LT-1 is proportional to scaled current ($k \cdot I$). Documentation will explicitly state: *"Voltage drops and copper losses on Feeder LT-1 reflect the bench-scaled model, while Feeders LT-2 and LT-3 reflect unscaled distribution network physics."*

### 3.2 Automated Physical Invariants
The simulation engine must strictly enforce and pass the following three physical invariants:
1. **KCL Equality (with Shunt Leakage):**
   $$\left| I_{\text{parent}} - \left(\sum I_{\text{children}} + I_{\text{shunt\_leak}}\right) \right| \le \max(0.05\text{ A}, 0.005 \cdot I_{\text{parent}})$$
2. **Monotonic Voltage Drop (Radial Network):** Under non-regenerative loads, voltage strictly drops away from the transformer:
   $$V_{\text{child}} \le V_{\text{parent}} \quad (\text{tolerance: } \varepsilon \le 0.02\text{ V})$$
3. **Non-Negative Technical Losses:** Series span active copper loss must be non-negative:
   $$P_{\text{loss}} = I^2 \cdot R \ge 0\text{ W}$$

---

## 4. Comprehensive Relay Protection & Fault Discrimination

### 4.1 Per-Unit Voltage Thresholds & Fault Matrix
Voltage thresholds are formalized in per-unit ($\text{p.u.}$ based on $V_{\text{nominal}} = 230\text{ V}$ Phase-to-Neutral):
* $V_{\text{normal, min}} = 0.94\text{ p.u.} = 216.2\text{ V}$ (Statutory lower limit under CEA Regulations 2023)
* $V_{\text{undervoltage}} = 0.78\text{ p.u.} = 180.0\text{ V}$ (Brownout / severe voltage sag limit)
* $V_{\text{dead}} = 0.22\text{ p.u.} = 50.0\text{ V}$ (Physical dead-line ceiling, accounting for capacitive coupling)

| Differential State | Downstream Voltage ($V_{\text{P02}}$) | Upstream Voltage ($V_{\text{P01}}$) | Classification & Action |
| :--- | :--- | :--- | :--- |
| $\Delta I < I_{\text{pickup}}$ | $V \ge 0.94\text{ p.u.}$ ($216.2\text{ V}$) | $V \ge 0.94\text{ p.u.}$ | **NORMAL HEALTHY OPERATION** |
| $\Delta I < I_{\text{pickup}}$ | $0.78 < V < 0.94\text{ p.u.}$ | $V \ge 0.94\text{ p.u.}$ | **VOLTAGE SAG (ANSI 27) // NO TRIP** |
| $\Delta I \ge I_{\text{pickup}}$ | $V \ge 0.78\text{ p.u.}$ ($180.0\text{ V}$) | $V \ge 0.94\text{ p.u.}$ | **ANSI 87L: CONDUCTOR GROUND LEAKAGE (TRIP)** |
| $\Delta I \ge I_{\text{pickup}}$ | $V \le 0.22\text{ p.u.}$ ($50.0\text{ V}$) | $V \ge 0.94\text{ p.u.}$ | **ANSI 46BC: BROKEN CONDUCTOR / OPEN SNAP (TRIP)** |
| $\Delta I \ge I_{\text{pickup}}$ | $0.22 < V < 0.78\text{ p.u.}$ | $V \ge 0.94\text{ p.u.}$ | **UNCLASSIFIED FAULT: UNDERVOLTAGE + LEAK (TRIP)** |
| Comm Timeout | P02 Silent $> 3$ Cycles | $V_{\text{P01}} \ge 0.94\text{ p.u.}$ | **SUSPECTED OPEN CONDUCTOR / LOSS OF SUPPLY AT P02** |
| De-energized | $V_{\text{P01}} < 20\text{ V}$ | $V_{\text{P02}} < 20\text{ V}$ | **MAINS DE-ENERGIZED // BENCH SHUTDOWN (NO TRIP)** |

### 4.2 Broken Conductor Line-Power Blackout Handling
* **The Hardware Reality:** PZEM-004T modules are line-powered directly from the 230V AC lines they measure. If an overhead conductor snaps between P01 and P02, P02's sensor power supply collapses immediately. P02 does not transmit "0V"; it goes completely silent.
* **The Protection Rule:**
  * When $V_{\text{P01}} \ge 180\text{ V}$ (upstream is energized and receiving normal RF RSSI) AND P02 misses 3 consecutive polling frames ($> 3,000\text{ ms}$ silence):
  * The system **asserts an ANSI 46BC trip latch**, flagging:
    `ALARM: SUSPECTED OPEN CONDUCTOR // LOSS OF SENSOR SUPPLY AT P02 (ANSI 46BC)`.
  * This guarantees that a downed, severed conductor is never masked as a benign telemetry dropout!
  * **Arming Guard:** This rule is strictly armed only after both P01 and P02 have been online and healthy for at least 5 consecutive seconds post-boot.

### 4.3 Calibration Safety Freeze & Clamping
In `calibration.ts`:
* Baseline calibration updates are **immediately frozen** if:
  $$\Delta I \ge 0.150\text{ A} \quad (50\%\text{ of } I_{\text{pickup}}) \quad \text{OR} \quad \text{Alarm Active} \quad \text{OR} \quad \text{Quality} \neq \text{GOOD} \quad \text{OR} \quad \text{OTS Active}$$
* Absolute clamp on learned tare offset:
  $$-0.050\text{ A} \le \Delta I_{\text{offset}} \le +0.050\text{ A}$$
* Any baseline drift exceeding $\pm 50\text{ mA}$ is logged as an uncalibrated hardware anomaly and rejected.

---

## 5. Metrology Corrections & Scaling Defense

### 5.1 Component Metrology Audit
| Specification | Earlier Draft Claim | Corrected Physical Specification | Source / Verification |
| :--- | :--- | :--- | :--- |
| **Measurement IC** | Microchip Metrology IC | **SDIC Microelectronics SD3004** | PZEM-004T v3.0 PCB inspection |
| **Accuracy Class** | Class 0.5S | **Class 1.0 ($\pm 1.0\%$ of reading)** | Manufacturer Datasheet |
| **Harmonic Sensing** | THD Sensing | **RMS Power Quality & Frequency Only** | PZEM register map (No FFT registers) |
| **Grid Voltage Band**| ANSI C84.1 ($\pm 5\%$) | **CEA Regulations 2023 / IS 12360 ($\pm 6\%$)** | Indian Electricity Standards |
| **RF Topology** | Autonomous Mesh | **Sub-GHz Polled Star Topology** | 866.3 MHz Master-Slave Architecture |
| **Relay Lockout** | IEEE 1686 Certified | **IEEE 1686-Inspired Software LOTO** | Supervisory interlock logic |

### 5.2 Scaling Limitation & Percentage-Restrained Characteristic
* **The Honest Viva Defense:**
  * In the **Lab Test Bench ($I_{\text{through}} \approx 2.4\text{ A}$)**:
    $$\text{CT / Transducer Uncertainty} = 2.4\text{ A} \times 1\% = \mathbf{0.024\text{ A}}$$
    Since $0.024\text{ A} \ll 0.350\text{ A}$, fixed-threshold differential protection reliably operates without false trips.
  * In a **Full-Scale Utility Feeder ($I_{\text{through}} \approx 100\text{ A}$)**:
    $$\text{CT / Transducer Uncertainty} = 100\text{ A} \times 1\% = \mathbf{1.0\text{ A}}$$
    A 1.0 A measurement uncertainty exceeds the 0.35 A fault threshold, resulting in false trips during normal load peaks.
* **Mathematical Proposal for Utility Scale:**
  * Acknowledge this limitation honestly in the thesis. Propose the **Percentage-Restrained Characteristic (ANSI 87L)**:
    $$I_{\text{diff}} > K_{\text{restraint}} \cdot \left(\frac{I_{\text{P01}} + I_{\text{P02}}}{2}\right) + I_{\text{pickup}}$$
  * Compare lab vs utility parameters side-by-side in the thesis:
    * **Lab Parameter Set:** $K_{\text{restraint}} = 0.00$, $I_{\text{pickup}} = 0.35\text{ A}$ (Fixed Threshold Mode).
    * **Utility-Scale Parameter Set:** $K_{\text{restraint}} = 0.05$ (5% slope to accommodate CT errors), $I_{\text{pickup}} = 0.50\text{ A}$. State clearly that detecting sub-ampere leaks on 100 A lines requires specialized Core-Balance CTs (CBCT) or optical current transducers.

### 5.3 Latency Breakdown (Estimated vs Measured)
* Replace all claims of "instantaneous 250 ms tripping" with the formal pipeline breakdown:
  * Sensor ADC integration period (PZEM internal loop): ~200 ms
  * ESP32 packet formatting & AES-CCM computation: ~15 ms
  * Polling Request-Response LoRa Time-on-Air (40 bytes, SF9/125kHz): ~285 ms
  * Substation Gateway UART buffer ingestion (115200 baud): ~15 ms
  * Server FDIR Load-Flow tick & 3-sample debounce hold-off: ~600–750 ms
  * **Estimated End-to-End Fault Detection & Latch Latency:** **$\approx 1.1\text{ s} - 1.4\text{ s}$**.
  * Label latency as **"Estimated Pipeline Latency"** until the empirical fault-switch hardware test is conducted.

---

## 6. OMS Lifecycle, Safety Interlocking & RBAC

### 6.1 Formal State Machine & Transition Guards
Tickets follow a strict state machine enforced **server-side in SQLite and API endpoints**:

| Current State | Event / Trigger | Guard Conditions | Next State |
| :--- | :--- | :--- | :--- |
| **`DETECTED`** | Automated FLISR Trigger | Relay trip confirmed by FDIR | **`ISOLATED`** (Breaker tripped) |
| **`ISOLATED`** | Operator Acknowledges | Operator logged in (any role) | **`ACKNOWLEDGED`** |
| **`ISOLATED`** | Dismiss False Alarm | Role: `DISPATCHER` or `ADMIN`; Reason provided | **`FALSE_ALARM`** (Terminal) |
| **`ACKNOWLEDGED`**| Dispatch Field Crew | Crew assigned with mobile ID | **`DISPATCHED`** |
| **`ACKNOWLEDGED`**| Dismiss False Alarm | Role: `DISPATCHER` or `ADMIN`; Reason provided | **`FALSE_ALARM`** (Terminal) |
| **`DISPATCHED`** | Crew Arrives On-Site | GPS verified on mobile app | **`CREW_ON_SITE`** |
| **`CREW_ON_SITE`**| Issue Digital PTW | Lineman verifies dead & earthed; Sign-off | **`PTW_ISSUED`** (LOTO Engaged) |
| **`PTW_ISSUED`** | Clear PTW & Line Clearance| All grounds removed; Lineman sign-off | **`PTW_SURRENDERED`** |
| **`PTW_SURRENDERED`**| Operator Recloses Breaker | Supervisory reclose command authorized | **`RESTORED`** |
| **`RESTORED`** | Inspection Complete | Feeder healthy $> 60\text{ s}$ | **`CLOSED`** (Terminal) |

* **Strict Safety Interlocks:**
  * **Auto-Close Barred:** Auto-closing is barred once a ticket reaches `DISPATCHED` or beyond.
  * **Server-Side Reclose Inhibit:** If a POST command to `/api/telemetry/ports` (`command: "n"`) is received while any ticket has `PTW_ISSUED`, the server returns `HTTP 423 Locked: PTW_SAFETY_INTERLOCK_ACTIVE`.
  * **Stale Ticket Cleanup:** Migrate historical test ticket `TT-2026-10-0043` and provide a `RESET DEMO ENVIRONMENT` action restricted to simulation mode.
  * **Role Attribution:** Store `user_id` and role (`DISPATCHER`, `SAFETY_OFFICER`, `LINEMAN`) on all audit entries in the SQLite database.

---

## 7. Cybersecurity & Message Authenticity

1. **Authenticated Frame Framing (AES-128-CCM):**
   * Replace unauthenticated AES-CTR + CRC32 with **AES-128-CCM with an 8-byte authentication tag**.
   * Payload layout:
     `[ Header (4B) | DeviceID (1B) | SeqCounter (4B) | Encrypted Payload (24B) | MIC Tag (8B) ]`
   * Frame size: ~41 bytes. Time-on-Air at SF9/125kHz: **~285 ms**.
   * Sequence Counter: 32-bit incrementing counter. The Gateway rejects any frame with `SeqCounter <= last_seen_counter` (replay protection).
   * **NVS Flash Endurance:** Write sequence counter high-water mark to ESP32 Non-Volatile Storage (NVS) every 50 counts; on boot, jump ahead by 50 to prevent nonce reuse while avoiding flash burnout.
2. **Select-Before-Operate for Supervisory Commands:**
   * Remote protection reset (`'n'`) requires a two-step confirmation dialog with operator credentials.
3. **Mapbox Token Security:**
   * Restrict public Mapbox token (`pk.*`) strictly to the application URL domain in Mapbox Account Settings.
   * Ship an offline Canvas/SVG geospatial fallback renderer for offline presentations.

---

## 8. Experimental Evidence & Viva Artifacts

The following empirical tests will be conducted and included in the thesis:

1. **Two-Meter Null Test (Noise Floor Characterization):**
   * **Setup:** Clamp both PZEM-004T split-core CTs around the **exact same physical conductor** carrying identical currents.
   * **Sweep:** Test at $0.5\text{ A}, 1.0\text{ A}, 2.4\text{ A}, 5.0\text{ A}, 10.0\text{ A}$ under both resistive and inductive loads after 15 minutes of thermal warm-up.
   * **Duration:** 2-hour continuous test.
   * **Output:** Empirical distribution of $\Delta I_{\text{noise}}$ ($p50, p95, p99.9, \text{max}$). The fixed pickup threshold $I_{\text{pickup}}$ will be derived as:
     $$I_{\text{pickup}} = \max\left(0.35\text{ A}, 3 \times \Delta I_{\text{noise, max}}\right)$$
2. **Fault Detection Sensitivity Matrix:**
   * Execute 10 trials at each leakage current level: $0.20\text{ A}, 0.30\text{ A}$ (expected: 0% trip, no false trips), and $0.50\text{ A}, 1.0\text{ A}, 2.0\text{ A}, 5.0\text{ A}$ (expected: 100% trip).
   * Record detection success rate and time-to-trip latency.
3. **True Latency Measurement:**
   * Instrument the fault-injection switch with a GPIO edge output to an oscilloscope or logic analyzer.
   * Timestamp fault inception to the Gateway serial output frame.
   * Plot empirical latency histogram ($p50, p95, \text{max}$).
4. **12-Hour Continuous Healthy Soak Test:**
   * Run the physical test bench continuously for 12 hours under normal through-load.
   * Record zero false trips, link reliability percentage, and packet skew distribution.
5. **Load-Flow Validation vs OpenDSS / pandapower:**
   * Benchmark the TypeScript Forward-Backward sweep against an identical OpenDSS reference model.
   * Verify bus voltages and branch currents match within $\le 0.05\%$ tolerance.
   * Log the deterministic `mulberry32` seed in telemetry streams for exact reproducibility.

---

## 9. Prioritized Implementation Roadmap

Execution follows a strict test-driven engineering order:

```
[ Phase 1: Test Harness ] ──> [ Phase 2: Gateway TDMA ] ──> [ Phase 3: Physics & FDIR ]
                                                                       │
                                                                       ▼
[ Phase 6: Report Defense ] <── [ Phase 5: Hardware Runs ] <── [ Phase 4: OMS & Security ]
```

| Order | Code | Task Description | Verification Target |
| :---: | :---: | :--- | :--- |
| **1** | **P1.0** | Automated Test Suite: Write `tests/fdir_invariants.test.ts` | Test harness for KCL, skew, debounce, and broken conductor |
| **2** | **P1.1** | Gateway-polled TDMA protocol & 600 ms skew pairing | Zero on-air collisions; deterministic frame pairing |
| **3** | **P1.2** | Dynamic KCL load scaling on Feeder LT-1 ($k_{\text{bench}}$) | Pass Invariant 1: $\sum I_{\text{children}} \approx I_{\text{parent}}$ |
| **4** | **P1.3** | Restrict ANSI 87L zone strictly to `LT1-P01 ↔ LT1-P02` | Remove all downstream $\Delta I$ calculations on SLD |
| **5** | **P1.4** | 3-sample debounce, trip/reset hysteresis & grace period | Hold-off single-packet noise spikes; zero boot trips |
| **6** | **P1.5** | Broken conductor loss-of-power discrimination logic | Latch trip when P01 live and P02 drops $> 3$ polling cycles |
| **7** | **P1.6** | Calibration freeze on pickup ($\Delta I \ge 0.15\text{A}$, max $\pm 50\text{mA}$) | Baseline offset does not absorb genuine leaks |
| **8** | **P1.7** | Decoupled status banners (`LIVE/SIM/DEGRADED` + `OTS`) | Clear indication of provenance and training overlays |
| **9** | **P1.8** | Formal OMS state machine & server-side reclose interlock | `ISOLATED` state, false alarm action with reason, API lock |
| **10**| **P1.9** | Clean up `TT-2026-10-0043` & add simulation reset | Clean slate in SQLite trouble ticket database |
| **11**| **P1.10**| Fix numeric bugs (10x unbalance bug, copper loss format) | Reconciled unbalance math and Watt formatting |
| **12**| **P2.1** | Correct report and UI claims (Class 1.0, SD3004, CEA limits)| Audit all documents and UI badges |
| **13**| **P2.2** | Execute 2-hour Null Test with split-core CTs on single wire | Empirical noise floor and validated pickup threshold |
| **14**| **P2.3** | Execute fault sensitivity sweep & empirical latency histogram | Verification dataset for thesis |
| **15**| **P3.1** | AES-128-CCM authenticated framing with 32-bit NVS counter | Embedded firmware & gateway parser update |
| **16**| **P4.1** | Compact full-feeder SLD view & map label collision fix | Ergonomic review across all 28 poles |

---

## 10. Evaluation Defense Sign-Off
By strictly adhering to this v3.0.0 specification, GridSense transitions into an **academically rigorous, physically verified, and mathematically defensible** Master’s thesis project that will confidently withstand scrutiny from power systems and automation examiners.
