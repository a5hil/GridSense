/**
 * GridSense 11kV/415V distribution network model (LT side of DTR-01).
 *
 *   ANGAMALY 33/11kV SS ─ 11kV Feeder 04 ─ DTR-01 (250 kVA, 11kV/415V)
 *        ├─ LT-1 (East)  : F1-P01 … F1-P08
 *        │     └─ lateral at F1-P01 → POLE-A (LIVE node "Pole-A") → POLE-B (LIVE node "Pole-B")
 *        ├─ LT-2 (South) : F2-P01 … F2-P08
 *        │     └─ lateral at F2-P04 → F2-L1-P01 … F2-L1-P03
 *        └─ LT-3 (West)  : F3-P01 … F3-P07
 *
 * The two physical GridSense nodes keep their real GPS coordinates and are bound
 * to POLE-A / POLE-B. All other poles are estimated via Load Flow.
 */
import { ENTERPRISE_CONFIG } from "../constants";
import { FeederDef, NetworkTopology, TopologyNode } from "./types";

const DTR_LAT = 10.2315;
const DTR_LNG = 76.4082;

// Deterministic PRNG so the generated network is identical on every reload.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const FEEDERS: FeederDef[] = [
  { id: "LT-1", name: "LT-1 East (Market Road)", ampacityA: 110, color: "#10b981" },
  { id: "LT-2", name: "LT-2 South (Residential)", ampacityA: 110, color: "#06b6d4" },
  { id: "LT-3", name: "LT-3 North (Industrial Lane)", ampacityA: 110, color: "#a855f7" },
];

function buildTopology(): NetworkTopology {
  const rand = mulberry32(20261021);
  const nodes: TopologyNode[] = [];

  const add = (n: Omit<TopologyNode, "spanM" | "customers"> & { customers?: number }) => {
    const parent = nodes.find((p) => p.id === n.parentId);
    const spanM = parent ? Math.round(distanceM(parent.lat, parent.lng, n.lat, n.lng)) : 0;
    const customers = n.customers ?? (n.kind === "POLE" ? 2 + Math.floor(rand() * 6) : 0);
    nodes.push({ ...n, spanM, customers });
  };

  add({
    id: "DTR-01",
    label: ENTERPRISE_CONFIG.DTR_SHORT,
    kind: "DTR",
    feederId: null,
    parentId: null,
    lat: DTR_LAT,
    lng: DTR_LNG,
    customers: 0,
  });

  // =========================================================================
  // FEEDER LT-1: East Market / Campus Road (10 Poles)
  // Routed along the asphalt road corridor with standard KSEB 35m-45m pole spans.
  // F1-P01 & F1-P02 form the primary metered Section 1 (ANSI 87L differential zone).
  // =========================================================================
  const lt1Poles: Array<{ id: string; lat: number; lng: number; parentId: string; liveBinding?: "Pole-A" | "Pole-B"; customers?: number }> = [
    { id: "F1-P01", lat: 10.231800, lng: 76.408500, parentId: "DTR-01", liveBinding: "Pole-A", customers: 0 },
    { id: "F1-P02", lat: 10.232172, lng: 76.408750, parentId: "F1-P01", liveBinding: "Pole-B", customers: 1 },
    { id: "F1-P03", lat: 10.232444, lng: 76.408920, parentId: "F1-P02" },
    { id: "F1-P04", lat: 10.232580, lng: 76.409194, parentId: "F1-P03" },
    { id: "F1-P05", lat: 10.232597, lng: 76.409490, parentId: "F1-P04" },
    { id: "F1-P06", lat: 10.232250, lng: 76.409420, parentId: "F1-P05" },
    { id: "F1-P07", lat: 10.231900, lng: 76.409320, parentId: "F1-P06" },
    { id: "F1-P08", lat: 10.231550, lng: 76.409240, parentId: "F1-P07" },
    { id: "F1-P09", lat: 10.231209, lng: 76.409168, parentId: "F1-P08" },
    { id: "F1-P10", lat: 10.230780, lng: 76.409068, parentId: "F1-P09" },
  ];

  for (const p of lt1Poles) {
    add({
      id: p.id,
      label: p.id,
      kind: "POLE",
      feederId: "LT-1",
      parentId: p.parentId,
      lat: p.lat,
      lng: p.lng,
      liveBinding: p.liveBinding,
      customers: p.customers,
    });
  }

  // =========================================================================
  // FEEDER LT-2: South Residential Feeder (11 Poles: 8 Main Backbone + 3 Lateral)
  // Follows the primary North-South road corridor southbound, with lateral
  // branching at F2-P04 along the residential cross street.
  // =========================================================================
  const lt2MainPoles: Array<{ id: string; lat: number; lng: number; parentId: string }> = [
    { id: "F2-P01", lat: 10.231268, lng: 76.407826, parentId: "DTR-01" },
    { id: "F2-P02", lat: 10.230850, lng: 76.407650, parentId: "F2-P01" },
    { id: "F2-P03", lat: 10.230559, lng: 76.407549, parentId: "F2-P02" },
    { id: "F2-P04", lat: 10.230252, lng: 76.407216, parentId: "F2-P03" },
    { id: "F2-P05", lat: 10.229850, lng: 76.407210, parentId: "F2-P04" },
    { id: "F2-P06", lat: 10.229450, lng: 76.407250, parentId: "F2-P05" },
    { id: "F2-P07", lat: 10.229050, lng: 76.407290, parentId: "F2-P06" },
    { id: "F2-P08", lat: 10.228652, lng: 76.407311, parentId: "F2-P07" },
  ];

  for (const p of lt2MainPoles) {
    add({
      id: p.id,
      label: p.id,
      kind: "POLE",
      feederId: "LT-2",
      parentId: p.parentId,
      lat: p.lat,
      lng: p.lng,
    });
  }

  // Lateral branching from F2-P04 along the residential cross street
  const lt2LateralPoles: Array<{ id: string; lat: number; lng: number; parentId: string }> = [
    { id: "F2-L1-P01", lat: 10.229950, lng: 76.407500, parentId: "F2-P04" },
    { id: "F2-L1-P02", lat: 10.229613, lng: 76.407800, parentId: "F2-L1-P01" },
    { id: "F2-L1-P03", lat: 10.229420, lng: 76.408150, parentId: "F2-L1-P02" },
  ];

  for (const p of lt2LateralPoles) {
    add({
      id: p.id,
      label: p.id,
      kind: "POLE",
      feederId: "LT-2",
      parentId: p.parentId,
      lat: p.lat,
      lng: p.lng,
    });
  }

  // =========================================================================
  // FEEDER LT-3: North Industrial / Commercial Feeder (7 Poles)
  // Follows the primary arterial road northbound with standard 35m-55m spans.
  // =========================================================================
  const lt3Poles: Array<{ id: string; lat: number; lng: number; parentId: string }> = [
    { id: "F3-P01", lat: 10.231872, lng: 76.407938, parentId: "DTR-01" },
    { id: "F3-P02", lat: 10.232354, lng: 76.408119, parentId: "F3-P01" },
    { id: "F3-P03", lat: 10.232677, lng: 76.408375, parentId: "F3-P02" },
    { id: "F3-P04", lat: 10.233150, lng: 76.408240, parentId: "F3-P03" },
    { id: "F3-P05", lat: 10.233620, lng: 76.408100, parentId: "F3-P04" },
    { id: "F3-P06", lat: 10.233950, lng: 76.408110, parentId: "F3-P05" },
    { id: "F3-P07", lat: 10.234328, lng: 76.408117, parentId: "F3-P06" },
  ];

  for (const p of lt3Poles) {
    add({
      id: p.id,
      label: p.id,
      kind: "POLE",
      feederId: "LT-3",
      parentId: p.parentId,
      lat: p.lat,
      lng: p.lng,
    });
  }

  return {
    substationName: ENTERPRISE_CONFIG.SUBSTATION_NAME,
    dtr: { id: "DTR-01", name: ENTERPRISE_CONFIG.DTR_NAME, ratingKva: 250, nominalV: 240 },
    feeders: FEEDERS,
    nodes,
    conductorOhmPerKm: 0.544, // ACSR "Rabbit" @ 20°C
  };
}

export const NETWORK_TOPOLOGY: NetworkTopology = buildTopology();

/** Children lookup, built once. */
export const CHILDREN: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const n of NETWORK_TOPOLOGY.nodes) {
    map[n.id] = map[n.id] || [];
    if (n.parentId) {
      map[n.parentId] = map[n.parentId] || [];
      map[n.parentId].push(n.id);
    }
  }
  return map;
})();

export const NODE_BY_ID: Record<string, TopologyNode> = (() => {
  const map: Record<string, TopologyNode> = Object.fromEntries(
    NETWORK_TOPOLOGY.nodes.map((n) => [n.id, n])
  );
  // Aliases for live hardware nodes to ensure 100% backwards-compatibility
  const f1p1 = map["F1-P01"];
  const f1p2 = map["F1-P02"];
  if (f1p1) {
    map["POLE-A"] = f1p1;
    map["Pole-A"] = f1p1;
    map["Pole 1"] = f1p1;
    map["P1"] = f1p1;
  }
  if (f1p2) {
    map["POLE-B"] = f1p2;
    map["Pole-B"] = f1p2;
    map["Pole 2"] = f1p2;
    map["P2"] = f1p2;
  }
  return map;
})();

/** All node ids in the subtree rooted at `id` (inclusive). */
export function subtree(id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(CHILDREN[cur] || []));
  }
  return out;
}

/** Pre-order traversal from the DTR (parents always before children). */
export const TOPO_ORDER: string[] = (() => {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    (CHILDREN[id] || []).forEach(walk);
  };
  walk("DTR-01");
  return out;
})();
