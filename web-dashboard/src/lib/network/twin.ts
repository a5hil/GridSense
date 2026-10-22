/**
 * GridSense Network Digital Twin engine.
 *
 * Runs a simple radial load flow over the LT network every TICK_MS:
 *   1. Simulated customer loads drift slowly (mean-reverting, no spikes).
 *   2. Currents are summed bottom-up (KCL), using measured current on live poles.
 *   3. Voltages are computed top-down (resistive drop). The DTR's phase-R
 *      voltage is set so the computed voltage at POLE-A equals the real measured
 *      V1, which keeps the simulated network consistent with live data.
 *   4. FDIR runs on the result.
 *
 * Live nodes have one PZEM (phase R). Phases Y/B on live poles are either
 * NOT_INSTRUMENTED (excluded from all math) or SIM, chosen by the operator.
 */
import { EventEmitter } from "events";
import { telemetryStore } from "../telemetry-state";
import { liveCalibration } from "../calibration";
import { omsManager } from "../oms-state";
import { computeSections, round, runFdir } from "./fdir";
import { CHILDREN, NETWORK_TOPOLOGY, NODE_BY_ID, TOPO_ORDER, mulberry32, subtree } from "./topology";
import {
  Detection,
  FeederSummary,
  InjectedFault,
  InjectedFaultType,
  NetworkSnapshot,
  NodeState,
  Phase,
  PHASES,
  PhaseReading,
  UninstrumentedPhaseMode,
} from "./types";

const TICK_MS = 2000;
const PHASE_ANGLE: Record<Phase, number> = { R: 0, Y: (-2 * Math.PI) / 3, B: (2 * Math.PI) / 3 };

type PhaseNums = Record<Phase, number>;
const zero = (): PhaseNums => ({ R: 0, Y: 0, B: 0 });

interface LiveSide {
  online: boolean;
  v: number;
  i: number;
  p: number;
  pf: number;
  phases?: Record<Phase, { v: number; i: number; p: number; pf: number; src: string }>;
}

class NetworkTwin extends EventEmitter {
  private base: Record<string, PhaseNums> = {};
  private cur: Record<string, PhaseNums> = {};
  private pf: Record<string, number> = {};
  private dtrV: PhaseNums = { R: 240, Y: 240.6, B: 239.4 };
  private dtrOffset: PhaseNums = { R: 0, Y: 0.6, B: -0.6 };
  private faults: InjectedFault[] = [];
  private mode: UninstrumentedPhaseMode = "NOT_INSTRUMENTED";
  private tickN = 0;
  private activeKeys = new Map<string, Detection>();
  private last: NetworkSnapshot | null = null;
  private noise = mulberry32(Date.now() & 0xffffffff);
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.initLoads();
  }

  public start() {
    if (this.timer) return;
    this.step();
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  public stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  public getSnapshot(): NetworkSnapshot {
    return this.last ?? this.step();
  }

  public setMode(mode: UninstrumentedPhaseMode) {
    this.mode = mode;
    telemetryStore.addEventLog({
      level: "INFO",
      source: "NETWORK_TWIN",
      message: `Live-pole phases Y/B now shown as ${mode === "SIM" ? "SIMULATED" : "NOT INSTRUMENTED"}`,
    });
    this.step();
  }

  public injectFault(f: {
    type: InjectedFaultType;
    spanChildId?: string;
    feederId?: string;
    phase?: Phase;
    magnitudeA?: number;
  }): { ok: boolean; message: string } {
    const spanTypes: InjectedFaultType[] = ["LEAKAGE", "BROKEN_CONDUCTOR", "BROKEN_NEUTRAL"];
    if (spanTypes.includes(f.type)) {
      const child = f.spanChildId ? NODE_BY_ID[f.spanChildId] : undefined;
      if (!child || child.kind !== "POLE") return { ok: false, message: "Select a valid span (downstream pole)." };
      const parent = child.parentId ? NODE_BY_ID[child.parentId] : undefined;
      if (child.liveBinding || parent?.liveBinding) {
        return { ok: false, message: "This span is LIVE hardware. Create the fault physically on the test rig." };
      }
      // Removing supply/neutral upstream of real hardware would contradict what the real meters show.
      if (f.type !== "LEAKAGE" && subtree(child.id).some((id) => NODE_BY_ID[id].liveBinding)) {
        return { ok: false, message: "Span feeds the LIVE poles; the real meters would contradict this fault." };
      }
      if (f.type !== "BROKEN_NEUTRAL" && !f.phase) return { ok: false, message: "Select a phase." };
    } else if (!f.feederId) {
      return { ok: false, message: "Select a feeder." };
    }

    const fault: InjectedFault = {
      id: `SIM-F${String(this.faults.length + 1).padStart(2, "0")}-${Date.now().toString(36).slice(-4)}`,
      type: f.type,
      spanChildId: f.spanChildId,
      feederId: f.feederId,
      phase: f.type === "BROKEN_NEUTRAL" ? undefined : f.phase,
      magnitudeA: f.type === "LEAKAGE" ? Math.max(0.1, Number(f.magnitudeA ?? 1.5)) : undefined,
      createdAt: new Date().toISOString(),
    };
    this.faults.push(fault);
    telemetryStore.addEventLog({
      level: "WARN",
      source: "NETWORK_TWIN",
      message: `[SIM] Fault injected: ${describeFault(fault)}`,
    });
    this.step();
    return { ok: true, message: `Injected ${describeFault(fault)}` };
  }

  public clearFaults(id?: string) {
    this.faults = id ? this.faults.filter((f) => f.id !== id) : [];
    telemetryStore.addEventLog({
      level: "INFO",
      source: "NETWORK_TWIN",
      message: id ? `[SIM] Fault ${id} cleared` : "[SIM] All simulated faults cleared",
    });
    this.step();
  }

  // ------------------------------------------------------------------------

  private initLoads() {
    const rand = mulberry32(4242);
    let rr = 0;
    for (const n of NETWORK_TOPOLOGY.nodes) {
      const b = zero();
      if (n.kind === "POLE" && !n.liveBinding) {
        // Residential/commercial customers are single-phase; spread round-robin.
        for (let c = 0; c < n.customers; c++) {
          const ph = PHASES[rr++ % 3];
          b[ph] += 1.0 + rand() * 1.6;
        }
        // Industrial lane has some three-phase consumers.
        if (n.feederId === "LT-3" && rand() < 0.5) {
          const a = 3 + rand() * 4;
          PHASES.forEach((p) => (b[p] += a));
        }
      } else if (n.liveBinding === "Pole-B") {
        // Only used when Y/B are SIM: one customer per phase.
        b.Y = 1.3;
        b.B = 1.1;
      }
      this.base[n.id] = b;
      this.cur[n.id] = { ...b };
      this.pf[n.id] = 0.88 + rand() * 0.09;
    }
  }

  private gauss() {
    // Box-Muller from the seeded generator
    const u = Math.max(1e-9, this.noise());
    const v = this.noise();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private driftLoads() {
    for (const id of Object.keys(this.cur)) {
      for (const p of PHASES) {
        const b = this.base[id][p];
        if (b === 0) continue;
        // Ornstein–Uhlenbeck: mean-reverting, ±~5 % wander, no spikes.
        const c = this.cur[id][p] + 0.08 * (b - this.cur[id][p]) + b * 0.012 * this.gauss();
        this.cur[id][p] = Math.max(0, c);
      }
    }
    for (const p of PHASES) {
      this.dtrOffset[p] += 0.05 * ((p === "R" ? 0 : p === "Y" ? 0.6 : -0.6) - this.dtrOffset[p]) + 0.03 * this.gauss();
    }
  }

  private liveInput(): { linkUp: boolean; a: LiveSide; b: LiveSide } {
    const t = telemetryStore.getTelemetry();
    const st = telemetryStore.getStatus();
    const linkUp = !!st.gatewayConnected && t.status !== "DISCONNECTED" && t.status !== "WAITING_DATA";
    const side = (pd: typeof t.p1): LiveSide => {
      const ph = pd?.phases;
      const phasesMap: Record<Phase, { v: number; i: number; p: number; pf: number; src: string }> = {
        R: { v: ph?.r?.v ?? pd?.v ?? 0, i: ph?.r?.i ?? pd?.i ?? 0, p: ph?.r?.p ?? pd?.p ?? 0, pf: ph?.r?.pf ?? pd?.pf ?? 0.96, src: ph?.r?.src ?? "LIVE" },
        Y: { v: ph?.y?.v ?? 0, i: ph?.y?.i ?? 0, p: ph?.y?.p ?? 0, pf: ph?.y?.pf ?? 0.96, src: ph?.y?.src ?? "NOT_INSTRUMENTED" },
        B: { v: ph?.b?.v ?? 0, i: ph?.b?.i ?? 0, p: ph?.b?.p ?? 0, pf: ph?.b?.pf ?? 0.96, src: ph?.b?.src ?? "NOT_INSTRUMENTED" },
      };
      return {
        online: linkUp && !!pd?.isOnline && (pd?.age_ms ?? 99999) < 20000,
        v: pd?.v ?? 0,
        i: pd?.i ?? 0,
        p: pd?.p ?? 0,
        pf: pd?.pf && pd.pf > 0 ? pd.pf : 0.96,
        phases: phasesMap,
      };
    };
    return { linkUp, a: side(t.p1), b: side(t.p2) };
  }

  private loadFactor(feederId: string | null, p: Phase): number {
    let f = 1;
    for (const ft of this.faults) {
      if (ft.feederId !== feederId) continue;
      if (ft.type === "OVERLOAD") f *= 2.6;
      if (ft.type === "PHASE_UNBALANCE") f *= p === "R" ? 1.7 : p === "Y" ? 0.7 : 0.55;
    }
    return f;
  }

  public step(): NetworkSnapshot {
    this.tickN++;
    this.driftLoads();
    const topo = NETWORK_TOPOLOGY;
    const live = this.liveInput();
    const ohm = (id: string) => (NODE_BY_ID[id].spanM / 1000) * topo.conductorOhmPerKm;

    // Fault lookups
    const leakOnSpan = (childId: string, p: Phase) =>
      this.faults
        .filter((f) => f.type === "LEAKAGE" && f.spanChildId === childId && f.phase === p)
        .reduce((a, f) => a + (f.magnitudeA ?? 0), 0);
    const dead: Record<Phase, Set<string>> = { R: new Set(), Y: new Set(), B: new Set() };
    for (const f of this.faults.filter((x) => x.type === "BROKEN_CONDUCTOR" && x.spanChildId && x.phase)) {
      subtree(f.spanChildId!).forEach((id) => dead[f.phase!].add(id));
    }

    // Classify each phase of each node
    const srcOf = (id: string, p: Phase): PhaseReading["source"] => {
      const n = NODE_BY_ID[id];
      if (!n.liveBinding) return "SIM";
      const side = n.liveBinding === "Pole-A" ? live.a : live.b;
      if (side.phases?.[p]?.src === "LIVE") return side.online ? "LIVE" : "OFFLINE";
      if (p !== "R") return this.mode === "SIM" ? "SIM" : "NOT_INSTRUMENTED";
      return side.online ? "LIVE" : "OFFLINE";
    };
    const liveSide = (id: string) => (NODE_BY_ID[id].liveBinding === "Pole-A" ? live.a : live.b);

    // Local load (A) at each node
    const localLoad: Record<string, PhaseNums> = {};
    for (const id of TOPO_ORDER) {
      const n = NODE_BY_ID[id];
      const l = zero();
      for (const p of PHASES) {
        const src = srcOf(id, p);
        if (dead[p].has(id) || src === "NOT_INSTRUMENTED" || src === "OFFLINE") continue;
        if (src === "LIVE") {
          // Terminal live pole: everything it measures is its own downstream load.
          const side = liveSide(id);
          const iVal = side.phases?.[p]?.i ?? (p === "R" ? side.i : 0);
          l[p] = n.isTerminal ? iVal : 0;
        } else {
          l[p] = this.cur[id][p] * this.loadFactor(n.feederId, p);
        }
      }
      localLoad[id] = l;
    }

    // 1. Currents bottom-up. iIn = current entering the pole; iSpan = current on the span
    //    from its parent (includes any leakage tapped on that span).
    const iIn: Record<string, PhaseNums> = {};
    const iSpan: Record<string, PhaseNums> = {};
    for (const id of [...TOPO_ORDER].reverse()) {
      const a = zero();
      const s = zero();
      for (const p of PHASES) {
        const src = srcOf(id, p);
        if (dead[p].has(id) || src === "NOT_INSTRUMENTED" || src === "OFFLINE") {
          a[p] = 0;
        } else if (src === "LIVE") {
          const side = liveSide(id);
          a[p] = side.phases?.[p]?.i ?? (p === "R" ? side.i : 0);
        } else {
          a[p] = localLoad[id][p] + (CHILDREN[id] || []).reduce((acc, c) => acc + iSpan[c][p], 0);
        }
        s[p] = dead[p].has(id) ? 0 : a[p] + leakOnSpan(id, p);
      }
      iIn[id] = a;
      iSpan[id] = s;
    }

    // 2. Voltages top-down. Anchor DTR phase R to live V1 when available.
    const pathToA: string[] = [];
    for (let cur: string | null = "POLE-A"; cur && cur !== "DTR-01"; cur = NODE_BY_ID[cur].parentId) pathToA.push(cur);
    if (live.a.online && live.a.v > 180) {
      const drop = pathToA.reduce((acc, id) => acc + iSpan[id].R * ohm(id), 0);
      this.dtrV.R = live.a.v + drop;
    } else {
      this.dtrV.R += 0.05 * (240 - this.dtrV.R);
    }
    this.dtrV.Y = this.dtrV.R + this.dtrOffset.Y;
    this.dtrV.B = this.dtrV.R + this.dtrOffset.B;

    const volt: Record<string, PhaseNums> = { "DTR-01": { ...this.dtrV } };
    for (const id of TOPO_ORDER) {
      if (id === "DTR-01") continue;
      const parent = NODE_BY_ID[id].parentId!;
      const v = zero();
      for (const p of PHASES) {
        const src = srcOf(id, p);
        if (dead[p].has(id) || src === "NOT_INSTRUMENTED" || src === "OFFLINE") v[p] = 0;
        else if (src === "LIVE") {
          const side = liveSide(id);
          v[p] = side.phases?.[p]?.v ?? (p === "R" ? side.v : 0);
        } else v[p] = Math.max(0, volt[parent][p] - iSpan[id][p] * ohm(id));
      }
      volt[id] = v;
    }

    // 3. Broken neutral: floating star point for the subtree below the open neutral.
    for (const f of this.faults.filter((x) => x.type === "BROKEN_NEUTRAL" && x.spanChildId)) {
      const c = f.spanChildId!;
      let re = 0, im = 0, ysum = 0;
      for (const p of PHASES) {
        const vc = volt[c][p];
        if (vc <= 0) continue;
        const y = iSpan[c][p] / vc; // load admittance (constant-current approximation)
        re += vc * Math.cos(PHASE_ANGLE[p]) * y;
        im += vc * Math.sin(PHASE_ANGLE[p]) * y;
        ysum += y;
      }
      if (ysum <= 0) continue;
      const vnRe = re / ysum, vnIm = im / ysum;
      for (const id of subtree(c)) {
        for (const p of PHASES) {
          const vp = volt[id][p];
          if (vp <= 0) continue;
          volt[id][p] = Math.hypot(vp * Math.cos(PHASE_ANGLE[p]) - vnRe, vp * Math.sin(PHASE_ANGLE[p]) - vnIm);
        }
      }
    }

    // 4. Build node states (SIM readings get a small metering error, ±0.2 % I, ±0.1 V)
    const nodes: Record<string, NodeState> = {};
    for (const id of TOPO_ORDER) {
      const n = NODE_BY_ID[id];
      const phases = {} as Record<Phase, PhaseReading>;
      for (const p of PHASES) {
        const src = id === "DTR-01" ? "SIM" : srcOf(id, p);
        const isSimMeter = src === "SIM";
        const i = id === "DTR-01" ? (CHILDREN[id] || []).reduce((a, c) => a + iSpan[c][p], 0) : iIn[id][p];
        const iMeas = isSimMeter && i > 0 ? i * (1 + 0.002 * this.gauss()) : i;
        const vMeas = isSimMeter && volt[id][p] > 0 ? volt[id][p] + 0.1 * this.gauss() : volt[id][p];
        const pf = src === "LIVE" ? liveSide(id).pf : this.pf[id] ?? 0.95;
        phases[p] = {
          v: round(vMeas, 1),
          i: round(iMeas, 3),
          p: round(src === "LIVE" ? (p === "R" ? liveSide(id).p : 0) : vMeas * iMeas * pf, 1),
          pf: round(pf, 2),
          source: src,
        };
      }
      const instrumented = PHASES.filter((p) => phases[p].source === "LIVE" || phases[p].source === "SIM");
      const energized = instrumented.some((p) => phases[p].v >= 50);
      nodes[id] = {
        id,
        label: n.label,
        feederId: n.feederId,
        parentId: n.parentId,
        isLive: !!n.liveBinding,
        online: n.liveBinding ? liveSide(id).online : true,
        energized,
        phases,
        localLoadA: {
          R: round(localLoad[id].R, 3),
          Y: round(localLoad[id].Y, 3),
          B: round(localLoad[id].B, 3),
        },
        status: !energized && instrumented.length > 0 ? "DEENERGIZED" : "NORMAL",
      };
    }

    // 5. Feeder + DTR summaries
    const feeders: FeederSummary[] = topo.feeders.map((f) => {
      const heads = (CHILDREN["DTR-01"] || []).filter((c) => NODE_BY_ID[c].feederId === f.id);
      const hc = zero();
      let kw = 0;
      for (const h of heads)
        for (const p of PHASES) {
          hc[p] += iSpan[h][p];
          kw += (this.dtrV[p] * iSpan[h][p] * (this.pf[h] ?? 0.95)) / 1000;
        }
      const vals = PHASES.map((p) => hc[p]);
      const avg = vals.reduce((a, b) => a + b, 0) / 3;
      const max = Math.max(...vals);
      return {
        id: f.id,
        name: f.name,
        headCurrent: { R: round(hc.R, 1), Y: round(hc.Y, 1), B: round(hc.B, 1) },
        ampacityA: f.ampacityA,
        loadingPct: round((max / f.ampacityA) * 100, 1),
        unbalancePct: avg > 0 ? round(((max - avg) / avg) * 100, 1) : 0,
        kw: round(kw, 2),
      };
    });
    const dtrI = zero();
    feeders.forEach((f) => PHASES.forEach((p) => (dtrI[p] += f.headCurrent[p])));
    const dtrKva = PHASES.reduce((a, p) => a + this.dtrV[p] * dtrI[p], 0) / 1000;
    const dtrAvg = (dtrI.R + dtrI.Y + dtrI.B) / 3;
    const dtrMax = Math.max(dtrI.R, dtrI.Y, dtrI.B);

    // 6. FDIR
    const sections = computeSections(nodes);
    const detections = runFdir({
      topology: topo,
      nodes,
      sections,
      feeders,
      dtrKva,
      liveLinkUp: live.linkUp,
    });

    // Node status from detections
    for (const d of detections) {
      const ids = new Set<string>([d.nodeId, ...(d.isolate?.downstream ?? [])].filter(Boolean) as string[]);
      for (const id of ids) {
        const n = nodes[id];
        if (!n || n.status === "DEENERGIZED") continue;
        if (d.severity === "MEDIUM") {
          if (n.status === "NORMAL") n.status = "WARN";
        } else n.status = "ALARM";
      }
    }

    this.logTransitions(detections);

    const snap: NetworkSnapshot = {
      timestamp: new Date().toISOString(),
      tick: this.tickN,
      topology: topo,
      nodes: TOPO_ORDER.map((id) => nodes[id]),
      sections,
      detections,
      feeders,
      dtr: {
        kva: round(dtrKva, 1),
        kw: round(feeders.reduce((a, f) => a + f.kw, 0), 1),
        loadingPct: round((dtrKva / topo.dtr.ratingKva) * 100, 1),
        voltage: { R: round(this.dtrV.R, 1), Y: round(this.dtrV.Y, 1), B: round(this.dtrV.B, 1) },
        current: { R: round(dtrI.R, 1), Y: round(dtrI.Y, 1), B: round(dtrI.B, 1) },
        unbalancePct: dtrAvg > 0 ? round(((dtrMax - dtrAvg) / dtrAvg) * 100, 1) : 0,
      },
      uninstrumentedMode: this.mode,
      injectedFaults: [...this.faults],
      liveLinkUp: live.linkUp,
      calibration: liveCalibration.state(),
    };
    this.last = snap;
    this.emit("snapshot", snap);
    return snap;
  }

  private logTransitions(detections: Detection[]) {
    const now = new Map(detections.map((d) => [d.key, d]));
    for (const [k, d] of now) {
      if (this.activeKeys.has(k)) continue;
      telemetryStore.addEventLog({
        level: d.severity === "CRITICAL" ? "CRITICAL" : d.severity === "HIGH" ? "ERROR" : "WARN",
        source: "NETWORK_FDIR",
        message: `[${d.source}] ${d.ansi}: ${d.message}`,
        details: d.isolate
          ? `FLISR: open upstream of ${d.isolate.upstream}, downstream at ${d.isolate.downstream.join(", ")}`
          : undefined,
      });

      // Automatically dispatch Trouble Ticket in OMS for serious electrical faults
      if ((d.severity === "CRITICAL" || d.severity === "HIGH") && d.type !== "NODE_OFFLINE") {
        const targetNode = d.nodeId ? NODE_BY_ID[d.nodeId] : undefined;
        omsManager.autoCreateTicketForFault({
          faultCode: `${d.ansi} // ${d.type}`,
          affectedPole: targetNode ? `${targetNode.label} (${targetNode.id})` : d.sectionId ? `Section ${d.sectionId}` : "Distribution Span",
          gps: targetNode ? { lat: targetNode.lat, lng: targetNode.lng } : { lat: 10.2318, lng: 76.4088 },
          idiff: d.unit === "A" ? d.value : 0,
          severity: d.severity,
          feederId: d.feederId || targetNode?.feederId || "FEEDER_04_SECTOR4",
          feederName: d.feederId ? `Feeder ${d.feederId}` : undefined,
          estimatedCustomers: d.customersAffected ?? 45,
        });
      }
    }
    for (const [k, d] of this.activeKeys) {
      if (!now.has(k)) {
        telemetryStore.addEventLog({
          level: "INFO",
          source: "NETWORK_FDIR",
          message: `[${d.source}] Cleared: ${d.ansi} ${d.type.replace(/_/g, " ").toLowerCase()}${d.nodeId ? ` @ ${d.nodeId}` : ""}`,
        });
      }
    }
    this.activeKeys = now;
  }
}

export function describeFault(f: InjectedFault): string {
  switch (f.type) {
    case "LEAKAGE":
      return `${f.magnitudeA?.toFixed(2)} A leakage/illegal tap, phase ${f.phase}, span ${NODE_BY_ID[f.spanChildId!]?.parentId} → ${f.spanChildId}`;
    case "BROKEN_CONDUCTOR":
      return `Broken phase-${f.phase} conductor, span ${NODE_BY_ID[f.spanChildId!]?.parentId} → ${f.spanChildId}`;
    case "BROKEN_NEUTRAL":
      return `Broken neutral, span ${NODE_BY_ID[f.spanChildId!]?.parentId} → ${f.spanChildId}`;
    case "OVERLOAD":
      return `Overload (×2.6 load) on ${f.feederId}`;
    case "PHASE_UNBALANCE":
      return `Load shifted onto phase R on ${f.feederId}`;
  }
}

const g = globalThis as unknown as { gsNetworkTwin?: NetworkTwin };
export const networkTwin = g.gsNetworkTwin || new NetworkTwin();
if (process.env.NODE_ENV !== "production") g.gsNetworkTwin = networkTwin;

if (typeof window === "undefined" && process.env.NEXT_PHASE !== "phase-production-build") {
  networkTwin.start();
}
