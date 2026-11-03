"use client";

import React, { useEffect, useRef, useState } from "react";
import { buildScene, type Rect, type Scene } from "./hairline-scene";
import { drawPulses, readPalette, renderStatic, type Palette } from "./hairline-draw";

export interface HairlineProps {
  /** CSS selector of the login card; the scene is laid out around it. Add id="login-card" to the card. */
  cardSelector?: string;
  /** Force light/dark. If omitted, the <html class="dark"> state is used and watched. */
  dark?: boolean;
  /** Header height + gap (px). Towers whose top would sit under the header are not drawn. */
  safeTop?: number;
  /** Footer height + gap (px). */
  safeBottom?: number;
  /** The illustration is only mounted at or above this viewport size. */
  minWidth?: number;
  minHeight?: number;
}

const FALLBACK_CARD = { w: 560, h: 522 };
const FRAME_MS = 1000 / 30; // pulses are slow; 30 fps is plenty

export function HairlineTransmissionGrid({
  cardSelector = "#login-card",
  dark,
  safeTop = 112,
  safeBottom = 58,
  minWidth = 1300,
  minHeight = 760,
}: HairlineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  // Mount only on large viewports (no canvas, no loop on small screens).
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px) and (min-height: ${minHeight}px)`);
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [minWidth, minHeight]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scene: Scene | null = null;
    let pal: Palette = readPalette(container, false);
    let layer: HTMLCanvasElement | null = null;
    let W = 0, H = 0, dpr = 1;
    let raf = 0, running = false, last = 0;
    const t0 = performance.now();
    let lastCard = { w: 0, h: 0 };

    const isDark = () => dark ?? document.documentElement.classList.contains("dark");

    const draw = (seconds: number) => {
      if (!scene || !layer) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(layer, 0, 0, W, H);
      if (!motion.matches) drawPulses(ctx, scene, pal, seconds);
    };

    /** Redraw the static layer (grid, structures, wires). Cheap: called on layout and theme change only. */
    const paintStatic = () => {
      if (!scene) return;
      pal = readPalette(container, isDark());
      layer = document.createElement("canvas");
      layer.width = Math.floor(W * dpr);
      layer.height = Math.floor(H * dpr);
      const lctx = layer.getContext("2d");
      if (!lctx) return;
      lctx.scale(dpr, dpr);
      renderStatic(lctx, scene, pal, W, H);
      draw((performance.now() - t0) / 1000);
    };

    const layout = () => {
      const rect = container.getBoundingClientRect();
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      if (W < 10 || H < 10) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;

      const cardEl = document.querySelector(cardSelector);
      let card: Rect;
      if (cardEl) {
        const c = cardEl.getBoundingClientRect();
        card = { x0: c.left - rect.left, y0: c.top - rect.top, x1: c.right - rect.left, y1: c.bottom - rect.top };
      } else {
        const x0 = (W - FALLBACK_CARD.w) / 2, y0 = (H - FALLBACK_CARD.h) / 2 + 10;
        card = { x0, y0, x1: x0 + FALLBACK_CARD.w, y1: y0 + FALLBACK_CARD.h };
      }
      lastCard = { w: card.x1 - card.x0, h: card.y1 - card.y0 };
      scene = buildScene({ W, H, card, safeTop, safeBottom });

      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production" && scene.stats.crossings > 0) {
        console.warn(`[hairline] ${scene.stats.crossings} wire crossing(s) at ${W}x${H}`);
      }
      paintStatic();
    };

    const tick = (now: number) => {
      if (!running) return;
      if (now - last >= FRAME_MS) { last = now; draw((now - t0) / 1000); }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || motion.matches || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotion = () => { stop(); draw((performance.now() - t0) / 1000); start(); };

    layout();
    start();

    const ro = new ResizeObserver(layout);
    ro.observe(container);
    // Re-layout if the card changes size meaningfully (e.g. an error banner); ignore small shifts.
    const cardEl = document.querySelector(cardSelector);
    const cardRo = cardEl
      ? new ResizeObserver(() => {
        const c = cardEl.getBoundingClientRect();
        if (Math.abs(c.width - lastCard.w) > 40 || Math.abs(c.height - lastCard.h) > 40) layout();
      })
      : null;
    cardRo?.observe(cardEl as Element);
    const mo = new MutationObserver(paintStatic);
    if (dark === undefined) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);

    return () => {
      stop();
      ro.disconnect();
      cardRo?.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
    };
  }, [enabled, cardSelector, dark, safeTop, safeBottom]);

  if (!enabled) return null;

  const mask = "linear-gradient(to bottom, transparent 0, #000 72px, #000 calc(100% - 40px), transparent 100%)";
  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default HairlineTransmissionGrid;