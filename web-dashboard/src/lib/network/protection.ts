/**
 * Span protection for the two hardware nodes (P01 incomer, P02 boundary).
 *
 * Pure and deterministic: no timers, no I/O, no Date.now(). Feed it one gateway
 * frame at a time. Drop it in as src/lib/network/protection.ts and call step()
 * from telemetry-state.ts instead of the inline classification.
 *
 * Time base: every node's `ageMs` is measured on the GATEWAY clock when the
 * frame is emitted, so |age1 - age2| is a valid arrival skew without any RTU
 * clock sync. A "new sample" is detected when a node's age goes DOWN.
 */

export interface NodeSample {
  v: number;      // RMS volts (phase R)
  i: number;      // RMS amps (phase R)
  ageMs: number;  // gateway-clock age of this sample; 99999 = never seen
  lastGasp?: boolean; // node sent a LAST_GASP packet
}

export interface ProtectionConfig {
  pickupA: number;        // absolute floor for 87L pickup
  biasPct: number;        // threshold = max(pickupA, biasPct% of I1)
  resetRatio: number;     // reset below resetRatio * threshold (hysteresis)
  debounceCycles: number; // consecutive PAIRED cycles above pickup
  armCycles: number;      // paired healthy cycles required before arming
  freshMs: number;        // a sample older than this is stale
  skewMs: number;         // max |age1-age2| for a valid pair (>= 1.5x report interval)
  maxSkewHoldCycles: number;
  silenceMs: number;      // P2 silent this long while P1 is live => open conductor
  energizedV: number;
  healthyV: number;
}

export const DEFAULT_CONFIG: ProtectionConfig = {
  pickupA: 0.35,
  biasPct: 2,
  resetRatio: 0.7,
  debounceCycles: 3,
  armCycles: 2,
  freshMs: 15000,
  skewMs: 5000,
  maxSkewHoldCycles: 10,
  silenceMs: 15000,
  energizedV: 50,
  healthyV: 180,
};

export type ProtState =
  | "UNARMED"            // waiting for both nodes (startup grace)
  | "HEALTHY"
  | "BENCH_DEENERGIZED"  // both nodes fresh and ~0 V: mains off, not a fault
  | "DEGRADED"           // a node is stale: differential protection is BLIND
  | "SKEW_UNCERTAIN"
  | "PICKUP"             // above pickup, debouncing
  | "TRIP_LEAKAGE"       // ANSI 87L: voltage present on P2
  | "TRIP_UNCLASSIFIED"  // differential with 50 V < V2 < 180 V
  | "OPEN_CONDUCTOR"     // ANSI 46BC: P1 live, P2 dead/silent
  | "INCONSISTENT";      // e.g. P2 energized while P1 is not

export interface ProtResult {
  state: ProtState;
  idiff: number;
  thresholdA: number;
  trip: boolean;       // latched trip active
  blind: boolean;      // protection cannot operate right now
  confirmed: boolean;  // open conductor confirmed by last gasp
  overCycles: number;
  message: string;     // generated from the classified state, never a fixed template
}

export class SpanProtection {
  private prevAge1 = Infinity;
  private prevAge2 = Infinity;
  private new1 = false;
  private new2 = false;
  private armedCycles = 0;
  private overCycles = 0;
  private skewHold = 0;
  private latched: ProtState | null = null;
  private latchedConfirmed = false;
  private wasArmed = false; // both nodes have been seen healthy at least once

  constructor(private cfg: ProtectionConfig = { ...DEFAULT_CONFIG }) {}

  public updateConfig(patch: Partial<ProtectionConfig>) {
    this.cfg = { ...this.cfg, ...patch };
  }

  /** Operator reset. Only clears if the condition is no longer present at next step. */
  reset() {
    this.latched = null;
    this.latchedConfirmed = false;
    this.overCycles = 0;
  }

  step(p1: NodeSample, p2: NodeSample): ProtResult {
    const c = this.cfg;

    // new-sample detection (age drops when a fresh packet arrives)
    if (p1.ageMs < this.prevAge1) this.new1 = true;
    if (p2.ageMs < this.prevAge2) this.new2 = true;
    this.prevAge1 = p1.ageMs;
    this.prevAge2 = p2.ageMs;

    const idiff = Math.abs(p1.i - p2.i);
    const thresholdA = Math.max(c.pickupA, (c.biasPct / 100) * p1.i);
    const out = (state: ProtState, message: string, extra: Partial<ProtResult> = {}): ProtResult => ({
      state,
      idiff: round3(idiff),
      thresholdA: round3(thresholdA),
      trip: this.latched !== null && state !== "DEGRADED" && state !== "BENCH_DEENERGIZED",
      blind: state === "DEGRADED" || state === "UNARMED" || state === "INCONSISTENT",
      confirmed: this.latchedConfirmed,
      overCycles: this.overCycles,
      message,
      ...extra,
    });

    const fresh1 = p1.ageMs <= c.freshMs;
    const fresh2 = p2.ageMs <= c.freshMs;

    // --- one or both nodes stale -------------------------------------------------
    if (!fresh1 || !fresh2) {
      this.armedCycles = 0;
      this.overCycles = 0;
      if (fresh1 && !fresh2) {
        const p1Live = p1.v >= c.healthyV;
        const neverSeen = p2.ageMs >= 99999;
        // Silence only counts as a fault if P2 was healthy before. A node that has
        // never reported (gateway just started) is a startup condition, not a break.
        const silent = !neverSeen && this.wasArmed && p2.ageMs >= c.silenceMs;
        if (p1Live && (p2.lastGasp || silent)) {
          this.latch("OPEN_CONDUCTOR", !!p2.lastGasp);
          return out(
            "OPEN_CONDUCTOR",
            p2.lastGasp
              ? `Loss of supply at P2 confirmed by last-gasp while P1 is live (${p1.v.toFixed(0)} V)`
              : `P2 silent for ${(p2.ageMs / 1000).toFixed(1)} s while P1 is live (${p1.v.toFixed(0)} V): suspected open conductor`,
            { confirmed: !!p2.lastGasp },
          );
        }
      }
      return out("DEGRADED", `Node data stale (P1 ${fmtAge(p1.ageMs)}, P2 ${fmtAge(p2.ageMs)}): differential protection blind`);
    }

    // --- both fresh ----------------------------------------------------------------
    const e1 = p1.v >= c.energizedV;
    const e2 = p2.v >= c.energizedV;

    if (!e1 && !e2) {
      this.armedCycles = 0;
      this.overCycles = 0;
      return out("BENCH_DEENERGIZED", "Both nodes report ~0 V: mains de-energized, no differential evaluated");
    }
    if (!e1 && e2) {
      return out("INCONSISTENT", `P2 energized (${p2.v.toFixed(0)} V) while P1 is not: check wiring or sensors`);
    }
    if (p1.v >= c.healthyV && !e2) {
      this.latch("OPEN_CONDUCTOR", false);
      return out("OPEN_CONDUCTOR", `P1 ${p1.v.toFixed(0)} V but P2 ${p2.v.toFixed(0)} V: open conductor between P1 and P2`);
    }

    // If both nodes are energized and healthy, an unconfirmed open-conductor suspicion is cleared
    if (this.latched === "OPEN_CONDUCTOR" && !this.latchedConfirmed && p1.v >= c.healthyV && p2.v >= c.healthyV) {
      this.latched = null;
    }

    // --- both energized: count PAIRED cycles only ----------------------------------
    const paired = this.new1 && this.new2;
    if (!paired) return this.hold(out, idiff, thresholdA);
    this.new1 = false;
    this.new2 = false;

    if (this.armedCycles < c.armCycles) {
      this.armedCycles++;
      if (this.armedCycles >= c.armCycles) this.wasArmed = true;
      return out("UNARMED", `Arming: ${this.armedCycles}/${c.armCycles} paired cycles`);
    }

    const skew = Math.abs(p1.ageMs - p2.ageMs);
    if (skew > c.skewMs) {
      this.skewHold++;
      if (this.skewHold > c.maxSkewHoldCycles) {
        return out("DEGRADED", `Sample skew ${skew} ms exceeded ${c.skewMs} ms for ${this.skewHold} cycles: protection blind`);
      }
      return out("SKEW_UNCERTAIN", `Sample skew ${skew} ms > ${c.skewMs} ms: pair ignored`);
    }
    this.skewHold = 0;

    if (idiff >= thresholdA) this.overCycles++;
    else if (idiff <= thresholdA * c.resetRatio) this.overCycles = 0;

    if (this.overCycles >= c.debounceCycles) {
      const leak = p2.v >= c.healthyV;
      this.latch(leak ? "TRIP_LEAKAGE" : "TRIP_UNCLASSIFIED", false);
      return out(
        leak ? "TRIP_LEAKAGE" : "TRIP_UNCLASSIFIED",
        `|I1-I2| = ${idiff.toFixed(3)} A >= ${thresholdA.toFixed(3)} A for ${this.overCycles} paired cycles (I1=${p1.i.toFixed(3)} A, I2=${p2.i.toFixed(3)} A, V2=${p2.v.toFixed(0)} V)`,
      );
    }
    if (this.overCycles > 0) {
      return out("PICKUP", `|I1-I2| = ${idiff.toFixed(3)} A above pickup, ${this.overCycles}/${c.debounceCycles} cycles`);
    }
    return this.latched ? out(this.latched, "Trip latched: operator reset required") : out("HEALTHY", "Differential within limits");
  }

  private hold(out: (s: ProtState, m: string) => ProtResult, idiff: number, thr: number): ProtResult {
    if (this.latched) return out(this.latched, "Trip latched: operator reset required");
    if (this.armedCycles < this.cfg.armCycles) return out("UNARMED", `Arming: ${this.armedCycles}/${this.cfg.armCycles} paired cycles`);
    if (this.overCycles > 0) return out("PICKUP", `Above pickup, ${this.overCycles}/${this.cfg.debounceCycles} cycles (waiting for next pair)`);
    return out("HEALTHY", `Differential ${idiff.toFixed(3)} A vs ${thr.toFixed(3)} A (waiting for next pair)`);
  }

  private latch(s: ProtState, confirmed: boolean) {
    if (this.latched === null || confirmed) {
      this.latched = s;
      this.latchedConfirmed = confirmed;
    }
  }
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const fmtAge = (a: number) => (a >= 99999 ? "never" : `${(a / 1000).toFixed(1)} s`);
