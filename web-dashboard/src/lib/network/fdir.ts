/**
 * GridSense Network FDIR engine.
 *
 * Pure functions: given the topology and the current per-node, per-phase
 * readings, return section KCL results and a list of detections. No randomness
 * and no state, so the same inputs always give the same verdict.
 *
 * Section model: the "section" owned by a pole X is the conductor between X and
 * its children. Per phase φ:
 *
 *    I_leak,φ = I_in(X),φ − I_localLoad(X),φ − Σ I_in(child),φ
 *
 * A non-zero I_leak means current is leaving the conductor somewhere that no
 * meter accounts for (illegal tap, leakage to earth through vegetation, etc).
 */
import { CHILDREN, NODE_BY_ID, subtree } from "./topology";
import {
  Detection,
  FeederSummary,
  NetworkTopology,
  NodeState,
  Phase,
  PHASES,
  PhaseReading,
  SectionResult,
} from "./types";

export const FDIR_LIMITS = {
  diffMinA: 0.35, // absolute pickup (same as the 2-pole system)
  diffBiasPct: 2, // percentage bias: threshold = max(diffMinA, 2% of I_in)
  energizedV: 50,
  healthyV: 180,
  nominalV: 230,
  warnBandPct: 6, // Indian supply code, LV ±6 %
  tripBandPct: 10,
  brokenNeutralSpreadV: 30,
  unbalancePct: 20,
  unbalanceMinAvgA: 5,
};

const instrumented = (r: PhaseReading) => r.source === "LIVE" || r.source === "SIM";
const energized = (r: PhaseReading) => instrumented(r) && r.v >= FDIR_LIMITS.energizedV;

function sourceOf(nodes: NodeState[]): "LIVE" | "SIM" | "MIXED" {
  const live = nodes.filter((n) => n.isLive).length;
  if (live === 0) return "SIM";
  if (live === nodes.length) return "LIVE";
  return "MIXED";
}

function customersIn(ids: string[]): number {
  return ids.reduce((acc, id) => acc + (NODE_BY_ID[id]?.customers ?? 0), 0);
}

export function computeSections(nodes: Record<string, NodeState>): SectionResult[] {
  const out: SectionResult[] = [];
  for (const parent of Object.values(nodes)) {
    const childIds = CHILDREN[parent.id] || [];
    if (childIds.length === 0 || parent.id === "DTR-01") continue;
    if (parent.isLive && !parent.online) continue;
    const children = childIds.map((c) => nodes[c]);
    if (sourceOf([parent, ...children]) === "MIXED") continue;
    if (children.some((c) => c.isLive && !c.online)) continue;

    for (const phase of PHASES) {
      const pr = parent.phases[phase];
      const crs = children.map((c) => c.phases[phase]);
      if (!energized(pr) || crs.some((r) => !instrumented(r))) continue;
      // A de-energized child is a broken conductor, handled separately.
      if (crs.some((r) => r.v < FDIR_LIMITS.energizedV)) continue;

      const iIn = pr.i;
      const iLoad = parent.localLoadA[phase];
      const iOut = crs.reduce((a, r) => a + r.i, 0);
      const leakA = round(Math.abs(iIn - iLoad - iOut), 3);
      const thresholdA = Math.max(FDIR_LIMITS.diffMinA, (FDIR_LIMITS.diffBiasPct / 100) * iIn);

      out.push({
        id: parent.id,
        parentId: parent.id,
        childIds,
        phase,
        iIn: round(iIn, 3),
        iOut: round(iOut, 3),
        iLoad: round(iLoad, 3),
        leakA,
        thresholdA: round(thresholdA, 3),
        tripped: leakA >= thresholdA,
        source: sourceOf([parent, ...children]),
      });
    }
  }
  return out;
}

export function runFdir(params: {
  topology: NetworkTopology;
  nodes: Record<string, NodeState>;
  sections: SectionResult[];
  feeders: FeederSummary[];
  dtrKva: number;
  liveLinkUp: boolean;
}): Detection[] {
  const { topology, nodes, sections, feeders, dtrKva, liveLinkUp } = params;
  const det: Detection[] = [];
  const L = FDIR_LIMITS;

  // 1. Section differential (ANSI 87L) — leakage / theft / earth leakage
  for (const s of sections.filter((x) => x.tripped)) {
    const parent = nodes[s.parentId];
    const span = s.childIds.length === 1 ? `${s.parentId} → ${s.childIds[0]}` : `${s.parentId} → {${s.childIds.join(", ")}}`;
    const heavy = s.leakA >= 5;
    det.push({
      key: `87L:${s.parentId}:${s.phase}`,
      type: "SECTION_DIFFERENTIAL",
      ansi: "ANSI 87L",
      severity: heavy ? "CRITICAL" : "HIGH",
      phase: s.phase,
      sectionId: s.id,
      nodeId: s.parentId,
      feederId: parent.feederId ?? undefined,
      message: heavy
        ? `Earth leakage ${s.leakA.toFixed(2)} A on phase ${s.phase}, span ${span}`
        : `Unmetered current ${s.leakA.toFixed(3)} A on phase ${s.phase}, span ${span}: illegal tap or leakage`,
      value: s.leakA,
      threshold: s.thresholdA,
      unit: "A",
      source: s.source,
      isolate: { upstream: s.parentId, downstream: s.childIds },
      customersAffected: customersIn(s.childIds.flatMap((c) => subtree(c))),
    });
  }

  // 2. Broken conductor — parent energized, child dead on that phase
  for (const n of Object.values(nodes)) {
    if (!n.parentId || (n.isLive && !n.online)) continue;
    const parent = nodes[n.parentId];
    if (sourceOf([parent, n]) === "MIXED") continue;
    for (const phase of PHASES) {
      const pr = parent.phases[phase];
      const r = n.phases[phase];
      if (!instrumented(pr) || !instrumented(r)) continue;
      if (pr.v >= L.healthyV && r.v < L.energizedV) {
        const affected = subtree(n.id);
        det.push({
          key: `BC:${n.id}:${phase}`,
          type: "BROKEN_CONDUCTOR",
          ansi: "ANSI 46BC",
          severity: "CRITICAL",
          phase,
          nodeId: n.id,
          sectionId: parent.id,
          feederId: n.feederId ?? undefined,
          message: `Open conductor on phase ${phase} between ${parent.id} and ${n.id}: ${affected.length} pole(s) lost supply on ${phase}`,
          value: r.v,
          threshold: L.energizedV,
          unit: "V",
          source: sourceOf([parent, n]),
          isolate: { upstream: parent.id, downstream: [n.id] },
          customersAffected: customersIn(affected),
        });
      }
    }
  }

  // 3. Broken neutral — large phase-voltage spread that is not present upstream
  const neutralFaultSubtrees = new Set<string>();
  const spread = (n: NodeState) => {
    const vs = PHASES.map((p) => n.phases[p]);
    if (!vs.every(energized)) return null;
    const v = vs.map((r) => r.v);
    return Math.max(...v) - Math.min(...v);
  };
  for (const n of Object.values(nodes)) {
    if (!n.parentId) continue;
    const sp = spread(n);
    const psp = spread(nodes[n.parentId]);
    if (sp === null || psp === null) continue;
    if (sourceOf([nodes[n.parentId], n]) === "MIXED") continue;
    if (sp >= L.brokenNeutralSpreadV && psp < L.brokenNeutralSpreadV / 2) {
      const affected = subtree(n.id);
      affected.forEach((id) => neutralFaultSubtrees.add(id));
      const v = PHASES.map((p) => `${p} ${n.phases[p].v.toFixed(0)}V`).join(" / ");
      det.push({
        key: `BN:${n.id}`,
        type: "BROKEN_NEUTRAL",
        ansi: "ANSI 59N",
        severity: "CRITICAL",
        nodeId: n.id,
        sectionId: n.parentId,
        feederId: n.feederId ?? undefined,
        message: `Neutral open between ${n.parentId} and ${n.id}: voltage spread ${sp.toFixed(0)} V (${v}). Appliance damage risk`,
        value: sp,
        threshold: L.brokenNeutralSpreadV,
        unit: "V",
        source: sourceOf([nodes[n.parentId], n]),
        isolate: { upstream: n.parentId, downstream: [n.id] },
        customersAffected: customersIn(affected),
      });
    }
  }

  // 4. Under / over voltage — report worst node per feeder+phase+type
  const vLo1 = L.nominalV * (1 - L.warnBandPct / 100);
  const vLo2 = L.nominalV * (1 - L.tripBandPct / 100);
  const vHi1 = L.nominalV * (1 + L.warnBandPct / 100);
  const vHi2 = L.nominalV * (1 + L.tripBandPct / 100);
  const worst: Record<string, { n: NodeState; phase: Phase; v: number; count: number; type: "UV" | "OV" }> = {};
  for (const n of Object.values(nodes)) {
    if (n.id === "DTR-01" || neutralFaultSubtrees.has(n.id)) continue;
    for (const phase of PHASES) {
      const r = n.phases[phase];
      if (!energized(r)) continue;
      const type = r.v < vLo1 ? "UV" : r.v > vHi1 ? "OV" : null;
      if (!type) continue;
      const k = `${type}:${n.feederId}:${phase}`;
      const cur = worst[k];
      const isWorse = !cur || (type === "UV" ? r.v < cur.v : r.v > cur.v);
      worst[k] = isWorse ? { n, phase, v: r.v, count: (cur?.count ?? 0) + 1, type } : { ...cur, count: cur.count + 1 };
    }
  }
  for (const [k, w] of Object.entries(worst)) {
    const uv = w.type === "UV";
    const severe = uv ? w.v < vLo2 : w.v > vHi2;
    det.push({
      key: k,
      type: uv ? "UNDERVOLTAGE" : "OVERVOLTAGE",
      ansi: uv ? "ANSI 27" : "ANSI 59",
      severity: severe ? "HIGH" : "MEDIUM",
      phase: w.phase,
      nodeId: w.n.id,
      feederId: w.n.feederId ?? undefined,
      message: `${uv ? "Undervoltage" : "Overvoltage"} on ${w.n.feederId} phase ${w.phase}: worst ${w.v.toFixed(1)} V at ${w.n.id} (${w.count} pole(s) outside ±${L.warnBandPct}%)`,
      value: w.v,
      threshold: uv ? vLo1 : vHi1,
      unit: "V",
      source: w.n.isLive ? "LIVE" : "SIM",
    });
  }

  // 5. Feeder overload + phase unbalance (at feeder head)
  for (const f of feeders) {
    const maxI = Math.max(...PHASES.map((p) => f.headCurrent[p]));
    if (maxI > f.ampacityA) {
      det.push({
        key: `OL:${f.id}`,
        type: "FEEDER_OVERLOAD",
        ansi: "ANSI 51",
        severity: maxI > f.ampacityA * 1.2 ? "CRITICAL" : "HIGH",
        feederId: f.id,
        nodeId: firstPoleOf(f.id),
        message: `${f.name} overloaded: ${maxI.toFixed(1)} A vs ${f.ampacityA} A rating (${f.loadingPct.toFixed(0)}%)`,
        value: maxI,
        threshold: f.ampacityA,
        unit: "A",
        source: "SIM",
      });
    }
    const avg = PHASES.reduce((a, p) => a + f.headCurrent[p], 0) / 3;
    if (avg >= L.unbalanceMinAvgA && f.unbalancePct > L.unbalancePct) {
      det.push({
        key: `UB:${f.id}`,
        type: "PHASE_UNBALANCE",
        ansi: "ANSI 46",
        severity: "MEDIUM",
        feederId: f.id,
        nodeId: firstPoleOf(f.id),
        message: `${f.name} current unbalance ${f.unbalancePct.toFixed(1)}% (R ${f.headCurrent.R.toFixed(1)} / Y ${f.headCurrent.Y.toFixed(1)} / B ${f.headCurrent.B.toFixed(1)} A). Rebalance service drops`,
        value: f.unbalancePct,
        threshold: L.unbalancePct,
        unit: "%",
        source: "SIM",
      });
    }
  }

  // 6. DTR overload
  if (dtrKva > topology.dtr.ratingKva) {
    det.push({
      key: "OL:DTR",
      type: "DTR_OVERLOAD",
      ansi: "ANSI 49",
      severity: dtrKva > topology.dtr.ratingKva * 1.2 ? "CRITICAL" : "HIGH",
      nodeId: "DTR-01",
      message: `${topology.dtr.name} loading ${dtrKva.toFixed(1)} kVA exceeds ${topology.dtr.ratingKva} kVA rating`,
      value: dtrKva,
      threshold: topology.dtr.ratingKva,
      unit: "kVA",
      source: "SIM",
    });
  }

  // 7a. Live node dead or silent while its LIVE parent is healthy: open conductor
  const OPEN_CONDUCTOR_SILENCE_MS = 4000;
  for (const n of Object.values(nodes)) {
    if (!n.isLive || !n.parentId) continue;
    const parent = nodes[n.parentId];
    if (!parent.isLive || !parent.online) continue; // need a fresh measured reference
    if (parent.phases.R.v < L.healthyV) continue;
    const deadV = n.online && n.phases.R.v < L.energizedV;
    const silent = !n.online && (n.silentMs ?? 0) >= OPEN_CONDUCTOR_SILENCE_MS && n.wasSeenHealthy;
    if (!deadV && !silent && !n.lastGasp) continue;
    det.push({
      key: `BC:${n.id}:R`,
      type: "BROKEN_CONDUCTOR",
      ansi: "ANSI 46BC",
      severity: "CRITICAL",
      phase: "R",
      nodeId: n.id,
      sectionId: parent.id,
      feederId: n.feederId ?? undefined,
      message: n.lastGasp
        ? `Loss of supply at ${n.id} confirmed by last-gasp while ${parent.id} is live`
        : `${n.id} ${deadV ? "reads 0 V" : "silent"} while ${parent.id} is live: suspected open conductor`,
      value: n.phases.R.v,
      threshold: L.energizedV,
      unit: "V",
      source: "LIVE",
      isolate: { upstream: parent.id, downstream: [n.id] },
      customersAffected: customersIn(subtree(n.id)),
    });
  }

  // 7. Live node comms
  for (const n of Object.values(nodes).filter((x) => x.isLive && !x.online)) {
    if (det.some((d) => d.key === `BC:${n.id}:R`)) continue;
    det.push({
      key: `OFF:${n.id}`,
      type: "NODE_OFFLINE",
      ansi: "COMMS",
      severity: "MEDIUM",
      nodeId: n.id,
      feederId: n.feederId ?? undefined,
      message: liveLinkUp
        ? `${n.label}: no telemetry from hardware node (LoRa link or node power)`
        : `${n.label}: gateway not connected. Live data unavailable`,
      value: 0,
      threshold: 0,
      unit: "",
      source: "LIVE",
    });
  }

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 } as const;
  return det.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function firstPoleOf(feederId: string): string | undefined {
  return (CHILDREN["DTR-01"] || []).find((id) => NODE_BY_ID[id]?.feederId === feederId);
}

export function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
