"use client";

import React, { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme-context";

interface Point2D {
  x: number;
  y: number;
}

interface Node3D {
  id: string;
  type: "hv-tower" | "substation" | "feeder-pole" | "dtr-pole" | "lt-pole" | "building";
  name: string;
  baseX: number;
  baseY: number;
  lineDir?: { x: number; y: number };
  peakPos?: Point2D;
  conductorAttachments: Point2D[];
  lvAttachments?: Point2D[];
}

interface CatenarySpan {
  fromNodeId: string;
  fromAttachIdx: number;
  toNodeId: string;
  toAttachIdx: number;
  sag: number;
  pulseProgress1: number;
  pulseProgress2: number;
  pulseSpeed: number;
  useLvSource?: boolean;
}

interface Safe {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const TOP_Z: Record<string, number> = {
  "hv-tower": 165,
  substation: 68,
  "feeder-pole": 82,
  "dtr-pole": 85,
  "lt-pole": 72,
  building: 42,
};

// Isometric projection constants (30-degree isometric)
const COS30 = 0.8660254;
const SIN30 = 0.5;

function project(
  wx: number,
  wy: number,
  wz: number,
  originX: number,
  originY: number,
  scale: number
): Point2D {
  return {
    x: originX + (wx - wy) * COS30 * scale,
    y: originY + (wx + wy) * SIN30 * scale - wz * scale,
  };
}

function lineDir(
  prev: Node3D | null,
  self: Node3D,
  next: Node3D | null
): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  if (!prev && next) {
    dx = next.baseX - self.baseX;
    dy = next.baseY - self.baseY;
  } else if (prev && !next) {
    dx = self.baseX - prev.baseX;
    dy = self.baseY - prev.baseY;
  } else if (prev && next) {
    dx = next.baseX - prev.baseX;
    dy = next.baseY - prev.baseY;
  }
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}

const perp = (d: { x: number; y: number }) => ({ x: -d.y, y: d.x });

export function HairlineTransmissionGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Check for user preference for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Cached projection state computed once per resize
    let currentScale = 1;
    let currentOriginX = 0;
    let currentOriginY = 0;

    // Offscreen canvas caching for ground grid & axes
    let offscreenCanvas: HTMLCanvasElement | null = null;
    let offscreenCtx: CanvasRenderingContext2D | null = null;
    let cachedTheme = "";

    // Pointer state for interactive tethering & telemetry crosshair
    const pointer = {
      x: -9999,
      y: -9999,
      active: false,
      targetX: -9999,
      targetY: -9999,
    };

    // =========================================================================
    // 1. SCADA-ALIGNED DISTRIBUTION & SUB-TRANSMISSION SCENE GRAPH (Round 2)
    // 33 kV sub-transmission corridor (TWR-33A -> TWR-33B -> TWR-33C -> TWR-33D)
    // -> Primary 33/11kV Substation S1 (distinct HV -y face and LV +x face)
    // -> 11kV Feeder Pole P1
    // -> 11kV/415V Pole-Mounted Distribution Transformer (DTR) P2 in true 3D
    // -> LT 4-Wire Distribution Pole P3
    // -> Consumer Service Drop B1
    //
    // Distribution cluster (S1, P1, P2, P3, B1) moved (+120, -120) world units
    // to clear the central/left login authentication card.
    // =========================================================================

    const towerNodes: Node3D[] = [
      // Virtual offscreen grid interconnect source node (never drawn directly)
      {
        id: "SRC",
        type: "hv-tower",
        name: "GRID-INTERCONNECT (Virtual)",
        baseX: -980,
        baseY: 120,
        conductorAttachments: [],
      },
      // 0. Far-West 33kV Incomer Dead-End Tower
      {
        id: "T0",
        type: "hv-tower",
        name: "TWR-33A (Incomer)",
        baseX: -460,
        baseY: 120,
        conductorAttachments: [],
      },
      // 1. West Intermediate 33kV Transmission Tower
      {
        id: "T1",
        type: "hv-tower",
        name: "TWR-33B",
        baseX: -320,
        baseY: -60,
        conductorAttachments: [],
      },
      // 2. North Skyline Corner Tower (Apex skyline elevation)
      {
        id: "T3",
        type: "hv-tower",
        name: "TWR-33C (Skyline)",
        baseX: -40,
        baseY: -280,
        conductorAttachments: [],
      },
      // 3. East Terminal 33kV Transmission Tower (High-side substation feed)
      {
        id: "T2",
        type: "hv-tower",
        name: "TWR-33D (Substation Terminal)",
        baseX: 360,
        baseY: -80,
        conductorAttachments: [],
      },
      // 4. Primary 33/11kV Substation Transformer Bank & Switchyard (+120, -120 shift)
      {
        id: "S1",
        type: "substation",
        name: "SUB-01 (33/11kV Primary)",
        baseX: 460,
        baseY: 80,
        conductorAttachments: [],
        lvAttachments: [],
      },
      // 5. 11kV Outgoing Distribution Feeder Pole (+120, -120 shift)
      {
        id: "P1",
        type: "feeder-pole",
        name: "POL-11-01",
        baseX: 640,
        baseY: 20,
        conductorAttachments: [],
      },
      // 6. 11kV / 415V Pole-Mounted Distribution Transformer (DTR) (+120, -120 shift)
      {
        id: "P2",
        type: "dtr-pole",
        name: "DTR-11-02 (11kV/415V)",
        baseX: 760,
        baseY: 100,
        conductorAttachments: [],
        lvAttachments: [],
      },
      // 7. LT 415V Distribution Pole (3 phases + neutral) (+120, -120 shift)
      {
        id: "P3",
        type: "lt-pole",
        name: "POL-LT-03 (4-Wire)",
        baseX: 840,
        baseY: 220,
        conductorAttachments: [],
      },
      // 8. Consumer Service Point / Metering Terminal (+120, -120 shift)
      {
        id: "B1",
        type: "building",
        name: "SVC-TERM-04",
        baseX: 900,
        baseY: 320,
        conductorAttachments: [],
      },
    ];

    // Compute line direction vectors along corridors for perpendicular crossarms
    const hvCorridor = [towerNodes[1], towerNodes[2], towerNodes[3], towerNodes[4]];
    for (let i = 0; i < hvCorridor.length; i++) {
      const prev = i > 0 ? hvCorridor[i - 1] : null;
      const self = hvCorridor[i];
      const next = i < hvCorridor.length - 1 ? hvCorridor[i + 1] : towerNodes[5];
      self.lineDir = lineDir(prev, self, next);
    }

    const distCorridor = [towerNodes[5], towerNodes[6], towerNodes[7], towerNodes[8], towerNodes[9]];
    for (let i = 1; i < distCorridor.length; i++) {
      const prev = distCorridor[i - 1];
      const self = distCorridor[i];
      const next = i < distCorridor.length - 1 ? distCorridor[i + 1] : null;
      self.lineDir = lineDir(prev, self, next);
    }

    // =========================================================================
    // 2. 3-PHASE CONTINUOUS CIRCUITS (Phase 0, 1, 2 continuous across spans)
    // =========================================================================

    function create3PhaseCircuit(
      fromId: string,
      toId: string,
      sag: number,
      speed = 0.0022,
      useLvSource = false
    ): CatenarySpan[] {
      return [0, 1, 2].map((k) => ({
        fromNodeId: fromId,
        fromAttachIdx: k,
        toNodeId: toId,
        toAttachIdx: k,
        sag: sag + (k - 1) * 2.2,
        pulseProgress1: (0.15 + k * 0.31) % 1,
        pulseProgress2: (0.65 + k * 0.31) % 1,
        pulseSpeed: speed,
        useLvSource,
      }));
    }

    function createLTCircuit(
      fromId: string,
      toId: string,
      sag: number,
      speed = 0.0028
    ): CatenarySpan[] {
      // 4 conductors: 3 phases + neutral
      return [0, 1, 2, 3].map((k) => ({
        fromNodeId: fromId,
        fromAttachIdx: k,
        toNodeId: toId,
        toAttachIdx: k,
        sag: sag + (k - 1.5) * 1.5,
        pulseProgress1: (0.2 + k * 0.25) % 1,
        pulseProgress2: (0.7 + k * 0.25) % 1,
        pulseSpeed: speed,
        useLvSource: true,
      }));
    }

    function createServiceDropCircuit(
      fromId: string,
      toId: string,
      sag: number,
      speed = 0.0031
    ): CatenarySpan[] {
      // 2 conductors: 1-phase service drop
      return [0, 1].map((k) => ({
        fromNodeId: fromId,
        fromAttachIdx: k,
        toNodeId: toId,
        toAttachIdx: k,
        sag: sag + k * 1.5,
        pulseProgress1: (0.2 + k * 0.4) % 1,
        pulseProgress2: (0.7 + k * 0.4) % 1,
        pulseSpeed: speed,
      }));
    }

    const spans: CatenarySpan[] = [
      // Corridor 0: Regional Grid Inflow (SRC -> TWR-33A Incomer)
      ...create3PhaseCircuit("SRC", "T0", 20, 0.0022),
      // Corridor 1: Incomer T0 -> Tower T1 (3-Phase)
      ...create3PhaseCircuit("T0", "T1", 20, 0.0022),
      // Corridor 2: Tower T1 -> Corner Tower T3 (3-Phase)
      ...create3PhaseCircuit("T1", "T3", 22, 0.0021),
      // Corridor 3: Corner Tower T3 -> Terminal Tower T2 (3-Phase)
      ...create3PhaseCircuit("T3", "T2", 24, 0.0022),
      // Substation Incomer Drop: Tower T2 -> Substation S1 HV Bushings (3-Phase)
      ...create3PhaseCircuit("T2", "S1", 19, 0.0024),
      // Feeder Outgoing: Substation S1 LV Bushings -> Feeder Pole P1 (3-Phase 11kV)
      ...create3PhaseCircuit("S1", "P1", 17, 0.0026, true),
      // Feeder Span: Feeder Pole P1 -> DTR Pole P2 (3-Phase 11kV)
      ...create3PhaseCircuit("P1", "P2", 16, 0.0027),
      // Distribution LT Line: DTR Pole P2 LV -> LT Pole P3 (4-Wire: 3 Phases + Neutral)
      ...createLTCircuit("P2", "P3", 14, 0.0029),
      // Service Drop: LT Pole P3 -> Building B1 Terminal (2-Conductor Drop)
      ...createServiceDropCircuit("P3", "B1", 12, 0.0031),
    ];

    // =========================================================================
    // 3. SAFE-AREA BOUNDING BOX CALCULATION (fitView)
    // Guarantees zero clipping under header and off the bottom/sides
    // =========================================================================

    function fitView(
      w: number,
      h: number,
      safe: Safe = { top: 64, bottom: 40, left: 24, right: 24 },
      pad = 18,
      maxSag = 26
    ) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const n of towerNodes) {
        if (n.id === "SRC") continue; // Virtual node excluded from bounding box
        const topZ = TOP_Z[n.type] ?? 100;
        const dir = n.lineDir || { x: 1, y: 0 };
        const pp = perp(dir);
        const crossarmExtent = n.type === "hv-tower" ? 44 : 24;

        // Bounding checks for base, top peak, and crossarm tips
        const pointsToCheck = [
          project(n.baseX, n.baseY, 0, 0, 0, 1),
          project(n.baseX, n.baseY, topZ, 0, 0, 1),
          project(n.baseX - pp.x * crossarmExtent, n.baseY - pp.y * crossarmExtent, topZ - 20, 0, 0, 1),
          project(n.baseX + pp.x * crossarmExtent, n.baseY + pp.y * crossarmExtent, topZ - 20, 0, 0, 1),
        ];

        for (const p of pointsToCheck) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y + maxSag);
        }
      }

      const aw = Math.max(w - safe.left - safe.right - 2 * pad, 100);
      const ah = Math.max(h - safe.top - safe.bottom - 2 * pad, 100);

      // Scale to fit safe viewport; cap at 1.15
      const scale = Math.min(aw / (maxX - minX), ah / (maxY - minY), 1.15);

      const originX = safe.left + pad + (aw - (maxX - minX) * scale) / 2 - minX * scale;
      const originY = safe.top + pad + (ah - (maxY - minY) * scale) / 2 - minY * scale;

      return { scale, originX, originY };
    }

    // =========================================================================
    // 4. DPI-AWARE HAIRLINE WIDTH GUARDRAIL
    // =========================================================================
    const hair = (w: number) => Math.max(w, 1 / dpr);

    // =========================================================================
    // 5. RESIZE HANDLING & PRE-COMPUTED VIEWPORT STATE
    // =========================================================================

    const updateDimensions = () => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Two-column layout check below ~1500px: card on left, artwork on right
      const isTwoColumn = width < 1500;
      let safeLeft = 24;
      if (isTwoColumn) {
        const cardEl = document.getElementById("login-card");
        const cardWidth = cardEl ? cardEl.getBoundingClientRect().width : 448;
        safeLeft = cardWidth + 48;
      }

      // Compute fitView once per resize
      const fit = fitView(width, height, {
        top: 64,
        bottom: 38,
        left: safeLeft,
        right: 24,
      });

      currentScale = fit.scale;
      currentOriginX = fit.originX;
      currentOriginY = fit.originY;

      // Invalidate offscreen cache
      offscreenCanvas = null;

      // Dev-only overlap check against #login-card
      if (process.env.NODE_ENV !== "production") {
        const card = document.getElementById("login-card")?.getBoundingClientRect();
        const host = canvas.getBoundingClientRect();
        if (card) {
          for (const n of towerNodes) {
            if (n.id === "SRC") continue;
            const b = project(n.baseX, n.baseY, 0, currentOriginX, currentOriginY, currentScale);
            const topZ = TOP_Z[n.type] ?? 80;
            const t = project(n.baseX, n.baseY, topZ, currentOriginX, currentOriginY, currentScale);
            const x0 = Math.min(b.x, t.x) + host.left;
            const x1 = Math.max(b.x, t.x) + host.left;
            const y0 = Math.min(b.y, t.y) + host.top;
            const y1 = Math.max(b.y, t.y) + host.top;
            if (x1 > card.left - 16 && x0 < card.right + 16 && y1 > card.top - 16 && y0 < card.bottom + 16) {
              console.warn(`[hairline] ${n.id} overlaps the login card at ${width}x${height}`);
            }
          }
        }
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
      if (prefersReducedMotion && running) {
        // Redraw single frame after resize in reduced motion mode
        requestAnimationFrame(render);
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Pointer events with document.documentElement pointerleave and blur
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const rect = canvas.getBoundingClientRect();
      pointer.targetX = e.clientX - rect.left;
      pointer.targetY = e.clientY - rect.top;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);

    // Dynamic viewport-sized ground matrix
    const updateOffscreenGrid = (
      originX: number,
      originY: number,
      scale: number,
      isDark: boolean
    ) => {
      if (!offscreenCanvas) {
        offscreenCanvas = document.createElement("canvas");
      }
      offscreenCanvas.width = canvas.width;
      offscreenCanvas.height = canvas.height;
      offscreenCtx = offscreenCanvas.getContext("2d");
      if (!offscreenCtx) return;

      offscreenCtx.save();
      offscreenCtx.scale(dpr, dpr);

      const gridLine = isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(203, 213, 225, 0.75)";
      const axisGuide = isDark ? "rgba(226, 232, 240, 0.12)" : "rgba(71, 85, 105, 0.14)";

      offscreenCtx.lineWidth = hair(0.5);
      offscreenCtx.strokeStyle = gridLine;

      const gridSize = 44;
      // Size gridExtent dynamically from viewport dimensions
      const gridExtent = Math.ceil((width + height) / scale / gridSize) * gridSize;

      offscreenCtx.beginPath();
      for (let g = -gridExtent; g <= gridExtent; g += gridSize * 2) {
        const p1 = project(g, -gridExtent, 0, originX, originY, scale);
        const p2 = project(g, gridExtent, 0, originX, originY, scale);
        offscreenCtx.moveTo(p1.x, p1.y);
        offscreenCtx.lineTo(p2.x, p2.y);

        const q1 = project(-gridExtent, g, 0, originX, originY, scale);
        const q2 = project(gridExtent, g, 0, originX, originY, scale);
        offscreenCtx.moveTo(q1.x, q1.y);
        offscreenCtx.lineTo(q2.x, q2.y);
      }
      offscreenCtx.stroke();

      // Cardinal axis guides
      offscreenCtx.strokeStyle = axisGuide;
      offscreenCtx.setLineDash([3, 4]);
      offscreenCtx.beginPath();
      const ax1 = project(-gridExtent, 0, 0, originX, originY, scale);
      const ax2 = project(gridExtent, 0, 0, originX, originY, scale);
      offscreenCtx.moveTo(ax1.x, ax1.y);
      offscreenCtx.lineTo(ax2.x, ax2.y);

      const ay1 = project(0, -gridExtent, 0, originX, originY, scale);
      const ay2 = project(0, gridExtent, 0, originX, originY, scale);
      offscreenCtx.moveTo(ay1.x, ay1.y);
      offscreenCtx.lineTo(ay2.x, ay2.y);
      offscreenCtx.stroke();
      offscreenCtx.setLineDash([]);

      offscreenCtx.restore();
      cachedTheme = isDark ? "dark" : "light";
    };

    // =========================================================================
    // 6. ANIMATION LIFECYCLE (Controlled by min-width: 900px media query)
    // =========================================================================

    const mq = window.matchMedia("(min-width: 900px)");
    let running = false;
    let lastTime = performance.now();
    const TARGET_FPS = 40;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const startAnimation = () => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(render);
    };

    const stopAnimation = () => {
      running = false;
      cancelAnimationFrame(animationFrameId);
    };

    const syncAnimationState = () => {
      if (mq.matches) {
        startAnimation();
      } else {
        stopAnimation();
      }
    };

    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      if (motionMq.matches) {
        stopAnimation();
        requestAnimationFrame(render);
      } else if (mq.matches) {
        startAnimation();
      }
    };

    mq.addEventListener("change", syncAnimationState);
    motionMq.addEventListener("change", onMotionChange);

    // =========================================================================
    // 7. PRIMARY RENDER LOOP
    // =========================================================================

    const render = (now: number) => {
      if (!running && !prefersReducedMotion) return;

      const elapsed = now - lastTime;
      if (elapsed < FRAME_INTERVAL && !prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min(elapsed / 1000, 0.1);
      lastTime = now - (elapsed % FRAME_INTERVAL);

      const isDark =
        themeRef.current === "dark" ||
        document.documentElement.classList.contains("dark");

      // Smooth pointer interpolation
      if (pointer.active) {
        pointer.x += (pointer.targetX - pointer.x) * 0.22;
        pointer.y += (pointer.targetY - pointer.y) * 0.22;
      } else {
        pointer.x = -9999;
        pointer.y = -9999;
      }

      const scale = currentScale;
      const originX = currentOriginX;
      const originY = currentOriginY;

      // Palette:
      // Dark Mode: architectural white uprights, titanium grey bracing, emerald telemetry
      // Light Mode: clean slate uprights with emerald telemetry
      const bg = isDark ? "#050608" : "#f8fafc";
      const latticeStroke = isDark ? "rgba(248, 250, 252, 0.88)" : "rgba(30, 41, 59, 0.80)";
      const braceStroke = isDark ? "rgba(148, 163, 184, 0.50)" : "rgba(71, 85, 105, 0.50)";
      const catenaryStroke = isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(71, 85, 105, 0.65)";
      const highlightEmerald = isDark ? "#10b981" : "#059669";
      const telemetryPulseColor = isDark ? "#34d399" : "#059669";
      const tetherStroke = isDark ? "rgba(16, 185, 129, 0.60)" : "rgba(5, 150, 105, 0.60)";

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Clear background
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // 2. Offscreen cached terrain grid
      if (!offscreenCanvas || cachedTheme !== (isDark ? "dark" : "light")) {
        updateOffscreenGrid(originX, originY, scale, isDark);
      }
      if (offscreenCanvas) {
        ctx.drawImage(offscreenCanvas, 0, 0, width, height);
      }

      // Reset node attachment points each frame
      towerNodes.forEach((node) => {
        node.conductorAttachments = [];
        if (node.lvAttachments) node.lvAttachments = [];
      });

      // =======================================================================
      // 8. DRAW 3D TRANSMISSION & DISTRIBUTION STRUCTURES
      // =======================================================================

      // Draw 33kV Lattice Tower with perpendicular crossarms and symmetric delta phases
      const drawLatticeTower = (node: Node3D) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = 0;

        const baseHalfWidth = 26;
        const waistHalfWidth = 10;
        const waistHeight = 90;
        const crossarmHeight1 = 118;
        const crossarmHeight2 = 146;
        const peakHeight = 165;
        const crossarmSpan1 = 44;
        const crossarmSpan2 = 34;

        const footings: Point2D[] = [
          project(bx - baseHalfWidth, by - baseHalfWidth, bz, originX, originY, scale),
          project(bx + baseHalfWidth, by - baseHalfWidth, bz, originX, originY, scale),
          project(bx + baseHalfWidth, by + baseHalfWidth, bz, originX, originY, scale),
          project(bx - baseHalfWidth, by + baseHalfWidth, bz, originX, originY, scale),
        ];

        const waistNodes: Point2D[] = [
          project(bx - waistHalfWidth, by - waistHalfWidth, bz + waistHeight, originX, originY, scale),
          project(bx + waistHalfWidth, by - waistHalfWidth, bz + waistHeight, originX, originY, scale),
          project(bx + waistHalfWidth, by + waistHalfWidth, bz + waistHeight, originX, originY, scale),
          project(bx - waistHalfWidth, by + waistHalfWidth, bz + waistHeight, originX, originY, scale),
        ];

        const midNodes: Point2D[] = [
          project(bx - baseHalfWidth * 0.55, by - baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
          project(bx + baseHalfWidth * 0.55, by - baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
          project(bx + baseHalfWidth * 0.55, by + baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
          project(bx - baseHalfWidth * 0.55, by + baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
        ];

        const peak = project(bx, by, bz + peakHeight, originX, originY, scale);
        node.peakPos = peak;

        // Vector perpendicular to line corridor in ground plane
        const dir = node.lineDir || { x: 1, y: 0 };
        const pp = perp(dir);

        // Lower crossarm (carrying phases 0 and 1)
        const armLeft1 = project(
          bx - pp.x * crossarmSpan1,
          by - pp.y * crossarmSpan1,
          bz + crossarmHeight1,
          originX,
          originY,
          scale
        );
        const armRight1 = project(
          bx + pp.x * crossarmSpan1,
          by + pp.y * crossarmSpan1,
          bz + crossarmHeight1,
          originX,
          originY,
          scale
        );

        // Upper crossarm & apex center
        const armLeft2 = project(
          bx - pp.x * crossarmSpan2,
          by - pp.y * crossarmSpan2,
          bz + crossarmHeight2,
          originX,
          originY,
          scale
        );
        const armRight2 = project(
          bx + pp.x * crossarmSpan2,
          by + pp.y * crossarmSpan2,
          bz + crossarmHeight2,
          originX,
          originY,
          scale
        );
        const armCenter2 = project(bx, by, bz + crossarmHeight2, originX, originY, scale);

        // 3-Phase symmetric delta attachments: left arm, right arm, upper-center
        const insLeft1: Point2D = { x: armLeft1.x, y: armLeft1.y + 11 * scale };
        const insRight1: Point2D = { x: armRight1.x, y: armRight1.y + 11 * scale };
        const insTop2: Point2D = { x: armCenter2.x, y: armCenter2.y + 10 * scale };

        node.conductorAttachments = [insLeft1, insRight1, insTop2];

        // Footing base perimeter
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.55);
        ctx.beginPath();
        ctx.moveTo(footings[0].x, footings[0].y);
        ctx.lineTo(footings[1].x, footings[1].y);
        ctx.lineTo(footings[2].x, footings[2].y);
        ctx.lineTo(footings[3].x, footings[3].y);
        ctx.closePath();
        ctx.stroke();

        // Tower main corner legs (crisp white in dark mode)
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.85);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(footings[i].x, footings[i].y);
          ctx.lineTo(waistNodes[i].x, waistNodes[i].y);
          ctx.lineTo(peak.x, peak.y);
        }
        ctx.stroke();

        // Diagonal lattice bracing (titanium slate)
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.5);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          ctx.moveTo(footings[i].x, footings[i].y);
          ctx.lineTo(midNodes[next].x, midNodes[next].y);
          ctx.moveTo(footings[next].x, footings[next].y);
          ctx.lineTo(midNodes[i].x, midNodes[i].y);

          ctx.moveTo(midNodes[i].x, midNodes[i].y);
          ctx.lineTo(waistNodes[next].x, waistNodes[next].y);
          ctx.moveTo(midNodes[next].x, midNodes[next].y);
          ctx.lineTo(waistNodes[i].x, waistNodes[i].y);
        }
        ctx.stroke();

        // Perpendicular crossarm structural members
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.8);
        ctx.beginPath();
        ctx.moveTo(armLeft1.x, armLeft1.y);
        ctx.lineTo(armRight1.x, armRight1.y);
        ctx.moveTo(armLeft1.x, armLeft1.y);
        ctx.lineTo(armCenter2.x, armCenter2.y);
        ctx.moveTo(armRight1.x, armRight1.y);
        ctx.lineTo(armCenter2.x, armCenter2.y);

        ctx.moveTo(armLeft2.x, armLeft2.y);
        ctx.lineTo(armRight2.x, armRight2.y);
        ctx.moveTo(armLeft2.x, armLeft2.y);
        ctx.lineTo(peak.x, peak.y);
        ctx.moveTo(armRight2.x, armRight2.y);
        ctx.lineTo(peak.x, peak.y);
        ctx.stroke();

        // Insulators (only where conductors attach)
        ctx.strokeStyle = highlightEmerald;
        ctx.lineWidth = hair(0.75);
        ctx.beginPath();
        [insLeft1, insRight1, insTop2].forEach((ins, idx) => {
          const armEnd = idx === 0 ? armLeft1 : idx === 1 ? armRight1 : armCenter2;
          ctx.moveTo(armEnd.x, armEnd.y);
          ctx.lineTo(ins.x, ins.y);
        });
        ctx.stroke();

        // Insulator emerald beacon dots
        ctx.fillStyle = highlightEmerald;
        [insLeft1, insRight1, insTop2].forEach((ins) => {
          ctx.beginPath();
          ctx.arc(ins.x, ins.y, 1.4 * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        // Peak lightning mast beacon
        ctx.beginPath();
        ctx.arc(peak.x, peak.y, 1.6 * scale, 0, Math.PI * 2);
        ctx.fill();
      };

      // Draw Primary 33/11kV Substation Transformer Bank
      // HV bushings: -y face (facing T2); LV bushings: +x face (facing P1); Radiators: -x face
      const drawSubstation = (node: Node3D) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = 0;

        const hw = 28;
        const hd = 22;
        const th = 40;

        const b00 = project(bx - hw, by - hd, bz, originX, originY, scale);
        const b10 = project(bx + hw, by - hd, bz, originX, originY, scale);
        const b11 = project(bx + hw, by + hd, bz, originX, originY, scale);
        const b01 = project(bx - hw, by + hd, bz, originX, originY, scale);

        const t00 = project(bx - hw, by - hd, bz + th, originX, originY, scale);
        const t10 = project(bx + hw, by - hd, bz + th, originX, originY, scale);
        const t11 = project(bx + hw, by + hd, bz + th, originX, originY, scale);
        const t01 = project(bx - hw, by + hd, bz + th, originX, originY, scale);

        const deckCenter = project(bx, by, bz + th, originX, originY, scale);
        node.peakPos = deckCenter;

        // HV incoming bushings on North face (-y face, facing T2)
        const hvBushings: Point2D[] = [-14, 0, 14].map((off) =>
          project(bx + off, by - hd + 6, bz + th + 24, originX, originY, scale)
        );
        node.conductorAttachments = hvBushings;

        // LV outgoing bushings on East face (+x face, facing P1)
        const lvBushings: Point2D[] = [-12, 0, 12].map((off) =>
          project(bx + hw - 6, by + off, bz + th + 16, originX, originY, scale)
        );
        node.lvAttachments = lvBushings;

        // Tank base perimeter
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.6);
        ctx.beginPath();
        ctx.moveTo(b00.x, b00.y);
        ctx.lineTo(b10.x, b10.y);
        ctx.lineTo(b11.x, b11.y);
        ctx.lineTo(b01.x, b01.y);
        ctx.closePath();
        ctx.stroke();

        // Upright tank corners (architectural white in dark mode)
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.8);
        ctx.beginPath();
        ctx.moveTo(b00.x, b00.y);
        ctx.lineTo(t00.x, t00.y);
        ctx.moveTo(b10.x, b10.y);
        ctx.lineTo(t10.x, t10.y);
        ctx.moveTo(b11.x, b11.y);
        ctx.lineTo(t11.x, t11.y);
        ctx.moveTo(b01.x, b01.y);
        ctx.lineTo(t01.x, t01.y);
        ctx.stroke();

        // Top deck plate
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.7);
        ctx.beginPath();
        ctx.moveTo(t00.x, t00.y);
        ctx.lineTo(t10.x, t10.y);
        ctx.lineTo(t11.x, t11.y);
        ctx.lineTo(t01.x, t01.y);
        ctx.closePath();
        ctx.stroke();

        // Radiator cooling ribs on -x face
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.5);
        ctx.beginPath();
        for (let r = -hd + 4; r <= hd - 4; r += 5) {
          const rfBot = project(bx - hw, by + r, bz, originX, originY, scale);
          const rfTop = project(bx - hw, by + r, bz + th - 4, originX, originY, scale);
          ctx.moveTo(rfBot.x, rfBot.y);
          ctx.lineTo(rfTop.x, rfTop.y);
        }
        ctx.stroke();

        // Conservator oil tank drum on top deck
        const c1 = project(bx - 16, by, bz + th + 10, originX, originY, scale);
        const c2 = project(bx + 16, by, bz + th + 10, originX, originY, scale);
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.7);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.stroke();

        // Bushing stems
        ctx.strokeStyle = highlightEmerald;
        ctx.lineWidth = hair(0.75);
        ctx.beginPath();
        hvBushings.forEach((b, idx) => {
          const off = (idx - 1) * 14;
          const base = project(bx + off, by - hd + 6, bz + th, originX, originY, scale);
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(b.x, b.y);
        });
        lvBushings.forEach((b, idx) => {
          const off = (idx - 1) * 12;
          const base = project(bx + hw - 6, by + off, bz + th, originX, originY, scale);
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(b.x, b.y);
        });
        ctx.stroke();

        // Bushing corona beacons
        ctx.fillStyle = highlightEmerald;
        [...hvBushings, ...lvBushings].forEach((b) => {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 1.8 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      // Draw 11kV Feeder Distribution Pole
      const drawFeederPole = (node: Node3D) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = 0;
        const poleHeight = 82;
        const crossarmWidth = 24;

        const dir = node.lineDir || { x: 1, y: 0 };
        const pp = perp(dir);

        const base = project(bx, by, bz, originX, originY, scale);
        const top = project(bx, by, bz + poleHeight, originX, originY, scale);
        node.peakPos = top;

        // 3-Phase crossarm perpendicular to line
        const armLeft = project(
          bx - pp.x * crossarmWidth,
          by - pp.y * crossarmWidth,
          bz + poleHeight - 8,
          originX,
          originY,
          scale
        );
        const armCenter = project(bx, by, bz + poleHeight - 6, originX, originY, scale);
        const armRight = project(
          bx + pp.x * crossarmWidth,
          by + pp.y * crossarmWidth,
          bz + poleHeight - 8,
          originX,
          originY,
          scale
        );

        node.conductorAttachments = [armLeft, armCenter, armRight];

        // Pole upright shaft
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.9);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Crossarm
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.75);
        ctx.beginPath();
        ctx.moveTo(armLeft.x, armLeft.y);
        ctx.lineTo(armRight.x, armRight.y);
        ctx.stroke();

        // Pin insulators (emerald beacons)
        ctx.fillStyle = highlightEmerald;
        [armLeft, armCenter, armRight].forEach((pin) => {
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, 1.3 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      // Draw 11kV / 415V Pole-Mounted Distribution Transformer (DTR) in True 3D
      const drawDTRPole = (node: Node3D) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = 0;
        const poleHeight = 85;
        const crossarmWidth = 22;

        const dir = node.lineDir || { x: 1, y: 0 };
        const pp = perp(dir);

        const base = project(bx, by, bz, originX, originY, scale);
        const top = project(bx, by, bz + poleHeight, originX, originY, scale);
        node.peakPos = top;

        // 11kV primary crossarm
        const armLeft = project(
          bx - pp.x * crossarmWidth,
          by - pp.y * crossarmWidth,
          bz + poleHeight - 6,
          originX,
          originY,
          scale
        );
        const armCenter = project(bx, by, bz + poleHeight - 4, originX, originY, scale);
        const armRight = project(
          bx + pp.x * crossarmWidth,
          by + pp.y * crossarmWidth,
          bz + poleHeight - 6,
          originX,
          originY,
          scale
        );

        node.conductorAttachments = [armLeft, armCenter, armRight];

        // True 3D World-Space Distribution Transformer Tank
        const tankX = bx + pp.x * 9;
        const tankY = by + pp.y * 9;
        const tankZBot = bz + 32;
        const tankZTop = bz + 52;
        const tw = 7;
        const td = 6;

        const tb00 = project(tankX - tw, tankY - td, tankZBot, originX, originY, scale);
        const tb10 = project(tankX + tw, tankY - td, tankZBot, originX, originY, scale);
        const tb11 = project(tankX + tw, tankY + td, tankZBot, originX, originY, scale);
        const tb01 = project(tankX - tw, tankY + td, tankZBot, originX, originY, scale);

        const tt00 = project(tankX - tw, tankY - td, tankZTop, originX, originY, scale);
        const tt10 = project(tankX + tw, tankY - td, tankZTop, originX, originY, scale);
        const tt11 = project(tankX + tw, tankY + td, tankZTop, originX, originY, scale);
        const tt01 = project(tankX - tw, tankY + td, tankZTop, originX, originY, scale);

        // Secondary LT 415V bushing rack (4 terminals: 3 phases + neutral)
        const ltBushings: Point2D[] = [-6, -2, 2, 6].map((off) =>
          project(tankX + off, tankY + td, tankZBot + 6, originX, originY, scale)
        );
        node.lvAttachments = ltBushings;

        // Pole upright shaft
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.9);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Primary 11kV crossarm
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.75);
        ctx.beginPath();
        ctx.moveTo(armLeft.x, armLeft.y);
        ctx.lineTo(armRight.x, armRight.y);
        ctx.stroke();

        // 3D DTR Transformer Tank Enclosure
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.6);
        ctx.beginPath();
        // Base plate
        ctx.moveTo(tb00.x, tb00.y);
        ctx.lineTo(tb10.x, tb10.y);
        ctx.lineTo(tb11.x, tb11.y);
        ctx.lineTo(tb01.x, tb01.y);
        ctx.closePath();
        // Top plate
        ctx.moveTo(tt00.x, tt00.y);
        ctx.lineTo(tt10.x, tt10.y);
        ctx.lineTo(tt11.x, tt11.y);
        ctx.lineTo(tt01.x, tt01.y);
        ctx.closePath();
        // Vertical corner ribs
        ctx.moveTo(tb00.x, tb00.y);
        ctx.lineTo(tt00.x, tt00.y);
        ctx.moveTo(tb10.x, tb10.y);
        ctx.lineTo(tt10.x, tt10.y);
        ctx.moveTo(tb11.x, tb11.y);
        ctx.lineTo(tt11.x, tt11.y);
        ctx.moveTo(tb01.x, tb01.y);
        ctx.lineTo(tt01.x, tt01.y);
        // Mounting bracket to pole
        const pMid = project(bx, by, tankZBot + 10, originX, originY, scale);
        const tMid = project(tankX, tankY, tankZBot + 10, originX, originY, scale);
        ctx.moveTo(pMid.x, pMid.y);
        ctx.lineTo(tMid.x, tMid.y);
        ctx.stroke();

        // Primary pins
        ctx.fillStyle = highlightEmerald;
        [armLeft, armCenter, armRight].forEach((pin) => {
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, 1.3 * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        // LT secondary bushings
        ltBushings.forEach((lt) => {
          ctx.beginPath();
          ctx.arc(lt.x, lt.y, 1.1 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      // Draw LT Distribution Pole (4-Wire: 3 Phases + Neutral)
      const drawLTPole = (node: Node3D) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = 0;
        const poleHeight = 72;

        const base = project(bx, by, bz, originX, originY, scale);
        const top = project(bx, by, bz + poleHeight, originX, originY, scale);
        node.peakPos = top;

        // Vertical spool insulator rack along pole
        const spools: Point2D[] = [52, 57, 62, 67].map((h) =>
          project(bx + 3, by, bz + h, originX, originY, scale)
        );
        node.conductorAttachments = spools;

        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = hair(0.85);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Spool rack bracket
        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.65);
        ctx.beginPath();
        const rBot = project(bx + 3, by, bz + 50, originX, originY, scale);
        const rTop = project(bx + 3, by, bz + 69, originX, originY, scale);
        ctx.moveTo(rBot.x, rBot.y);
        ctx.lineTo(rTop.x, rTop.y);
        ctx.stroke();

        // Spool insulator dots
        ctx.fillStyle = highlightEmerald;
        spools.forEach((s) => {
          ctx.beginPath();
          ctx.arc(s.x, s.y, 1.2 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      // Draw Consumer Building & Service Drop Weatherhead
      const drawBuildingTerminal = (node: Node3D) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = 0;

        const hw = 22;
        const hd = 16;
        const bh = 32;

        const b00 = project(bx - hw, by - hd, bz, originX, originY, scale);
        const b10 = project(bx + hw, by - hd, bz, originX, originY, scale);
        const b11 = project(bx + hw, by + hd, bz, originX, originY, scale);
        const b01 = project(bx - hw, by + hd, bz, originX, originY, scale);

        const r00 = project(bx - hw, by - hd, bz + bh, originX, originY, scale);
        const r10 = project(bx + hw, by - hd, bz + bh, originX, originY, scale);
        const r11 = project(bx + hw, by + hd, bz + bh, originX, originY, scale);
        const r01 = project(bx - hw, by + hd, bz + bh, originX, originY, scale);

        // 2 distinct service terminals offset by a few px
        const w1 = project(bx - hw + 4, by - hd + 2, bz + bh + 8, originX, originY, scale);
        const w2 = project(bx - hw + 4, by - hd + 6, bz + bh + 8, originX, originY, scale);
        node.conductorAttachments = [w1, w2];
        node.peakPos = r10;

        ctx.strokeStyle = braceStroke;
        ctx.lineWidth = hair(0.65);
        ctx.beginPath();
        // Ground outline
        ctx.moveTo(b00.x, b00.y);
        ctx.lineTo(b10.x, b10.y);
        ctx.lineTo(b11.x, b11.y);
        ctx.lineTo(b01.x, b01.y);
        ctx.closePath();
        // Roof outline
        ctx.moveTo(r00.x, r00.y);
        ctx.lineTo(r10.x, r10.y);
        ctx.lineTo(r11.x, r11.y);
        ctx.lineTo(r01.x, r01.y);
        ctx.closePath();
        // Walls
        ctx.moveTo(b00.x, b00.y);
        ctx.lineTo(r00.x, r00.y);
        ctx.moveTo(b10.x, b10.y);
        ctx.lineTo(r10.x, r10.y);
        ctx.moveTo(b11.x, b11.y);
        ctx.lineTo(r11.x, r11.y);
        ctx.moveTo(b01.x, b01.y);
        ctx.lineTo(r01.x, r01.y);
        // Service mast
        ctx.moveTo(r00.x, r00.y);
        ctx.lineTo(w1.x, w1.y);
        ctx.stroke();

        ctx.fillStyle = highlightEmerald;
        [w1, w2].forEach((w) => {
          ctx.beginPath();
          ctx.arc(w.x, w.y, 1.4 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      // Draw all visible structures (SRC is virtual)
      towerNodes.forEach((node) => {
        if (node.id === "SRC") return;
        if (node.type === "hv-tower") drawLatticeTower(node);
        else if (node.type === "substation") drawSubstation(node);
        else if (node.type === "feeder-pole") drawFeederPole(node);
        else if (node.type === "dtr-pole") drawDTRPole(node);
        else if (node.type === "lt-pole") drawLTPole(node);
        else if (node.type === "building") drawBuildingTerminal(node);
      });

      // Compute virtual SRC conductor attachments: translated back along T0's line direction
      const t0 = towerNodes.find((n) => n.id === "T0");
      const src = towerNodes.find((n) => n.id === "SRC");
      if (t0 && src && t0.conductorAttachments.length >= 3 && t0.lineDir) {
        const d = t0.lineDir;
        const back = 520;
        const a = project(t0.baseX, t0.baseY, 0, originX, originY, scale);
        const b = project(t0.baseX - d.x * back, t0.baseY - d.y * back, 0, originX, originY, scale);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        src.conductorAttachments = t0.conductorAttachments.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      }

      // =======================================================================
      // 9. DRAW 3-PHASE CATENARY CONDUCTORS & TELEMETRY PULSES
      // =======================================================================

      spans.forEach((span) => {
        const fromNode = towerNodes.find((n) => n.id === span.fromNodeId);
        const toNode = towerNodes.find((n) => n.id === span.toNodeId);
        if (!fromNode || !toNode) return;

        const sourceList = span.useLvSource && fromNode.lvAttachments && fromNode.lvAttachments.length > 0
          ? fromNode.lvAttachments
          : fromNode.conductorAttachments;

        const pStart = sourceList[span.fromAttachIdx] || fromNode.peakPos;
        const pEnd = toNode.conductorAttachments[span.toAttachIdx] || toNode.peakPos;
        if (!pStart || !pEnd) return;

        const getCatenaryPoint = (t: number): Point2D => {
          const lx = pStart.x + (pEnd.x - pStart.x) * t;
          const ly = pStart.y + (pEnd.y - pStart.y) * t;
          const sagOffset = span.sag * scale * 4 * t * (1 - t);
          return { x: lx, y: ly + sagOffset };
        };

        const segments = 22;

        // Virtual incoming span from SRC fades in from transparent at far-left edge
        if (span.fromNodeId === "SRC") {
          const grad = ctx.createLinearGradient(pStart.x, pStart.y, pEnd.x, pEnd.y);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(0.35, catenaryStroke);
          grad.addColorStop(1, catenaryStroke);
          ctx.strokeStyle = grad;
        } else {
          ctx.strokeStyle = catenaryStroke;
        }

        ctx.lineWidth = hair(0.7);
        ctx.beginPath();
        const startPt = getCatenaryPoint(0);
        ctx.moveTo(startPt.x, startPt.y);
        for (let i = 1; i <= segments; i++) {
          const pt = getCatenaryPoint(i / segments);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();

        // Frame-rate independent delta-time continuous motion
        span.pulseProgress1 = (span.pulseProgress1 + span.pulseSpeed * (dt * 60)) % 1;
        span.pulseProgress2 = (span.pulseProgress2 + span.pulseSpeed * (dt * 60)) % 1;

        [span.pulseProgress1, span.pulseProgress2].forEach((prog) => {
          // Fade pulses at the incoming left margin for SRC span
          if (span.fromNodeId === "SRC" && prog < 0.25) return;

          const head = getCatenaryPoint(prog);
          const tail = getCatenaryPoint(Math.max(0, prog - 0.045));

          // Telemetry trail
          ctx.strokeStyle = telemetryPulseColor;
          ctx.lineWidth = hair(1.0);
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();

          // Sub-pixel pulse bead
          ctx.fillStyle = telemetryPulseColor;
          ctx.beginPath();
          ctx.arc(head.x, head.y, 1.4 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      // =======================================================================
      // 10. DYNAMIC CURSOR TETHERING & TELEMETRY CROSSHAIR
      // =======================================================================

      if (pointer.active) {
        const tetherTargets: { pos: Point2D; dist: number }[] = [];

        towerNodes.forEach((node) => {
          if (node.id === "SRC") return;
          if (node.peakPos) {
            const d = Math.hypot(pointer.x - node.peakPos.x, pointer.y - node.peakPos.y);
            tetherTargets.push({ pos: node.peakPos, dist: d });
          }
          node.conductorAttachments.forEach((att) => {
            const d = Math.hypot(pointer.x - att.x, pointer.y - att.y);
            tetherTargets.push({ pos: att, dist: d });
          });
        });

        tetherTargets.sort((a, b) => a.dist - b.dist);
        const maxTetherRadius = 240;
        const nearest = tetherTargets.filter((t) => t.dist < maxTetherRadius).slice(0, 3);

        nearest.forEach((target) => {
          ctx.strokeStyle = tetherStroke;
          ctx.lineWidth = hair(0.65);
          ctx.setLineDash([3, 3]);

          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(target.pos.x, target.pos.y);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.fillStyle = highlightEmerald;
          ctx.beginPath();
          ctx.arc(target.pos.x, target.pos.y, 2.0 * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        // Crisp SCADA Crosshair (Horizontal & Vertical ticks, plus ring)
        ctx.strokeStyle = highlightEmerald;
        ctx.lineWidth = hair(0.85);

        ctx.beginPath();
        // Horizontal crosshair tick
        ctx.moveTo(pointer.x - 7, pointer.y);
        ctx.lineTo(pointer.x + 7, pointer.y);
        // Vertical crosshair tick
        ctx.moveTo(pointer.x, pointer.y - 7);
        ctx.lineTo(pointer.x, pointer.y + 7);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Schedule next frame only while running and motion is enabled
      if (running && !prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    // Initial sync of animation state
    syncAnimationState();

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      mq.removeEventListener("change", syncAnimationState);
      motionMq.removeEventListener("change", onMotionChange);
    };
  }, []); // Theme handled dynamically via themeRef without tearing down effect

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none z-0 hairline-bg hidden min-[900px]:block"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0, #000 72px, #000 calc(100% - 48px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0, #000 72px, #000 calc(100% - 48px), transparent 100%)",
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
