/**
 * Live node cross-calibration (Pole-A ↔ Pole-B).
 *
 * Two PZEM-004T modules each have about ±0.5 % gain/offset error. Over a ~100 m
 * span carrying a few amps the real voltage drop is only a few hundredths of a
 * volt, which is far smaller than the disagreement between two meters. Without
 * calibration, V1 − V2 and P1 − P2 mostly show meter mismatch, not physics.
 *
 * Approach: while the span is healthy (|I1 − I2| < 0.05 A, no fault), compare
 * Node B with Node A after subtracting the drop and loss that physics predicts:
 *
 *    expected ΔV = I1 · R_span          expected ΔP = I1² · R_span
 *    vOffset ← (V2 − V1) + I1·R_span     pGain ← (P1 − I1²·R_span) / P2
 *
 * Both are learned with a slow EMA and then applied to Node B's readings. The
 * calibration never touches current, so the differential (87L) protection still
 * sees raw I1 − I2 and leakage cannot be calibrated away.
 */
import { CalibrationState } from "./network/types";
import { NETWORK_TOPOLOGY, NODE_BY_ID } from "./network/topology";

const LEARN_MAX_IDIFF_A = 0.05;
const EMA_ALPHA = 0.02;
const WARMUP_SAMPLES = 10;
const MIN_SAMPLES_CALIBRATED = 15;

/** Phase-conductor resistance of the live span F1-P01 → F1-P02 (ohm). */
export const LIVE_SPAN_OHM =
  ((NODE_BY_ID["F1-P02"]?.spanM ?? NODE_BY_ID["POLE-B"]?.spanM ?? 100) / 1000) * NETWORK_TOPOLOGY.conductorOhmPerKm;

class LiveCalibration {
  private vOffset = 0;
  private pGain = 1;
  private vSamples = 0;
  private pSamples = 0;

  public observe(r: { v1: number; v2: number; i1: number; i2: number; p1: number; p2: number; fault: boolean }) {
    const healthy =
      !r.fault && r.v1 > 180 && r.v2 > 180 && r.i1 > 0.05 && Math.abs(r.i1 - r.i2) < LEARN_MAX_IDIFF_A;
    if (!healthy) return;

    const vSample = r.v2 - r.v1 + r.i1 * LIVE_SPAN_OHM;
    this.vOffset = this.ema(this.vOffset, vSample, this.vSamples);
    this.vSamples++;

    if (r.p1 > 5 && r.p2 > 5) {
      const gSample = (r.p1 - r.i1 * r.i1 * LIVE_SPAN_OHM) / r.p2;
      if (gSample > 0.9 && gSample < 1.1) {
        this.pGain = this.ema(this.pGain, gSample, this.pSamples);
        this.pSamples++;
      }
    }
  }

  /** Correct Node B's voltage and active power. */
  public apply(v2: number, p2: number): { v2: number; p2: number } {
    return {
      v2: v2 > 10 ? v2 - this.vOffset : v2,
      p2: p2 * this.pGain,
    };
  }

  public reset() {
    this.vOffset = 0;
    this.pGain = 1;
    this.vSamples = 0;
    this.pSamples = 0;
  }

  public state(): CalibrationState {
    return {
      vOffset: Number(this.vOffset.toFixed(3)),
      pGain: Number(this.pGain.toFixed(5)),
      vSamples: this.vSamples,
      pSamples: this.pSamples,
      status:
        this.vSamples >= MIN_SAMPLES_CALIBRATED && this.pSamples >= MIN_SAMPLES_CALIBRATED
          ? "CALIBRATED"
          : "LEARNING",
    };
  }

  private ema(prev: number, sample: number, n: number) {
    // Plain running mean during warm-up, then slow EMA.
    if (n < WARMUP_SAMPLES) return (prev * n + sample) / (n + 1);
    return prev + EMA_ALPHA * (sample - prev);
  }
}

const g = globalThis as unknown as { gsLiveCalibration?: LiveCalibration };
export const liveCalibration = g.gsLiveCalibration || new LiveCalibration();
if (process.env.NODE_ENV !== "production") g.gsLiveCalibration = liveCalibration;
