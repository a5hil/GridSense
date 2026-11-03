# HairlineTransmissionGrid, round 2

The snippets are **not compiled** against your repo; adjust names as needed. The layout numbers come from re-implementing your `project()` and `fitView()` (my model reproduced your screenshot positions: S1 base at (1551, 834), B1 at (1745, 1215)). **I assumed the card is 560 px wide and about 522 px tall, centred.** Check the real size.

---

## 1. Layout: the card hides parts of the scene

| Viewport | What the card (assumed 560×522, centred) touches |
|---|---|
| 2560×1330 (your screenshot) | S1 (substation) |
| 1920×1080 | S1 |
| 1440×900 | T1, T3, S1 |
| 1280×720 | T0, T1, T3, S1, P1, P2, P3, B1 (nearly everything) |

The leftmost structure sits at about 30–33% of the viewport width at every size, so the left third is empty.

### 1a. Move the distribution cluster clear of the card

At 2560×1330 shifting S1, P1, P2, P3 and B1 by `(+120, −120)` in world units moves them about 230 px right without changing their height on screen:

```ts
// S1 340,200 → 460,80   P1 520,140 → 640,20   P2 640,220 → 760,100
// P3 720,340 → 840,220  B1 780,440 → 900,320
```

`fitView()` re-centres the bigger bounding box automatically. After any move, re-run an overlap check in development:

```ts
if (process.env.NODE_ENV !== "production") {
  const card = document.getElementById("login-card")?.getBoundingClientRect();
  const host = canvas.getBoundingClientRect();
  if (card) for (const n of towerNodes) {
    const b = project(n.baseX, n.baseY, 0, originX, originY, scale);
    const t = project(n.baseX, n.baseY, TOP_Z[n.type], originX, originY, scale);
    const x0 = Math.min(b.x, t.x) + host.left, x1 = Math.max(b.x, t.x) + host.left;
    const y0 = Math.min(b.y, t.y) + host.top,  y1 = Math.max(b.y, t.y) + host.top;
    if (x1 > card.left - 16 && x0 < card.right + 16 && y1 > card.top - 16 && y0 < card.bottom + 16)
      console.warn(`[hairline] ${n.id} overlaps the login card at ${width}x${height}`);
  }
}
```

### 1b. Small and medium screens

Below about 1500 px wide the 560 px card covers too much. Pick one of:
- Raise the hide breakpoint from 900 px to about 1280 px.
- Use a two-column layout between 900 and 1500 px: card in the left third, artwork in the right two-thirds, with `fitView()` given `safe.left` = card width + 48.

### 1c. Fill the empty left third

Bring the incoming HV line in from the left edge (see 2a). It fills the left third without adding new structures.

---

## 2. Bugs in the new code

### 2a. The incoming line is a fan, not parallel conductors

Three straight lines start at one off-screen point, so they converge and have no sag. Replace the fan with a virtual source node whose attachments are T0's, translated back along the line direction. The span then reuses the same sag drawing as every other span.

```ts
// scene graph: add { id: "SRC", type: "hv-tower", conductorAttachments: [] } (never drawn)
// spans: ...create3PhaseCircuit("SRC", "T0", 20, 0.0022)

// in render(), after drawing structures, before the spans loop
const t0 = towerNodes.find((n) => n.id === "T0")!;
const src = towerNodes.find((n) => n.id === "SRC")!;
const d = t0.lineDir!;                                   // world direction at T0 (towards T1)
const back = 520;                                        // world units; leaves the screen
const a = project(t0.baseX, t0.baseY, 0, originX, originY, scale);
const b = project(t0.baseX - d.x * back, t0.baseY - d.y * back, 0, originX, originY, scale);
src.conductorAttachments = t0.conductorAttachments.map((p) => ({ x: p.x + (b.x - a.x), y: p.y + (b.y - a.y) }));
```

Fade the far end with a gradient stroke (`createLinearGradient` from transparent at the start of the span). Remove `offscreenIncomerSource` from `fitView()`; in my model it changed the scale by less than 0.01.

### 2b. Reduced motion: canvas goes blank on resize

Setting `canvas.width/height` clears the canvas. In reduced-motion mode no frame is drawn afterwards.

```ts
const resizeObserver = new ResizeObserver(() => {
  updateDimensions();
  if (prefersReducedMotion) requestAnimationFrame(render);   // one redraw, loop stops itself
});
// also react to the OS setting changing:
const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
mq.addEventListener("change", () => location.reload());     // or restart the loop
```

### 2c. `window.addEventListener("pointerleave")` never fires

`pointerleave` does not bubble and the window does not receive it, so `pointer.active` stays true and the crosshair and tethers freeze at the last position.

```ts
const leave = () => { pointer.active = false; };
document.documentElement.addEventListener("pointerleave", leave);
window.addEventListener("blur", leave);
// cleanup: remove both
```

### 2d. The loop keeps running when the canvas is hidden

Under 900 px the container is `display: none`, but the effect still draws at 40 fps to an invisible canvas (battery cost on phones). Start and stop the loop with the breakpoint, or don't mount the component at all.

```ts
const mq = window.matchMedia("(min-width: 900px)");
let running = false;
const start = () => { if (running) return; running = true; lastTime = performance.now(); animationFrameId = requestAnimationFrame(render); };
const stop  = () => { running = false; cancelAnimationFrame(animationFrameId); };
const sync  = () => (mq.matches ? start() : stop());
mq.addEventListener("change", sync); sync();
// in render(): if (!running) return;  and schedule the next frame only while running
```

### 2e. Grid ends are visible

The ground grid uses a fixed `gridExtent = 880`, so on large screens its diamond boundary is visible (lines end at straight diagonal edges, bottom right and top right in your screenshots). It is cached, so size it to the viewport:

```ts
const gridExtent = Math.ceil((width + height) / scale / gridSize) * gridSize;
```

### 2f. `fitView()` runs every frame

Move it into `updateDimensions()` and store `{ scale, originX, originY }` in a variable. It depends only on width and height.

### 2g. Theme dependency still rebuilds the scene

You added `themeRef`, so remove `theme` from the effect dependencies (`[theme]` → `[]`). Otherwise toggling the theme still tears the scene down and resets pulses. Also, `isDark` is `theme === "dark" || html.classList.contains("dark")`, so a stale class can override the theme state. Use one source of truth.

---

## 3. Scene accuracy

### 3a. Substation LV bushings are on the wrong face

HV bushings are on the −y face (facing T2: correct). LV bushings are on the +y face, but P1 is at (+180, −60) from S1, so the LV wires leave from the south face and cross over the tank to reach the east. Put them on the +x face and move the radiator ribs to the −x or +y face:

```ts
// LV bushings: +x face
const lvBushings = [-12, 0, 12].map((off) =>
  project(bx + hw - 6, by + off, bz + th + 16, originX, originY, scale));
// stems: base at project(bx + hw - 6, by + off, bz + th, ...)
```

### 3b. Voltage class names

Names in the scene graph (`TWR-400A`, `TWR-400B`, `TWR-400C`, `TWR-220A`) feed a 33/11 kV substation, and the app header says "ANGAMALY 33/11kV PRIMARY SUBSTATION". A 220 kV tower feeding a 33/11 kV transformer is inconsistent (it would normally feed a 220/110 kV or 220/33 kV substation first). They're not rendered, but a reviewer reading the code will notice. Rename them `TWR-33A…` and update the comments ("HV corridor" → "33 kV sub-transmission").

### 3c. Tower phase layout is asymmetric

The upper arm has both ends drawn, but the top phase attaches only at the right end (`armRight2`). Use the upper-centre (`armCenter2`) for phase 2 so the three phases form a symmetric delta:

```ts
const insTop2: Point2D = { x: armCenter2.x, y: armCenter2.y + 10 * scale };
// …and draw the insulator from armCenter2, not armRight2
```

### 3d. Minor

- The service drop from P3 to B1 uses 3 conductors that all end on one weatherhead point. A drop is usually 2 conductors (single phase) or 4 (three phase). Use 2 and offset their endpoints by a few px.
- The theme toggle shows the label of the *other* mode ("DAY LIGHT" in dark mode, "SCADA DARK" in light mode). Add an `aria-pressed` state and a clearer label.

---

## 4. Page items still open from earlier

These are in the page, not the illustration, and are visible in your screenshots:
- **"Quick Demo Modes: Fill operator credentials"** is still there. Remove it from production builds (build-time flag plus a visible DEMO banner when on).
- **Footer "PROTOCOL IEEE C37.118 / IEC 61850"** does not match your gateway (custom JSON, IEC 104-style data model). Remove or correct.
- **"Logged to the SOE ledger"** implies tamper-evident storage. Use "audit log" until the SOE is persisted.
- **"ZULU / GMT"** clock: the console uses IST. Show IST first.
- **Labels:** "OPERATOR ID / USERNAME" and "KEYPHRASE / PASSWORD" — pick one term for each.
- **Missing states:** error, loading, locked, verification-code step.

---

## 5. Prompt for Antigravity

> Round 2 changes to `HairlineTransmissionGrid`:
> 1. Replace the fanned incoming conductors with a virtual `SRC` node and a regular 3-phase span into T0, so the three wires run parallel from the left edge with sag and a fade at the far end. Remove `offscreenIncomerSource` from `fitView()`.
> 2. Move the distribution cluster (S1, P1, P2, P3, B1) by (+120, −120) world units so the substation clears the login card. Add the dev-only overlap check against `#login-card` and warn on overlaps.
> 3. Put the substation LV bushings on the +x face (facing P1) and the radiator ribs on the −x face. Use the upper-centre point for the third tower phase.
> 4. Fix the listeners: replace `window` `pointerleave` with `document.documentElement` `pointerleave` plus `blur`. Redraw once after resize in reduced-motion mode. Start and stop the animation loop with the `min-width: 900px` media query. Remove `theme` from the effect dependencies.
> 5. Size `gridExtent` from the viewport. Compute `fitView()` once per resize.
> 6. Rename the corridor to 33 kV (`TWR-33A…`) and update comments.
> 7. Below about 1500 px wide, switch to a two-column layout (card left, artwork right) or hide the artwork. Pass `safe.left` = card width + 48 to `fitView()`.
