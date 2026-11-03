/**
 * Canvas drawing for the hairline scene. No React, no DOM lookups except readPalette().
 * renderStatic(): grid + structures + wires + insulator dots (draw once per layout/theme).
 * drawPulses():   slow green flow beads along the wires (draw every frame, skip if reduced motion).
 */
import { Scene, wireAt } from "./hairline-scene";

export interface Palette {
    ink: string;    // primary structure
    ink2: string;   // secondary / hidden edges / fence / ground marks
    leaf: string;   // trees
    wire: string;   // conductors
    accent: string; // insulator dots
    pulse: string;  // flow beads
    grid: string;   // ground grid
}

export const PALETTES: Record<"light" | "dark", Palette> = {
    light: { ink: "#1e293b", ink2: "#64748b", leaf: "#059669", wire: "#475569", accent: "#059669", pulse: "#059669", grid: "rgba(148,163,184,0.38)" },
    dark: { ink: "#f1f5f9", ink2: "#94a3b8", leaf: "#34d399", wire: "#94a3b8", accent: "#34d399", pulse: "#34d399", grid: "rgba(148,163,184,0.15)" },
};

/** Defaults per theme, overridable with CSS variables: --gs-ink, --gs-ink2, --gs-leaf, --gs-wire, --gs-accent, --gs-pulse, --gs-grid */
export function readPalette(el: Element, dark: boolean): Palette {
    const base = PALETTES[dark ? "dark" : "light"];
    const cs = getComputedStyle(el);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
        ink: v("--gs-ink", base.ink), ink2: v("--gs-ink2", base.ink2), leaf: v("--gs-leaf", base.leaf), wire: v("--gs-wire", base.wire),
        accent: v("--gs-accent", base.accent), pulse: v("--gs-pulse", base.accent), grid: v("--gs-grid", base.grid),
    };
}

/** Fraction of the scene kept at horizontal position x: fades to 0 over `edge` px at both sides. */
export function edgeFade(x: number, W: number, edge = Math.min(120, W * 0.06)): number {
    return Math.max(0, Math.min(1, x / edge, (W - x) / edge));
}

/** ctx must already be scaled by devicePixelRatio and cleared; W/H are CSS px. */
export function renderStatic(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette, W: number, H: number) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // ground grid, then fade it toward the edges (only the grid is masked)
    ctx.strokeStyle = pal.grid;
    ctx.stroke(new Path2D(scene.grid));
    const [fx, fy] = scene.fadeCenter;
    const grad = ctx.createRadialGradient(fx, fy, scene.fadeRadius * 0.5, fx, fy, scene.fadeRadius);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    ctx.strokeStyle = pal.leaf;
    ctx.stroke(new Path2D(scene.paths.f));
    ctx.strokeStyle = pal.ink2;
    ctx.stroke(new Path2D(scene.paths.t));
    ctx.strokeStyle = pal.ink;
    ctx.stroke(new Path2D(scene.paths.s));
    ctx.strokeStyle = pal.wire;
    ctx.stroke(new Path2D(scene.wirePath));

    ctx.fillStyle = pal.accent;
    const r = 1.7 * Math.min(1, scene.scale + 0.2);
    ctx.beginPath();
    for (const [x, y] of scene.dots) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fill();

    // dissolve towers/wires toward the left and right screen edges (no abrupt cut-offs)
    const e = Math.min(120, W * 0.06);
    const hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, "rgba(0,0,0,0)");
    hg.addColorStop(e / W, "rgba(0,0,0,1)");
    hg.addColorStop(1 - e / W, "rgba(0,0,0,1)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
}

/** Slow flow: each wire carries one bead, 10-14 s end to end, fading in and out at the ends. */
export function drawPulses(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette, seconds: number) {
    ctx.save();
    ctx.strokeStyle = pal.pulse;
    ctx.fillStyle = pal.pulse;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    scene.wires.forEach((w, i) => {
        if (w.len < 40) return;
        const period = 10 + ((i * 37) % 5);                  // 10..14 s
        const t = (seconds / period + ((i * 0.173) % 1)) % 1;
        const head = wireAt(w, t);
        const tail = wireAt(w, Math.max(0, t - 0.05));
        const alpha = Math.sin(Math.PI * t) * 0.9 * edgeFade(head[0], scene.width);
        if (alpha < 0.02) return;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(tail[0], tail[1]);
        ctx.lineTo(head[0], head[1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(head[0], head[1], 1.8, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}