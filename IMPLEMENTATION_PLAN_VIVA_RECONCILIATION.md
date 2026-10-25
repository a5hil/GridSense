# GridSense ADMS: Engineering Reconciliation & Viva-Readiness Implementation Plan
**Document Version:** 1.0.0  
**Target System:** GridSense 415V/230V LT Distribution Network ADMS & Hardware-in-the-Loop Testbed  
**Scope:** Architecture Reconciliation, Physics-Twin Alignment, Metrology Claims, and Evaluation Rigor  

---

## Executive Summary & Objective

Following a comprehensive technical review of the GridSense web console and project details, several critical discrepancies between physical lab measurements, digital twin simulation, metrological claims, and regulatory nomenclature were identified. 

This implementation plan outlines the precise engineering fixes required to ensure **100% academic defensibility, physical realism, and viva readiness**. The plan is divided into four priority phases:
- **Priority 1:** Critical logic, physics, and dashboard fixes required before any viva or live evaluation.
- **Priority 2:** Report corrections, metrological scaling analysis, and evidence generation.
- **Priority 3:** Cybersecurity, safety interlocking, and token hygiene.
- **Priority 4:** Operator console UX polish and telemetry ergonomics.

---

## PRIORITY 1: Pre-Demo & Viva Technical Reconciliation

### 1. Reconcile Digital Twin with Physical Lab Measurement
* **Problem:** Physical hardware (PZEM-004T) measures lab loads of ~1.5 A – 2.5 A on Phase R, whereas the 28-pole digital twin models a full 250 kVA distribution transformer (DTR-01) with hundreds of amperes. Furthermore, the dashboard previously implied differential calculations existed across downstream uninstrumented spans.
* **Architecture Decision (Selected Approach):**
  * Formally define the physical span (`F1-P01 ↔ F1-P02`) as a **"Lab-Scale Hardware-in-the-Loop (HIL) Window"**.
  * The **only** legitimate ANSI 87L Unit Protection zone in the system is `F1-P01 ↔ F1-P02`.
  * Completely remove $\Delta I$ calculations and differential indicators from all downstream spans (`P02 ↔ P03` through `P09 ↔ P10`).
  * Downstream spans will be explicitly displayed as **"ESTIMATED RADIAL LOAD-FLOW SPANS"** governed by Ohm's Law and branch current summation ($V_{\text{drop}} = I \cdot Z$), not differential relays.
* **Target Files:**
  * `src/components/scada/SingleLinePowerFlow.tsx`
  * `src/components/scada/NetworkTwinView.tsx`
  * `src/lib/network/twin.ts`

---

### 2. Global Tri-State Mode Banner & Explicit Measurement Badges
* **Problem:** Displaying `"SCADA LINK ACTIVE"` when hardware is unplugged or synthetic load-flow is running is misleading and vulnerable during examiner inspection.
* **Implementation:**
  * Implement a prominent, persistent global header banner with three distinct operating states:
    1. `🟢 LIVE HIL (PHYSICAL HARDWARE LINKED)`: Active serial stream on COM port; valid packets received from both Pole 1 and Pole 2 within the last 5,000 ms.
    2. `🟡 OFFLINE DIGITAL TWIN (SIMULATION)`: Hardware disconnected / COM port closed. Full 28-pole synthetic load-flow running with simulated baselines.
    3. `🟠 OPERATOR TRAINING SIMULATOR (OTS ACTIVE)`: Contingency injection active.
  * Every electrical telemetry value displayed across the SLD, GIS HUD, and Data Matrix must carry a strict source badge:
    * `[MEASURED]`: Real physical sensor reading (Pole 1 & Pole 2 on Phase R only).
    * `[DERIVED]`: Phases Y and B calculated relative to Phase R anchor reference.
    * `[ESTIMATED]`: Weighted Least-Squares (WLS) forward-backward sweep on uninstrumented poles P03–P28.
    * `[SIMULATED]`: Synthetically forced values during OTS contingency injection.
* **Target Files:**
  * `src/app/page.tsx`
  * `src/components/scada/SingleLinePowerFlow.tsx`
  * `src/components/scada/NetworkTwinView.tsx`

---

### 3. Strict Event Sourcing & De-Duplication
* **Problem:** OTS contingency injections could pollute the persistent SQLite ticket database, and simultaneous 3-phase undervoltages generated three duplicate event rows for a single event.
* **Implementation:**
  * Separate event categories in the Sequence of Events (SOE) log and Trouble Ticket queue:
    * `[LIVE]`: Originates from physical hardware threshold breach ($I_{\text{diff}} \ge 0.35\text{ A}$ on P01/P02).
    * `[MIXED]`: Root cause simulated on twin, propagating to physical anchor.
    * `[TRAINING]`: Contingency injected via OTS console.
  * Inhibit OTS `[TRAINING]` events from generating real permanent trouble tickets in `/api/oms/tickets`. They will be routed strictly to an in-memory OTS simulation session.
  * Collapse multi-phase cascade events into a single parent event row with a `PHASES: [R, Y, B]` multi-badge column.
* **Target Files:**
  * `src/lib/network/twin.ts`
  * `src/lib/network/fdir.ts`
  * `src/lib/oms-state.ts`
  * `src/components/scada/WorkforceOmsPanel.tsx`

---

### 4. Startup Grace Period & False-Trip Elimination
* **Problem:** Upon gateway boot, Pole 1's RF packet may arrive 200 ms before Pole 2's packet. During this window, $I_1 > 0$ and $I_2 = 0$, causing a false differential trip ($\Delta I = I_1$). Additionally, when the bench is switched off ($V_1 = 0, V_2 = 0$), the system could misclassify it as a trip rather than de-energized/comms loss.
* **Implementation:**
  * Introduce a **5-second Startup Grace Period** upon gateway connection: relay trip logic is armed only after both RTUs have delivered at least two consecutive valid telemetry packets.
  * Condition check: If $V_1 < 20\text{ V}$ and $V_2 < 20\text{ V}$ and $I_1 = 0, I_2 = 0$, classify state as **`MAINS DE-ENERGIZED // BENCH OFFLINE`**, strictly inhibiting the ANSI 87L trip latch.
  * If packet age exceeds 10,000 ms, declare **`RTU TELEMETRY TIMEOUT`** without triggering a differential relay trip.
* **Target Files:**
  * `src/lib/telemetry-state.ts`
  * `src/lib/network/fdir.ts`

---

### 5. Complete Ticket Lifecycle & Manual "Close as False Alarm"
* **Problem:** The current OMS workflow lacks an operator option to dismiss bench test faults or false alarms without issuing a full lineman PTW.
* **Implementation:**
  * Formalize ticket state machine:
    $$\text{DETECTED} \longrightarrow \text{ACKNOWLEDGED} \longrightarrow \text{DISPATCHED} \longrightarrow \text{PTW ISSUED (LOTO)} \longrightarrow \text{REPAIRED} \longrightarrow \text{RESTORED} \longrightarrow \text{CLOSED}$$
  * Add an operator action on the dispatch desk: **`DISMISS AS BENCH TEST / FALSE ALARM`**.
  * Require an operator justification modal (e.g., *"Lab calibration test"*, *"Transient contact bounce"*, *"Sensor verification"*).
  * Auto-resolve tickets with an audit log note when healthy, balanced telemetry resumes for $> 15\text{ seconds}$.
* **Target Files:**
  * `src/lib/oms-state.ts`
  * `src/app/api/oms/tickets/route.ts`
  * `src/components/scada/WorkforceOmsPanel.tsx`

---

### 6. Fix Calibration Absorption Trap ("Freeze Calibration on Pickup")
* **Problem:** `calibration.ts` continuously adjusts rolling offset ($\Delta V$, $P_{\text{gain}}$, and baseline $\Delta I$). If a genuine high-impedance leak of 0.25 A develops, an active rolling calibration window would gradually learn the leak as normal baseline tare, masking the defect.
* **Implementation:**
  * Add a freeze lock: If $\Delta I \ge 0.15\text{ A}$ (50% of the 0.35 A pickup threshold) OR if any fault flag is active, **immediately freeze the baseline calibration buffer**.
  * Bound the maximum allowable learned offset: clamp $\Delta I_{\text{cal}}$ strictly between $[-0.05\text{ A}, +0.05\text{ A}]$. Any discrepancy beyond $\pm 0.05\text{ A}$ is treated as uncompensated physical leakage.
* **Target Files:**
  * `src/lib/calibration.ts`

---

### 7. Explicit Voltage-Based Fault Discrimination (Leak vs Broken Conductor)
* **Problem:** High-impedance ground leakage and broken conductors must be cleanly discriminated based on voltage presence downstream.
* **Implementation:**
  * **ANSI 87L (Conductor Ground Leakage):**
    $$\Delta I = |I_{1} - I_{2}| \ge 0.35\text{ A} \quad \text{AND} \quad V_{\text{P02}} \ge 180\text{ V}$$
    *(Line is physically continuous, but current is shunted to earth/vegetation).*
  * **ANSI 46BC (Broken / Snapped Conductor):**
    $$I_{\text{P02}} \le 0.05\text{ A} \quad \text{AND} \quad V_{\text{P02}} \le 50\text{ V} \quad \text{AND} \quad V_{\text{P01}} \ge 180\text{ V}$$
    *(Upstream remains energized, downstream voltage collapses to zero due to physical line break).*
* **Target Files:**
  * `src/lib/network/fdir.ts`
  * `src/lib/network/twin.ts`

---

### 8. Numeric Precision & Display Bug Fixes
* **Implementation:**
  * Fix the unbalance percentage mismatch (reconcile the $1.40\%$ vs $0.14\%$ calculation between IEEE 1159 and NEMA definitions).
  * Fix the logic bug displaying `"0.000 A exceeds 0.350 A"` when breaker is tripped (properly display pre-trip peak current).
  * Fix $0.00\text{ kW}$ copper loss display by formatting small losses in Watts ($W$) instead of truncated kilowatts.
  * Fix UI layout clippings in OMS chronological audit trail and Mapbox pole label collisions.
* **Target Files:**
  * `src/app/page.tsx`
  * `src/components/scada/TelemetryTrendChart.tsx`
  * `src/components/scada/WorkforceOmsPanel.tsx`
  * `src/components/scada/GisFeederMap.tsx`

---

## PRIORITY 2: Report & Viva Defense Adjustments

### 1. Metrology Corrections (PZEM-004T v3.0)
* **Correction:** The PZEM-004T v3.0 uses a standard Microchip/Peacefair SD3004 energy measurement IC. Its manufacturer-specified accuracy is **Class 1.0 (1.0% FS)**, not Class 0.5S. (Class 0.5S requires high-permeability nanocrystalline CTs and precision metrology front-ends).
* **THD Claim:** PZEM-004T outputs True RMS Voltage, True RMS Current, Active Power, Power Factor, and Frequency. It does **not** compute individual FFT harmonics or THD. All documentation and UI labels claiming "THD Sensing" will be corrected to **"RMS Power Quality & Frequency Supervision"**.

### 2. Metrological Scaling Limitation Analysis (Crucial Viva Point)
* **Mathematical Reality:**
  * In the lab test rig ($I \approx 2.4\text{ A}$):
    $$\text{Error} = 2.4\text{ A} \times 1\% = \mathbf{0.024\text{ A}}$$
    Since $0.024\text{ A} \ll 0.350\text{ A}$ (the pickup threshold), fixed-threshold ANSI 87L differential protection works reliably in the lab.
  * In a full-scale utility feeder ($I \approx 100\text{ A}$):
    $$\text{Error} = 100\text{ A} \times 1\% = \mathbf{1.0\text{ A}}$$
    A 1.0 A measurement uncertainty exceeds the 0.35 A fault threshold, leading to phantom tripping under normal heavy through-load!
* **Viva Defense & Report Proposal:**
  * Formally document this scaling limitation in the report.
  * Propose the standard dual-slope **Percentage-Restrained Differential Relay characteristic (ANSI 87L)** as the necessary design enhancement for utility-scale deployment:
    $$I_{\text{diff}} > K_{\text{restraint}} \cdot \left(\frac{I_1 + I_2}{2}\right) + I_{\text{pickup}}$$

### 3. Grid Hierarchy & Voltage Standards Alignment
* **Indian Grid Voltage Standards:** Replace references to US ANSI C84.1 with **Central Electricity Authority (CEA) / IS 12360 Standards**:
  * Nominal LV: $230\text{ V}$ (Phase-to-Neutral), $415\text{ V}$ (Phase-to-Phase), $50\text{ Hz}$.
  * Statutory Voltage Variation Limit: **$\pm 6\%$** ($216.2\text{ V}$ to $243.8\text{ V}$).
* **Nomenclature Consistency:** Align all documentation to a single clean hierarchy:
  * **Substation:** Angamaly 33/11 kV Primary Substation
  * **Distribution Transformer:** DTR-01 (250 kVA, 11 kV / 415 V Dyn11)
  * **Radial Feeders:** Feeder LT-1 (Residential, 10 Poles), Feeder LT-2 (Commercial, 11 Poles), Feeder LT-3 (Rural/Mixed, 7 Poles).

### 4. RF Mesh vs Star Topology Clarification
* **Technical Reality:** The direct LoRa links operating at 866.3 MHz (IN865 band, SF9/125 kHz) communicating point-to-point from Pole 1 and Pole 2 to the Substation Gateway constitute a **Star Topology** with deduplication, not a full dynamic mesh.
* **Action:** Correct terminology in the report to **"Sub-GHz Star-of-Stars Utility Telemetry with Hop-Relay Capability"**.

### 5. Measured End-to-End System Latency
* Replace claims of "instantaneous 250ms tripping" with measured, honest timing breakdowns:
  * Sensor Sample Window (PZEM-004T internal ADC integration): ~200 ms
  * ESP32 Frame Packaging & Encryption: ~15 ms
  * LoRa RF Transmission Time-on-Air (SF9, 125 kHz, 32 bytes): ~180 ms
  * Substation Serial UART Ingestion (115200 baud): ~12 ms
  * Server FDIR Processing Loop: ~20 ms
  * **Total True End-to-End Fault-to-Trip Latency:** **$\approx 420\text{ ms} - 550\text{ ms}$** (well within statutory safety margins for low-voltage clearance).

---

## PRIORITY 3: Cybersecurity, Token Hygiene & Safety Interlocking

1. **Cryptographic Integrity:**
   * Transition custom AES-128-CTR + CRC-32 frames to an authenticated construction (**HMAC-SHA256 with incrementing sequence counter**) to prevent packet replay or unauthorized supervisory trip injection.
2. **Supervisory Command Protection:**
   * Protect the remote protection reset command (`'n'`) and Digital PTW authorization with a confirmation modal and operator audit attribution.
3. **Mapbox Token Isolation & Offline Map Fallback:**
   * Isolate the Mapbox public access token behind a backend API proxy.
   * Provide an offline SVG/Canvas geospatial fallback for demonstrations where internet connectivity is restricted.
4. **Digital Permit-to-Work (PTW) Statutory Interlock:**
   * Expand the lineman PTW mobile screen to include statutory safety verification checkboxes under **CEA Safety Regulation 44**:
     - [x] Physical line isolation verified
     - [x] Portable earthing bridge clamped
     - [x] Lineman helmet and insulated gloves verified
   * Reiterate clearly in the viva: *"Software supervisory lockout supplements, and never replaces, physical Lockout/Tagout (LOTO) and grounding."*

---

## PRIORITY 4: Operator Ergonomics & UX Polish

1. **Color Coding Discipline:** Maintain dark neutral backgrounds (`#0a0b0d`), reserving bright emerald, amber, and rose strictly for electrical status and ANSI trip alerts.
2. **Node Staleness Indication:** Display individual packet age (e.g., `340 ms`) on each SLD pole card; automatically gray out nodes whose telemetry is older than $10\text{ seconds}$.
3. **Sequence of Events (SOE) Precision:** Log timestamps with millisecond resolution (`HH:mm:ss.SSS`) and distinguish between RTU acquisition time and Gateway ingestion time.
4. **Compact SLD Overview:** Provide a zoom-to-fit SLD toggle so examiners can observe all 10 poles of Feeder LT-1 simultaneously without horizontal scrolling.

---

## Implementation Roadmap & Verification Milestones

| Step | Task Description | Verification Method |
| :---: | :--- | :--- |
| **1.1** | Add Tri-State Global Banner (`LIVE HIL`, `OFFLINE SIM`, `OTS`) | Unplug USB; verify banner immediately transitions from green to amber. |
| **1.2** | Restrict ANSI 87L zone strictly to `P01 ↔ P02` | Verify downstream spans only show load-flow estimation; no spurious $\Delta I$. |
| **1.3** | Implement Calibration Freeze on Pickup in `calibration.ts` | Inject 0.25 A leakage; verify baseline offset does not drift upward. |
| **1.4** | Add Voltage-Based Leak vs Conductor Snap discrimination | Test $V_2 = 0\text{V}$ (broken conductor) vs $V_2 = 230\text{V}$ (ground leakage). |
| **1.5** | Implement 5-second boot grace period in `telemetry-state.ts` | Cold restart gateway; verify zero false trips before steady state. |
| **1.6** | Add "Close as False Alarm / Bench Test" in OMS | Dismiss active test alarm; verify clean audit trail in SQLite. |
| **1.7** | Fix numeric precision bugs (unbalance, copper loss, trip format) | Verify exact math across Polyphase Trend and SLD HUD. |
| **2.1** | Correct report claims (Class 1.0, star topology, CEA limits) | Complete report reconciliation audit. |

---

## Evaluation Readiness Sign-Off
Upon completion of this plan, GridSense will present an **academically unimpeachable, physically accurate, and professionally designed** engineering demonstration that demonstrates deep mastery of distribution automation, electrical safety regulations, and real-time IoT architecture.
