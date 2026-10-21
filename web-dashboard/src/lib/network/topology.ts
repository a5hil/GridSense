/**
 * GridSense demo distribution network (LT side of DTR-01).
 *
 *   ANGAMALY 33/11kV SS ─ 11kV Feeder 04 ─ DTR-01 (250 kVA, 11kV/415V)
 *        ├─ LT-1 (East)  : F1-P01 … F1-P08
 *        │     └─ lateral at F1-P01 → POLE-A (LIVE node "Pole-A") → POLE-B (LIVE node "Pole-B")
 *        ├─ LT-2 (South) : F2-P01 … F2-P08
 *        │     └─ lateral at F2-P04 → F2-L1-P01 … F2-L1-P03
 *        └─ LT-3 (West)  : F3-P01 … F3-P07
 *
 * The two physical GridSense nodes keep their real GPS coordinates and are bound
 * to POLE-A / POLE-B. All other poles are simulated.
 */
import { ENTERPRISE_CONFIG } from "../constants";
import { FeederDef, NetworkTopology, TopologyNode } from "./types";

const DTR_LAT = 10.2315;
const DTR_LNG = 76.4085;
const STEP_DEG = 0.00036; // ≈ 40 m pole spacing

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
  { id: "LT-3", name: "LT-3 West (Industrial Lane)", ampacityA: 110, color: "#a855f7" },
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

  // Straight run helper
  const run = (
    feederId: string,
    prefix: string,
    count: number,
    startParent: string,
    origin: { lat: number; lng: number },
    dir: { dLat: number; dLng: number }
  ) => {
    let parent = startParent;
    for (let k = 1; k <= count; k++) {
      const id = `${prefix}-P${String(k).padStart(2, "0")}`;
      add({
        id,
        label: id,
        kind: "POLE",
        feederId,
        parentId: parent,
        lat: Number((origin.lat + dir.dLat * k).toFixed(6)),
        lng: Number((origin.lng + dir.dLng * k).toFixed(6)),
      });
      parent = id;
    }
  };

  // LT-1 East
  run("LT-1", "F1", 8, "DTR-01", { lat: DTR_LAT - 0.0001, lng: DTR_LNG }, { dLat: 0, dLng: STEP_DEG });

  // LIVE lateral off F1-P01 — real node coordinates
  add({
    id: "POLE-A",
    label: "POLE-A (Node A)",
    kind: "POLE",
    feederId: "LT-1",
    parentId: "F1-P01",
    lat: 10.2318,
    lng: 76.4088,
    liveBinding: "Pole-A",
    customers: 0, // incomer pole: no service drops, so I_A − I_B is pure span leakage
  });
  add({
    id: "POLE-B",
    label: "POLE-B (Node B)",
    kind: "POLE",
    feederId: "LT-1",
    parentId: "POLE-A",
    lat: 10.2325,
    lng: 76.4095,
    liveBinding: "Pole-B",
    isTerminal: true,
    customers: 1,
  });

  // LT-2 South (+ lateral at P04 heading east)
  run("LT-2", "F2", 8, "DTR-01", { lat: DTR_LAT, lng: DTR_LNG - 0.0001 }, { dLat: -STEP_DEG, dLng: 0 });
  const f2p4 = nodes.find((n) => n.id === "F2-P04")!;
  run("LT-2", "F2-L1", 3, "F2-P04", { lat: f2p4.lat, lng: f2p4.lng }, { dLat: 0, dLng: STEP_DEG });

  // LT-3 West
  run("LT-3", "F3", 7, "DTR-01", { lat: DTR_LAT + 0.0001, lng: DTR_LNG - 0.0001 }, { dLat: 0, dLng: -STEP_DEG });

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

export const NODE_BY_ID: Record<string, TopologyNode> = Object.fromEntries(
  NETWORK_TOPOLOGY.nodes.map((n) => [n.id, n])
);

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
