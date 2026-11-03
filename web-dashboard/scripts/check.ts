import { createCanvas, Path2D } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { buildScene } from "../src/components/scada/hairline-scene";
import { PALETTES, drawPulses, renderStatic } from "../src/components/scada/hairline-draw";
(globalThis as any).Path2D = Path2D;

const sizes: Array<[number, number]> = [
  [2560, 1330],
  [2560, 1440],
  [2048, 1152],
  [2048, 1008],
  [1920, 1080],
  [1680, 1050],
  [1600, 900],
  [1536, 864],
  [1440, 900],
  [1366, 768],
  [1300, 760],
];

let bad = 0;
for (const [W, H] of sizes) {
  const x0 = (W - 560) / 2;
  const y0 = (H - 522) / 2 + 10;
  const sc = buildScene({ W, H, card: { x0, y0, x1: x0 + 560, y1: y0 + 522 } });
  const ok = sc.stats.crossings === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? "OK " : "BAD"} ${W}x${H} scale=${sc.stats.scale} wires=${sc.stats.wires} crossings=${sc.stats.crossings} wiresBehindCard=${sc.stats.wiresBehindCard}`
  );
}
console.log(bad ? `FAILED: ${bad} size(s) with crossings` : "all sizes: 0 crossings");

// render the real draw code to PNG (with placeholder header/card/footer), pulses frozen at t = 5 s
function render(name: string, W: number, H: number, theme: "light" | "dark", customCard?: { x0: number; y0: number; x1: number; y1: number }) {
  const pal = PALETTES[theme];
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d") as any;
  ctx.fillStyle = theme === "light" ? "#f8fafc" : "#050608";
  ctx.fillRect(0, 0, W, H);
  const card = customCard ?? {
    x0: (W - 560) / 2,
    y0: (H - 522) / 2 + 10,
    x1: (W - 560) / 2 + 560,
    y1: (H - 522) / 2 + 10 + 522,
  };
  const sc = buildScene({ W, H, card });
  console.log(`Render ${name}: scale=${sc.stats.scale}, wires=${sc.stats.wires}, crossings=${sc.stats.crossings}, wiresBehindCard=${sc.stats.wiresBehindCard}`);

  // static layer on its own canvas, exactly like the component
  const layer = createCanvas(W, H);
  const lctx = layer.getContext("2d") as any;
  renderStatic(lctx, sc, pal, W, H);
  ctx.drawImage(layer, 0, 0);
  drawPulses(ctx, sc, pal, 5);

  const panel = theme === "light" ? "#ffffff" : "#0b0d10";
  ctx.fillStyle = panel;
  ctx.strokeStyle = "rgba(148,163,184,.5)";
  ctx.fillRect(20, 20, W - 40, 83);
  ctx.strokeRect(20, 20, W - 40, 83);
  ctx.fillRect(card.x0, card.y0, card.x1 - card.x0, card.y1 - card.y0);
  ctx.strokeRect(card.x0, card.y0, card.x1 - card.x0, card.y1 - card.y0);
  ctx.fillStyle = "rgba(148,163,184,.35)";
  ctx.fillRect(W / 2 - 320, H - 48, 640, 14);
  writeFileSync(name, cv.toBuffer("image/png"));
}

render("render-light-2560.png", 2560, 1330, "light");
render("render-dark-2560.png", 2560, 1330, "dark");
render("render-user-current.png", 2048, 1152, "light", { x0: 800, y0: 384.76, x1: 1248, y1: 803.42 });


