/**
 * GridSense Network Digital Twin - shared types.
 *
 * Every value in the twin carries a `source` so the UI can always show whether
 * a number is a real hardware measurement (LIVE), a simulated value (SIM), or a
 * phase that has no sensor at all (NOT_INSTRUMENTED).
 */

export type Phase = "R" | "Y" | "B";
export const PHASES: Phase[] = ["R", "Y", "B"];

export type DataSource = "LIVE" | "SIM" | "NOT_INSTRUMENTED" | "OFFLINE";

/** How the two un-instrumented phases (Y, B) of the live poles are presented. */
export type UninstrumentedPhaseMode = "NOT_INSTRUMENTED" | "SIM";

/** Live hardware node id (as emitted by the gateway) bound to a twin pole. */
export type LiveNodeId = "Pole-A" | "Pole-B";

export interface TopologyNode {
  id: string;
  label: string;
  kind: "DTR" | "POLE";
  feederId: string | null; // null for the DTR
  parentId: string | null;
  lat: number;
  lng: number;
  /** Conductor length from parent (m). 0 for DTR. */
  spanM: number;
  /** Bound physical node, if this pole carries real hardware. */
  liveBinding?: LiveNodeId;
  /** Terminal live node: its metered current is the load beyond it. */
  isTerminal?: boolean;
  /** Number of service connections tapped at this pole (for outage counts). */
  customers: number;
}

export interface FeederDef {
  id: string;
  name: string;
  ampacityA: number; // per-phase conductor rating
  color: string;
}

export interface NetworkTopology {
  substationName: string;
  dtr: { id: string; name: string; ratingKva: number; nominalV: number };
  feeders: FeederDef[];
  nodes: TopologyNode[];
  /** Conductor resistance (ohm/km), resistive voltage-drop model. */
  conductorOhmPerKm: number;
}

export interface PhaseReading {
  v: number; // V (phase-neutral)
  i: number; // A (current flowing into this pole from upstream)
  p: number; // W
  pf: number;
  source: DataSource;
}

export interface NodeState {
  id: string;
  label: string;
  feederId: string | null;
  parentId: string | null;
  isLive: boolean;
  online: boolean;
  energized: boolean;
  phases: Record<Phase, PhaseReading>;
  /** Local service-drop load at this pole (A per phase), known via AMI/SIM. */
  localLoadA: Record<Phase, number>;
  status: "NORMAL" | "WARN" | "ALARM" | "DEENERGIZED";
  silentMs?: number;
  lastGasp?: boolean;
  wasSeenHealthy?: boolean;
}

export interface SectionResult {
  id: string; // `${parentId}`
  parentId: string;
  childIds: string[];
  phase: Phase;
  iIn: number;
  iOut: number;
  iLoad: number;
  leakA: number;
  thresholdA: number;
  tripped: boolean;
  source: "LIVE" | "SIM" | "MIXED";
}

export type DetectionType =
  | "SECTION_DIFFERENTIAL"
  | "BROKEN_CONDUCTOR"
  | "BROKEN_NEUTRAL"
  | "PHASE_UNBALANCE"
  | "FEEDER_OVERLOAD"
  | "DTR_OVERLOAD"
  | "UNDERVOLTAGE"
  | "OVERVOLTAGE"
  | "NODE_OFFLINE";

export interface Detection {
  key: string; // stable identity for transition detection
  type: DetectionType;
  ansi: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  phase?: Phase;
  nodeId?: string;
  sectionId?: string;
  feederId?: string;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  source: "LIVE" | "SIM" | "MIXED";
  /** Suggested FLISR isolation points (upstream / downstream poles). */
  isolate?: { upstream: string; downstream: string[] };
  customersAffected?: number;
}

export type InjectedFaultType =
  | "LEAKAGE"
  | "BROKEN_CONDUCTOR"
  | "BROKEN_NEUTRAL"
  | "OVERLOAD"
  | "PHASE_UNBALANCE";

export interface InjectedFault {
  id: string;
  type: InjectedFaultType;
  /** Span is identified by its downstream (child) node id. */
  spanChildId?: string;
  feederId?: string;
  phase?: Phase;
  magnitudeA?: number;
  createdAt: string;
}

export interface FeederSummary {
  id: string;
  name: string;
  headCurrent: Record<Phase, number>;
  ampacityA: number;
  loadingPct: number;
  unbalancePct: number;
  kw: number;
}

export interface CalibrationState {
  vOffset: number; // V2 - V1 learned under negligible-drop conditions
  pGain: number; // P1 / P2 learned under no-leakage conditions
  vSamples: number;
  pSamples: number;
  status: "LEARNING" | "CALIBRATED";
}

export interface NetworkSnapshot {
  timestamp: string;
  tick: number;
  topology: NetworkTopology;
  nodes: NodeState[];
  sections: SectionResult[];
  detections: Detection[];
  feeders: FeederSummary[];
  dtr: {
    kva: number;
    kw: number;
    loadingPct: number;
    voltage: Record<Phase, number>;
    current: Record<Phase, number>;
    unbalancePct: number;
  };
  uninstrumentedMode: UninstrumentedPhaseMode;
  injectedFaults: InjectedFault[];
  liveLinkUp: boolean;
  calibration: CalibrationState;
  benchScale?: number;
}
