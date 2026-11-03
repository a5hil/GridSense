/**
 * Hairline distribution-grid scene: pure geometry, no DOM, no React.
 *
 * One continuous path tells the story:
 *   33 kV towers -> fenced substation -> 11 kV poles -> pole-mounted DTR (vertex)
 *   -> LT poles -> two houses, plus an independent 33 kV tower corridor top-right.
 *
 * Rules that keep it clean:
 *  - every line runs along an isometric axis, so crossarms sit perpendicular to it
 *  - every circuit keeps its phase order through towers, poles and gantries
 *  - the only corner is the DTR pole, where the 11 kV line ends and LT starts
 *  - buildScene() counts wire-to-wire crossings (stats.crossings must be 0)
 */

export type Pt = [number, number];
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Wire { a: Pt; b: Pt; m: Pt; len: number }
export interface SceneInput {
    W: number;
    H: number;
    card: Rect;          // login card rectangle, in the same px space as W/H
    safeTop?: number;    // header height + gap; towers whose top would be hidden are skipped
    safeBottom?: number; // footer height + gap
}
export interface Scene {
    scale: number;
    paths: { s: string; t: string; f: string };   // SVG path data: structure, secondary, foliage
    grid: string;
    wirePath: string;
    wires: Wire[];
    dots: Pt[];
    width: number;
    fadeCenter: Pt;
    fadeRadius: number;
    stats: { scale: number; wires: number; crossings: number; wiresBehindCard: number };
}

const C = 0.8660254;
const S = 0.5;
type Cls = "s" | "t" | "f";

export function buildScene({ W, H, card, safeTop = 112, safeBottom = 58 }: SceneInput): Scene {
    const cw = card.x1 - card.x0;
    const cx = (card.x0 + card.x1) / 2;
    const side = (W - cw) / 2;
    const sideScale = (0.8 * (side - 88)) / 364;
    const viewScale = 1.5 * Math.min(W / 2560, (H - safeTop - safeBottom) / 1160);
    const s = Math.min(1.5, Math.max(0.5, Math.min(sideScale, viewScale)));
    const poleH = 74;
    const OX = cx;
    const OY = Math.min(H - safeBottom, card.y1 + 0.577 * (cw / 2) + poleH * s + 10);

    const P = (x: number, y: number, z = 0): Pt => [OX + (x - y) * C * s, OY + (x + y) * S * s - z * s];
    const f1 = (n: number) => n.toFixed(1);
    const pt = (a: Pt) => `${f1(a[0])},${f1(a[1])}`;

    const Ls = Math.ceil((cx - card.x0 + 48 + 182 * s) / (C * s)); // yard centre distance from the vertex
    const Lr = Ls;                                                  // right arm length

    const g: Record<Cls, string[]> = { s: [], t: [], f: [] };
    const dots: Pt[] = [];
    const wires: Wire[] = [];

    const L = (a: Pt, b: Pt, k: Cls = "s") => { g[k].push(`M${pt(a)}L${pt(b)}`); };
    const poly = (pts: Pt[], k: Cls = "s", close = true) => { g[k].push("M" + pts.map(pt).join("L") + (close ? "Z" : "")); };
    const dot = (p: Pt) => { dots.push(p); };
    const wire = (a: Pt, b: Pt) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const sag = Math.min(26, len * 0.045);
        wires.push({ a, b, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2 * sag], len });
    };

    /** wireframe box; the hidden back corner is omitted */
    function box(bx: number, by: number, z0: number, hx: number, hy: number, h: number, k: Cls = "s") {
        const b = (i: number, j: number, z: number) => P(bx + i * hx, by + j * hy, z);
        poly([b(-1, -1, z0 + h), b(1, -1, z0 + h), b(1, 1, z0 + h), b(-1, 1, z0 + h)], k);
        L(b(1, -1, z0), b(1, 1, z0), k);
        L(b(1, 1, z0), b(-1, 1, z0), k);
        ([[1, -1], [1, 1], [-1, 1]] as const).forEach(([i, j]) => L(b(i, j, z0), b(i, j, z0 + h), k));
        L(b(-1, -1, z0), b(-1, -1, z0 + h), "t");
    }
    const ground = (x: number, y: number, r = 6) => {
        const c = P(x, y, 0);
        const rx = r * s, ry = r * 0.5 * s;
        g.t.push(`M${f1(c[0] - rx)},${f1(c[1])}a${f1(rx)},${f1(ry)} 0 1,0 ${f1(2 * rx)},0a${f1(rx)},${f1(ry)} 0 1,0 ${f1(-2 * rx)},0`);
    };

    // ---- lattice tower: line heading +x, crossarms along y (perpendicular to the line) ----
    const TZ = [0, 34, 66, 96, 122, 146, 164];
    const THW = [24, 18, 13, 9, 7, 5, 2.5];
    const TOWER_ATT: Array<[number, number]> = [[-36, 116], [22, 142], [36, 116]]; // [lateral, z]
    function tower(x: number, y: number): Pt[] {
        const at = TOWER_ATT.map(([lat, z]) => P(x, y + lat, z - 9));
        const bx = P(x, y, 0)[0];
        if (P(x, y, 164)[1] < safeTop + 6 || bx < -40 || bx > W + 40) return at; // under the header / fully off-screen: keep wires, skip drawing
        const c = (i: number, j: number, k: number) => P(x + i * THW[k], y + j * THW[k], TZ[k]);
        poly([c(-1, -1, 0), c(1, -1, 0), c(1, 1, 0), c(-1, 1, 0)], "t");
        for (let k = 0; k < TZ.length; k++) {
            if (k) poly([c(1, -1, k), c(1, 1, k), c(-1, 1, k)], "s", false);
            if (k < TZ.length - 1) {
                L(c(1, -1, k), c(1, 1, k + 1)); L(c(1, 1, k), c(1, -1, k + 1), "t");
                L(c(-1, 1, k), c(1, 1, k + 1)); L(c(1, 1, k), c(-1, 1, k + 1), "t");
            }
        }
        ([[1, -1], [1, 1], [-1, 1]] as const).forEach(([i, j]) => {
            g.s.push("M" + TZ.map((_, k) => pt(c(i, j, k))).join("L"));
        });
        g.t.push("M" + TZ.map((_, k) => pt(c(-1, -1, k))).join("L"));
        L(P(x, y - 36, 116), P(x, y + 36, 116));
        L(P(x, y, 142), P(x, y + 22, 142));
        L(P(x, y - 36, 116), P(x, y, 142));
        L(P(x, y + 36, 116), P(x, y + 22, 142), "t");
        TOWER_ATT.forEach(([lat, z]) => { L(P(x, y + lat, z), P(x, y + lat, z - 9)); dot(P(x, y + lat, z - 9)); });
        dot(P(x, y, 164));
        return at;
    }

    // ---- pole with a flat crossarm ----
    function pole(x: number, y: number, h: number, axis: "x" | "y", lats: number[], armZ: number): Pt[] {
        L(P(x, y, 0), P(x, y, h));
        ground(x, y, 6);
        const A = (l: number) => (axis === "y" ? P(x, y + l, armZ) : P(x + l, y, armZ));
        const T = (l: number) => (axis === "y" ? P(x, y + l, armZ + 6) : P(x + l, y, armZ + 6));
        L(A(Math.min(...lats) - 4), A(Math.max(...lats) + 4));
        return lats.map((l) => { L(A(l), T(l)); dot(T(l)); return T(l); });
    }

    // ---- conical pine: front edges only, so it reads as a tree, not a cage ----
    function tree(x: number, y: number, sc = 1) {
        const b0 = P(x, y, 0);
        if (b0[1] > H - safeBottom - 42 || b0[0] < 20 || b0[0] > W - 20) return;
        L(P(x, y, 0), P(x, y, 9 * sc), "f");
        ([[9, 14], [20, 11], [31, 8]] as const).forEach(([z, r]) => {
            const zz = z * sc, rr = r * sc, apex = P(x, y, zz + 15 * sc);
            const l = P(x - rr, y, zz), fr = P(x, y + rr, zz), rt = P(x + rr, y, zz), bk = P(x, y - rr, zz);
            g.f.push(`M${pt(l)}L${pt(fr)}L${pt(rt)}`);
            L(l, apex, "f"); L(fr, apex, "f"); L(rt, apex, "f"); L(bk, apex, "f");
        });
    }

    // ---- house with a gable roof; returns the two service-mast attachment points ----
    function house(bx: number, by: number, facing: -1 | 1): Pt[] {
        const hx = 34, hy = 26, h = 30;
        box(bx, by, 0, hx, hy, h);
        const r1 = P(bx - hx, by, h + 16), r2 = P(bx + hx, by, h + 16);
        L(r1, r2);
        ([-1, 1] as const).forEach((j) => { L(r1, P(bx - hx, by + j * hy, h)); L(r2, P(bx + hx, by + j * hy, h)); });
        poly([P(bx - 6, by + hy, 0), P(bx + 6, by + hy, 0), P(bx + 6, by + hy, 20), P(bx - 6, by + hy, 20)], "t");
        poly([P(bx + hx, by - 8, 12), P(bx + hx, by + 8, 12), P(bx + hx, by + 8, 24), P(bx + hx, by - 8, 24)], "t");
        const mx = facing < 0 ? bx - hx : bx + hx;
        L(P(mx, by, h + 16), P(mx, by, h + 30));
        return [-3, 3].map((o) => { const p = P(mx, by + o, h + 30); dot(p); return p; });
    }

    // ================= SCENE =================
    const yx = -Ls; // yard centre x (y = 0)

    // fenced yard (gate gap on the +y side)
    const fx0 = yx - 115, fx1 = yx + 115, fy0 = -95, fy1 = 95;
    const fence = (ax: number, ay: number, bx: number, by: number, gap?: [number, number]) => {
        const n = Math.round(Math.hypot(bx - ax, by - ay) / 20);
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            if (gap && t > gap[0] && t < gap[1]) continue;
            const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            L(P(x, y, 0), P(x, y, 14), "t");
        }
        [5, 14].forEach((z) => {
            if (gap) {
                L(P(ax, ay, z), P(ax + (bx - ax) * gap[0], ay + (by - ay) * gap[0], z), "t");
                L(P(ax + (bx - ax) * gap[1], ay + (by - ay) * gap[1], z), P(bx, by, z), "t");
            } else L(P(ax, ay, z), P(bx, by, z), "t");
        });
    };
    fence(fx0, fy0, fx1, fy0); fence(fx1, fy0, fx1, fy1); fence(fx1, fy1, fx0, fy1, [0.38, 0.62]); fence(fx0, fy1, fx0, fy0);

    // gantries (west = 33 kV in, east = 11 kV out)
    const gantry = (gx: number, beamZ: number): Pt[] => {
        [-34, 34].forEach((y) => {
            L(P(gx, y, 0), P(gx, y, beamZ)); L(P(gx + 5, y, 0), P(gx + 5, y, beamZ), "t");
            for (let z = 0; z < beamZ - 20; z += 20) { L(P(gx, y, z), P(gx + 5, y, z + 20), "t"); L(P(gx + 5, y, z), P(gx, y, z + 20), "t"); }
        });
        L(P(gx, -34, beamZ), P(gx, 34, beamZ)); L(P(gx + 5, -34, beamZ), P(gx + 5, 34, beamZ), "t");
        return [-22, 0, 22].map((y) => { L(P(gx, y, beamZ), P(gx, y, beamZ - 10)); dot(P(gx, y, beamZ - 10)); return P(gx, y, beamZ - 10); });
    };
    const gW = gantry(yx - 84, 100);
    const gE = gantry(yx + 84, 92);

    // isolator posts + one transformer (HV bushings west, LV bushings east)
    [-22, 0, 22].forEach((y) => { L(P(yx - 54, y, 0), P(yx - 54, y, 24)); dot(P(yx - 54, y, 24)); });
    box(yx - 4, 0, 0, 22, 30, 32);
    for (let y = -22; y <= 22; y += 5.5) L(P(yx + 18, y, 3), P(yx + 18, y, 28), "t");
    box(yx - 4, 0, 32, 6, 24, 8, "t");
    const hvB = [-16, 0, 16].map((y) => { L(P(yx - 14, y, 40), P(yx - 14, y, 58)); dot(P(yx - 14, y, 58)); return P(yx - 14, y, 58); });
    const lvB = [-16, 0, 16].map((y) => { L(P(yx + 10, y, 40), P(yx + 10, y, 52)); dot(P(yx + 10, y, 52)); return P(yx + 10, y, 52); });
    gW.forEach((a, k) => wire(a, hvB[k]));
    lvB.forEach((a, k) => wire(a, gE[k]));

    // control house
    box(yx + 50, -60, 0, 26, 18, 34);
    poly([P(yx + 76, -66, 0), P(yx + 76, -54, 0), P(yx + 76, -54, 22), P(yx + 76, -66, 22)], "t");
    for (let x = -14; x <= 14; x += 7) L(P(yx + 50 + x, -42, 6), P(yx + 50 + x, -42, 26), "t");

    // L1: incoming 33 kV towers (heading +x), ending at the west gantry
    const l1 = Array.from({ length: 6 }, (_, k) => tower(yx - 115 - 140 - 230 * k, 0));
    l1.forEach((at, i) => { if (i) at.forEach((_, k) => wire(l1[i][k], l1[i - 1][k])); });
    l1[0].forEach((p, k) => wire(p, gW[k]));

    // 11 kV feeder poles along the left arm
    const px0 = yx + 115 + 110, pxe = -150;
    const nFeed = Math.max(1, Math.round((pxe - px0) / 150));
    let prev: Pt[] = gE;
    for (let i = 0; i <= nFeed; i++) {
        const x = px0 + ((pxe - px0) * i) / nFeed;
        const pins = pole(x, 0, poleH, "y", [-18, 0, 18], 66);
        pins.forEach((p, k) => wire(prev[k], p));
        prev = pins;
    }

    // vertex: DTR pole (11 kV dead-end, transformer, lower LT crossarm)
    L(P(0, 0, 0), P(0, 0, 82)); ground(0, 0, 7);
    L(P(0, -22, 74), P(0, 22, 74));
    const dtrPins = [-18, 0, 18].map((y) => { L(P(0, y, 74), P(0, y, 80)); dot(P(0, y, 80)); return P(0, y, 80); });
    dtrPins.forEach((p, k) => wire(prev[k], p));
    box(12, 0, 34, 10, 12, 26);
    [-18, 0, 18].forEach((y, k) => L(dtrPins[k], P(0, y, 62), "t"));
    L(P(-24, 0, 44), P(24, 0, 44));
    prev = [-18, -6, 6, 18].map((l) => { L(P(l, 0, 44), P(l, 0, 49)); dot(P(l, 0, 49)); return P(l, 0, 49); });

    // LT poles along the right arm (heading -y), crossarm along x
    const nLT = Math.max(2, Math.round((Lr - 160) / 150));
    const ltY = Array.from({ length: nLT }, (_, i) => -(160 + ((Lr - 220) * i) / Math.max(1, nLT - 1)));
    let lastPins = prev;
    let lastY = 0;
    ltY.forEach((y) => {
        L(P(0, y, 0), P(0, y, 66)); ground(0, y, 6); L(P(-22, y, 58), P(22, y, 58));
        const pins = [-18, -6, 6, 18].map((l) => { L(P(l, y, 58), P(l, y, 63)); dot(P(l, y, 63)); return P(l, y, 63); });
        pins.forEach((p, k) => wire(lastPins[k], p));
        lastPins = pins; lastY = y;
    });

    // houses on either side, beyond the last pole (so service drops never cross the LT span)
    const hl = house(-115, lastY - 20, +1);
    const hr = house(115, lastY - 20, -1);
    hl.forEach((_, k) => wire(lastPins[1 - k], hl[k]));   // near pin -> inner target (no crossing)
    hr.forEach((_, k) => wire(lastPins[2 + k], hr[k]));

    // kiosk
    box(130, lastY + 150, 0, 12, 10, 24);
    poly([P(142, lastY + 144, 0), P(142, lastY + 156, 0), P(142, lastY + 156, 16), P(142, lastY + 144, 16)], "t");

    // L4: independent 33 kV corridor beyond the right arm (heading +x)
    const Yr = Lr + 260;
    const l4 = Array.from({ length: 8 }, (_, k) => tower(-860 + 240 * k, -Yr));
    l4.forEach((at, i) => { if (i) at.forEach((p, k) => wire(l4[i - 1][k], p)); });

    // trees
    ([[yx - 150, 120, 1.1], [yx - 118, 150, 1.2], [yx - 70, 150, 0.9], [yx + 130, 130, 1.0], [yx + 150, 100, 0.9],
    [yx - 160, -120, 1.0], [160, lastY + 130, 1.1], [200, lastY + 200, 1.2], [-30, lastY - 140, 1.0],
    [-170, lastY - 150, 1.1], [60, 150, 0.9], [-60, 120, 1.0], [250, lastY + 90, 1.0]] as Array<[number, number, number]>)
        .forEach(([x, y, sc]) => tree(x, y, sc));

    // ---- ground grid ----
    const grid: string[] = [];
    for (let i = -3000; i <= 3000; i += 46) {
        grid.push(`M${pt(P(i, -3000))}L${pt(P(i, 3000))}`);
        grid.push(`M${pt(P(-3000, i))}L${pt(P(3000, i))}`);
    }

    const stats = checkWires(wires, card);
    return {
        scale: s,
        paths: { s: g.s.join(""), t: g.t.join(""), f: g.f.join("") },
        grid: grid.join(""),
        wirePath: wires.map((w) => `M${pt(w.a)}Q${pt(w.m)} ${pt(w.b)}`).join(""),
        wires,
        dots,
        width: W,
        fadeCenter: [cx, H * 0.55],
        fadeRadius: Math.max(W, H) * 0.75,
        stats: { scale: +s.toFixed(2), wires: wires.length, crossings: stats.crossings, wiresBehindCard: stats.behindCard },
    };
}

/** point on a wire's quadratic curve, t in [0,1] */
export function wireAt(w: Wire, t: number): Pt {
    const u = 1 - t;
    return [u * u * w.a[0] + 2 * u * t * w.m[0] + t * t * w.b[0], u * u * w.a[1] + 2 * u * t * w.m[1] + t * t * w.b[1]];
}

function segCross(p: Pt, q: Pt, r: Pt, t: Pt): boolean {
    const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
    if (Math.abs(d) < 1e-9) return false;
    const a = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d;
    const b = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return a > 0.02 && a < 0.98 && b > 0.02 && b < 0.98;
}

/** Counts wire pairs whose projected curves intersect (interior crossings only). */
export function checkWires(wires: Wire[], card: Rect): { crossings: number; behindCard: number } {
    const N = 24;
    const pts = wires.map((w) => Array.from({ length: N + 1 }, (_, i) => wireAt(w, i / N)));
    let crossings = 0;
    for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
            let hit = false;
            for (let a = 0; a < N && !hit; a++) for (let b = 0; b < N && !hit; b++) if (segCross(pts[i][a], pts[i][a + 1], pts[j][b], pts[j][b + 1])) hit = true;
            if (hit) crossings++;
        }
    }
    const behindCard = pts.reduce((n, p) => n + p.filter((q) => q[0] > card.x0 && q[0] < card.x1 && q[1] > card.y0 && q[1] < card.y1).length, 0);
    return { crossings, behindCard };
}