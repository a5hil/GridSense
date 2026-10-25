import assert from "node:assert/strict";
import { DEFAULT_CONFIG, NodeSample, ProtResult, SpanProtection } from "./protection";

/**
 * Tiny gateway simulator. P1 transmits at t = 0, 1000, 2000 ... and P2 at
 * t = 500, 1500 ... The gateway emits one frame per received packet, each frame
 * carrying both nodes' latest values with ages on the gateway clock.
 */
interface NodeFn { (t: number): { v: number; i: number } }
function run(opts: {
  p1: NodeFn;
  p2: NodeFn;
  from: number;
  to: number;
  p2Silent?: (t: number) => boolean;
  lastGasp?: (t: number) => boolean;
  prot?: SpanProtection;
}) {
  const prot = opts.prot ?? new SpanProtection(DEFAULT_CONFIG);
  const results: { t: number; r: ProtResult }[] = [];
  let tx1 = -Infinity, tx2 = -Infinity;
  let s1 = { v: 0, i: 0 }, s2 = { v: 0, i: 0 };
  for (let t = opts.from; t <= opts.to; t += 500) {
    if (t % 1000 === 0) { tx1 = t; s1 = opts.p1(t); }
    else if (!opts.p2Silent?.(t)) { tx2 = t; s2 = opts.p2(t); }
    const age = (tx: number) => (tx === -Infinity ? 99999 : t - tx);
    const f1: NodeSample = { ...s1, ageMs: age(tx1) };
    const f2: NodeSample = { ...s2, ageMs: age(tx2), lastGasp: opts.lastGasp?.(t) };
    results.push({ t, r: prot.step(f1, f2) });
  }
  return { prot, results };
}
const states = (rs: { r: ProtResult }[]) => new Set(rs.map((x) => x.r.state));
const tripped = (rs: { r: ProtResult }[]) => rs.some((x) => x.r.trip);

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log("PASS", name); }
  catch (e) { console.error("FAIL", name, "\n   ", (e as Error).message); process.exitCode = 1; }
}

const H = (i: number) => () => ({ v: 230, i });

test("startup: P2 not yet seen -> no trip, protection reported blind", () => {
  const { results } = run({ p1: H(2.4), p2: H(2.4), from: 0, to: 400, p2Silent: () => true });
  assert.ok(!tripped(results));
  assert.ok(results.every((x) => x.r.blind));
});

test("startup: P1 2.4 A, P2 appears later -> arms, then HEALTHY, no trip", () => {
  const { results } = run({ p1: H(2.4), p2: H(2.4), from: 0, to: 10000, p2Silent: (t) => t < 2000 });
  assert.ok(!tripped(results));
  assert.equal(results[results.length - 1].r.state, "HEALTHY");
});

test("bench off: both ~0 V -> BENCH_DEENERGIZED, never a fault", () => {
  const z = () => ({ v: 0, i: 0 });
  const { results } = run({ p1: z, p2: z, from: 0, to: 6000 });
  assert.ok(!tripped(results));
  assert.ok(states(results).has("BENCH_DEENERGIZED"));
});

test("load step between the two samples: single skewed pair does not trip", () => {
  // step 2.4 -> 5.0 A at t=10200: P1 sampled before it, P2 after it
  const step = (t: number) => ({ v: 230, i: t >= 10200 ? 5.0 : 2.4 });
  const { results } = run({ p1: step, p2: step, from: 0, to: 20000 });
  assert.ok(results.some((x) => x.r.state === "PICKUP"), "should have seen one over-pickup pair");
  assert.ok(!tripped(results), "debounce must absorb the transient");
});

test("sub-pickup leak 0.25 A: no trip", () => {
  const { results } = run({ p1: H(2.45), p2: H(2.2), from: 0, to: 20000 });
  assert.ok(!tripped(results));
});

test("persistent leak 0.8 A with V2 present: trips as TRIP_LEAKAGE after 3 paired cycles", () => {
  const { results } = run({ p1: H(2.45), p2: H(1.65), from: 0, to: 20000 });
  const first = results.find((x) => x.r.trip)!;
  assert.ok(first, "must trip");
  assert.equal(first.r.state, "TRIP_LEAKAGE");
  assert.equal(first.r.overCycles, 3);
});

test("I2 -> 0 A with V2 still present (all current diverted): trips (old arming rule would not)", () => {
  const { results } = run({ p1: H(2.45), p2: () => ({ v: 228, i: 0 }), from: 0, to: 20000 });
  assert.ok(tripped(results));
});

test("trip stays latched after current returns; reset clears it", () => {
  const leak = (t: number) => ({ v: 230, i: t < 8000 ? 1.0 : 2.4 });
  const a = run({ p1: H(2.4), p2: leak, from: 0, to: 20000 });
  assert.ok(a.results[a.results.length - 1].r.trip, "latched");
  a.prot.reset();
  const b = run({ p1: H(2.4), p2: H(2.4), from: 20500, to: 30000, prot: a.prot });
  assert.ok(!b.results[b.results.length - 1].r.trip, "cleared after reset");
});

test("P2 silent while P1 live: OPEN_CONDUCTOR (suspected) only after silenceMs", () => {
  const { results } = run({ p1: H(2.4), p2: H(2.4), from: 0, to: 20000, p2Silent: (t) => t >= 8000 });
  const first = results.find((x) => x.r.state === "OPEN_CONDUCTOR")!;
  assert.ok(first, "must classify open conductor");
  assert.ok(first.t - 7500 >= DEFAULT_CONFIG.silenceMs - 500, "not before silence threshold");
  assert.equal(first.r.confirmed, false);
});

test("P2 last-gasp: OPEN_CONDUCTOR confirmed immediately once P2 is stale", () => {
  const { results } = run({
    p1: H(2.4), p2: H(2.4), from: 0, to: 20000,
    p2Silent: (t) => t >= 8000, lastGasp: (t) => t >= 8000,
  });
  const g = results.find((x) => x.r.confirmed)!;
  assert.ok(g, "must confirm");
  assert.equal(g.r.state, "OPEN_CONDUCTOR");
});

test("both nodes stale: DEGRADED and blind, never HEALTHY", () => {
  const { results } = run({ p1: H(2.4), p2: H(2.4), from: 0, to: 20000, p2Silent: () => false });
  // freeze everything after t=6000 by feeding ages directly
  const prot = new SpanProtection();
  const r = prot.step({ v: 230, i: 2.4, ageMs: 12000 }, { v: 230, i: 2.4, ageMs: 11000 });
  assert.equal(r.state, "DEGRADED");
  assert.ok(r.blind);
  assert.ok(results.length > 0);
});

test("message is generated from the classified state (no '0.000 A exceeds 0.350 A')", () => {
  const prot = new SpanProtection();
  const r = prot.step({ v: 0, i: 0, ageMs: 100 }, { v: 0, i: 0, ageMs: 200 });
  assert.equal(r.state, "BENCH_DEENERGIZED");
  assert.ok(!/exceeds/.test(r.message));
});

console.log(`\n${passed} tests passed`);
