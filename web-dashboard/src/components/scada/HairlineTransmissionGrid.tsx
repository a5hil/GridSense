"use client";

import React, { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme-context";

interface Point2D {
  x: number;
  y: number;
}

interface TowerNode {
  id: string;
  type: "lattice" | "pole" | "substation";
  baseX: number;
  baseY: number;
  floatPhase: number;
  floatSpeed: number;
  floatAmp: number;
  currentZOffset: number;
  screenPos?: Point2D;
  peakPos?: Point2D;
  conductorAttachments: Point2D[];
}

interface CatenarySpan {
  fromNodeId: string;
  fromAttachIdx: number;
  toNodeId: string;
  toAttachIdx: number;
  sag: number;
  pulseProgress1: number;
  pulseProgress2: number;
  pulseActive?: boolean;
  pulseColor?: string;
  pulseSpeed: number;
}

export function HairlineTransmissionGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Pointer state for interactive tethering
    const pointer = {
      x: -9999,
      y: -9999,
      active: false,
      targetX: -9999,
      targetY: -9999,
    };

    // Periodic subtle fault anomaly timestamp
    let lastFaultTime = Date.now();

    // High-DPI canvas resize handling
    const handleResize = () => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const onPointerMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.targetX = e.clientX - rect.left;
      pointer.targetY = e.clientY - rect.top;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const container = containerRef.current || window;
    container.addEventListener("mousemove", onPointerMove as EventListener);
    container.addEventListener("mouseleave", onPointerLeave as EventListener);

    // 30-degree isometric projection constants
    const COS30 = 0.8660254;
    const SIN30 = 0.5;

    const project = (
      wx: number,
      wy: number,
      wz: number,
      originX: number,
      originY: number,
      scale: number = 1
    ): Point2D => {
      return {
        x: originX + (wx - wy) * COS30 * scale,
        y: originY + (wx + wy) * SIN30 * scale - wz * scale,
      };
    };

    // Repositioned transmission assets across the outer horizon and flanks
    // Leaves the center completely spacious and open with generous breathing room
    const towerNodes: TowerNode[] = [
      // 1. Far West Utility Pole
      {
        id: "P0",
        type: "pole",
        baseX: -760,
        baseY: -160,
        floatPhase: 0.8,
        floatSpeed: 0.0009,
        floatAmp: 4.5,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // 2. West Mid Distribution Pole
      {
        id: "P1",
        type: "pole",
        baseX: -660,
        baseY: 200,
        floatPhase: 1.6,
        floatSpeed: 0.0011,
        floatAmp: 5.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // 3. Northwest 400kV Lattice Transmission Tower (wide left wing)
      {
        id: "T1",
        type: "lattice",
        baseX: -540,
        baseY: -120,
        floatPhase: 0.2,
        floatSpeed: 0.00095,
        floatAmp: 6.5,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // 4. North Horizon Background 400kV Lattice Tower (high top-right skyline)
      {
        id: "T3",
        type: "lattice",
        baseX: -60,
        baseY: -560,
        floatPhase: 2.1,
        floatSpeed: 0.00085,
        floatAmp: 6.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // 5. East 220kV Lattice Tower (wide right wing)
      {
        id: "T2",
        type: "lattice",
        baseX: 560,
        baseY: -160,
        floatPhase: 3.3,
        floatSpeed: 0.001,
        floatAmp: 7.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // 6. Southeast Substation Transformer Bank (lower-right opening)
      {
        id: "S1",
        type: "substation",
        baseX: 500,
        baseY: 360,
        floatPhase: 4.2,
        floatSpeed: 0.00075,
        floatAmp: 4.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // 7. Far Southeast Feeder Pole
      {
        id: "P2",
        type: "pole",
        baseX: 740,
        baseY: 140,
        floatPhase: 5.1,
        floatSpeed: 0.0012,
        floatAmp: 5.5,
        currentZOffset: 0,
        conductorAttachments: [],
      },
    ];

    // Catenary spans linking the network across outer corridors
    const spans: CatenarySpan[] = [
      {
        fromNodeId: "P0",
        fromAttachIdx: 0,
        toNodeId: "T1",
        toAttachIdx: 2,
        sag: 16,
        pulseProgress1: 0.1,
        pulseProgress2: 0.6,
        pulseSpeed: 0.0022,
      },
      {
        fromNodeId: "T1",
        fromAttachIdx: 1,
        toNodeId: "P1",
        toAttachIdx: 0,
        sag: 20,
        pulseProgress1: 0.35,
        pulseProgress2: 0.85,
        pulseSpeed: 0.0025,
      },
      {
        fromNodeId: "T1",
        fromAttachIdx: 0,
        toNodeId: "T3",
        toAttachIdx: 0,
        sag: 24,
        pulseProgress1: 0.2,
        pulseProgress2: 0.7,
        pulseSpeed: 0.002,
      },
      {
        fromNodeId: "T1",
        fromAttachIdx: 1,
        toNodeId: "T3",
        toAttachIdx: 1,
        sag: 22,
        pulseProgress1: 0.45,
        pulseProgress2: 0.95,
        pulseSpeed: 0.0021,
      },
      {
        fromNodeId: "T3",
        fromAttachIdx: 0,
        toNodeId: "T2",
        toAttachIdx: 0,
        sag: 28,
        pulseProgress1: 0.15,
        pulseProgress2: 0.65,
        pulseSpeed: 0.0023,
      },
      {
        fromNodeId: "T3",
        fromAttachIdx: 1,
        toNodeId: "T2",
        toAttachIdx: 1,
        sag: 25,
        pulseProgress1: 0.4,
        pulseProgress2: 0.9,
        pulseSpeed: 0.0022,
      },
      {
        fromNodeId: "T2",
        fromAttachIdx: 1,
        toNodeId: "S1",
        toAttachIdx: 0,
        sag: 22,
        pulseProgress1: 0.25,
        pulseProgress2: 0.75,
        pulseSpeed: 0.0024,
      },
      {
        fromNodeId: "T2",
        fromAttachIdx: 2,
        toNodeId: "S1",
        toAttachIdx: 1,
        sag: 20,
        pulseProgress1: 0.5,
        pulseProgress2: 0.0,
        pulseSpeed: 0.0025,
      },
      {
        fromNodeId: "S1",
        fromAttachIdx: 1,
        toNodeId: "P2",
        toAttachIdx: 0,
        sag: 16,
        pulseProgress1: 0.3,
        pulseProgress2: 0.8,
        pulseSpeed: 0.0026,
      },
    ];

    // Trigger an ADMS fault ripple across a span (pure geometric color-shift)
    const triggerFault = (spanIdx: number) => {
      const span = spans[spanIdx];
      if (!span) return;
      span.pulseActive = true;
      span.pulseColor = Math.random() > 0.4 ? "#f59e0b" : "#10b981"; // Amber or Emerald
    };

    // Primary animation render loop
    const render = (now: number) => {
      const isDark = theme === "dark" || document.documentElement.classList.contains("dark");

      // Smooth pointer interpolation
      if (pointer.active) {
        pointer.x += (pointer.targetX - pointer.x) * 0.18;
        pointer.y += (pointer.targetY - pointer.y) * 0.18;
      } else {
        pointer.x = -9999;
        pointer.y = -9999;
      }

      // Application Emerald Palette (strict adherence to GridSense design standards)
      // Dark Mode Palette:
      const bg = isDark ? "#050608" : "#f8fafc";
      const gridLine = isDark ? "rgba(16, 185, 129, 0.05)" : "rgba(226, 232, 240, 0.75)";
      const axisGuide = isDark ? "rgba(16, 185, 129, 0.12)" : "rgba(5, 150, 105, 0.12)";
      const lineStroke = isDark ? "rgba(148, 163, 184, 0.4)" : "rgba(71, 85, 105, 0.45)";
      const latticeStroke = isDark ? "rgba(52, 211, 153, 0.65)" : "rgba(30, 41, 59, 0.75)";
      const highlightStroke = isDark ? "#10b981" : "#059669";
      const catenaryStroke = isDark ? "rgba(148, 163, 184, 0.5)" : "rgba(71, 85, 105, 0.65)";
      const tetherStroke = isDark ? "rgba(16, 185, 129, 0.65)" : "rgba(5, 150, 105, 0.65)";
      const activePulseColor = isDark ? "#34d399" : "#059669";

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. CLEAR CANVAS
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const originX = width / 2;
      const originY = height / 2 + 30;
      const scale = Math.min(width, height) / 900;

      // 2. DELICATE SUBSTATION GROUND MATRIX & GRID GUIDES
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = gridLine;

      const gridSize = 42;
      const gridExtent = 840;

      ctx.beginPath();
      for (let g = -gridExtent; g <= gridExtent; g += gridSize * 2) {
        const p1 = project(g, -gridExtent, 0, originX, originY, scale);
        const p2 = project(g, gridExtent, 0, originX, originY, scale);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);

        const q1 = project(-gridExtent, g, 0, originX, originY, scale);
        const q2 = project(gridExtent, g, 0, originX, originY, scale);
        ctx.moveTo(q1.x, q1.y);
        ctx.lineTo(q2.x, q2.y);
      }
      ctx.stroke();

      // Cardinal axis guides
      ctx.strokeStyle = axisGuide;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      const ax1 = project(-gridExtent, 0, 0, originX, originY, scale);
      const ax2 = project(gridExtent, 0, 0, originX, originY, scale);
      ctx.moveTo(ax1.x, ax1.y);
      ctx.lineTo(ax2.x, ax2.y);

      const ay1 = project(0, -gridExtent, 0, originX, originY, scale);
      const ay2 = project(0, gridExtent, 0, originX, originY, scale);
      ctx.moveTo(ay1.x, ay1.y);
      ctx.lineTo(ay2.x, ay2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. ZERO-GRAVITY FLOATING PHYSICS
      towerNodes.forEach((node) => {
        const elapsed = now * node.floatSpeed + node.floatPhase;
        node.currentZOffset = Math.sin(elapsed) * node.floatAmp;
        node.conductorAttachments = [];
      });

      // 4. DRAW 3D TRANSMISSION STRUCTURES (Pure hairline geometry, zero text labels)
      const drawLatticeTower = (node: TowerNode) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = node.currentZOffset;

        const baseHalfWidth = 26;
        const waistHalfWidth = 10;
        const waistHeight = 90;
        const crossarmHeight1 = 115;
        const crossarmHeight2 = 145;
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

        const armLeft1 = project(bx - crossarmSpan1, by, bz + crossarmHeight1, originX, originY, scale);
        const armRight1 = project(bx + crossarmSpan1, by, bz + crossarmHeight1, originX, originY, scale);
        const armCenter2 = project(bx, by, bz + crossarmHeight2, originX, originY, scale);

        const armLeft2 = project(bx - crossarmSpan2, by, bz + crossarmHeight2, originX, originY, scale);
        const armRight2 = project(bx + crossarmSpan2, by, bz + crossarmHeight2, originX, originY, scale);

        const peak = project(bx, by, bz + peakHeight, originX, originY, scale);
        node.peakPos = peak;
        node.screenPos = project(bx, by, bz + waistHeight, originX, originY, scale);

        const insLeft1: Point2D = { x: armLeft1.x, y: armLeft1.y + 10 * scale };
        const insRight1: Point2D = { x: armRight1.x, y: armRight1.y + 10 * scale };
        const insLeft2: Point2D = { x: armLeft2.x, y: armLeft2.y + 9 * scale };

        node.conductorAttachments = [insLeft1, insRight1, insLeft2];

        // Footing outline
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(footings[0].x, footings[0].y);
        ctx.lineTo(footings[1].x, footings[1].y);
        ctx.lineTo(footings[2].x, footings[2].y);
        ctx.lineTo(footings[3].x, footings[3].y);
        ctx.closePath();
        ctx.stroke();

        // Tower primary corner legs
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(footings[i].x, footings[i].y);
          ctx.lineTo(waistNodes[i].x, waistNodes[i].y);
          ctx.lineTo(peak.x, peak.y);
        }
        ctx.stroke();

        // Diagonal lattice X-bracing
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.5;
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

        // Crossarms
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.8;
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

        // Insulator strings
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        [insLeft1, insRight1, insLeft2].forEach((ins, idx) => {
          const armEnd = idx === 0 ? armLeft1 : idx === 1 ? armRight1 : armLeft2;
          ctx.moveTo(armEnd.x, armEnd.y);
          ctx.lineTo(ins.x, ins.y);
          ctx.arc(ins.x, ins.y, 1.4 * scale, 0, Math.PI * 2);
        });
        ctx.stroke();

        // Peak point light dot
        ctx.fillStyle = highlightStroke;
        ctx.beginPath();
        ctx.arc(peak.x, peak.y, 1.6 * scale, 0, Math.PI * 2);
        ctx.fill();
      };

      const drawPole = (node: TowerNode) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = node.currentZOffset;
        const poleHeight = 85;
        const crossarmWidth = 22;

        const base = project(bx, by, bz, originX, originY, scale);
        const top = project(bx, by, bz + poleHeight, originX, originY, scale);
        const armLeft = project(bx - crossarmWidth, by, bz + poleHeight - 8, originX, originY, scale);
        const armRight = project(bx + crossarmWidth, by, bz + poleHeight - 8, originX, originY, scale);

        node.peakPos = top;
        node.screenPos = top;
        node.conductorAttachments = [armLeft, armRight];

        // Pole shaft
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Crossarm
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(armLeft.x, armLeft.y);
        ctx.lineTo(armRight.x, armRight.y);
        ctx.stroke();

        // Transformer can
        const transCanTop = project(bx + 6, by - 6, bz + poleHeight - 24, originX, originY, scale);
        const transCanBot = project(bx + 6, by - 6, bz + poleHeight - 40, originX, originY, scale);
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(transCanTop.x - 3, transCanTop.y);
        ctx.lineTo(transCanTop.x + 3, transCanTop.y);
        ctx.lineTo(transCanBot.x + 3, transCanBot.y);
        ctx.lineTo(transCanBot.x - 3, transCanBot.y);
        ctx.closePath();
        ctx.stroke();

        // Insulator pins
        ctx.fillStyle = highlightStroke;
        ctx.beginPath();
        ctx.arc(armLeft.x, armLeft.y, 1.3 * scale, 0, Math.PI * 2);
        ctx.arc(armRight.x, armRight.y, 1.3 * scale, 0, Math.PI * 2);
        ctx.fill();
      };

      const drawSubstation = (node: TowerNode) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = node.currentZOffset;

        const hw = 32;
        const hd = 24;
        const th = 42;

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
        node.screenPos = deckCenter;

        const bushing1 = project(bx - 14, by, bz + th + 26, originX, originY, scale);
        const bushing2 = project(bx + 14, by, bz + th + 26, originX, originY, scale);
        node.conductorAttachments = [bushing1, bushing2];

        // Base perimeter
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(b00.x, b00.y);
        ctx.lineTo(b10.x, b10.y);
        ctx.lineTo(b11.x, b11.y);
        ctx.lineTo(b01.x, b01.y);
        ctx.closePath();
        ctx.stroke();

        // Vertical edges
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.75;
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
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(t00.x, t00.y);
        ctx.lineTo(t10.x, t10.y);
        ctx.lineTo(t11.x, t11.y);
        ctx.lineTo(t01.x, t01.y);
        ctx.closePath();
        ctx.stroke();

        // Radiator cooling ribs
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let r = -hw + 6; r <= hw - 6; r += 7) {
          const rfBot = project(bx + r, by + hd, bz, originX, originY, scale);
          const rfTop = project(bx + r, by + hd, bz + th - 4, originX, originY, scale);
          ctx.moveTo(rfBot.x, rfBot.y);
          ctx.lineTo(rfTop.x, rfTop.y);
        }
        ctx.stroke();

        // Bushing conductors & corona rings
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const bBase1 = project(bx - 14, by, bz + th, originX, originY, scale);
        const bBase2 = project(bx + 14, by, bz + th, originX, originY, scale);
        ctx.moveTo(bBase1.x, bBase1.y);
        ctx.lineTo(bushing1.x, bushing1.y);
        ctx.moveTo(bBase2.x, bBase2.y);
        ctx.lineTo(bushing2.x, bushing2.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(bushing1.x, bushing1.y, 2.0 * scale, 0, Math.PI * 2);
        ctx.arc(bushing2.x, bushing2.y, 2.0 * scale, 0, Math.PI * 2);
        ctx.stroke();
      };

      // Draw all positioned structures
      towerNodes.forEach((node) => {
        if (node.type === "lattice") drawLatticeTower(node);
        else if (node.type === "pole") drawPole(node);
        else if (node.type === "substation") drawSubstation(node);
      });

      // 5. DRAW SUSPENDED CATENARY TRANSMISSION LINES & SMOOTH CONTINUOUS MICRO-PULSES
      spans.forEach((span, sIdx) => {
        const fromNode = towerNodes.find((n) => n.id === span.fromNodeId);
        const toNode = towerNodes.find((n) => n.id === span.toNodeId);
        if (!fromNode || !toNode) return;

        const pStart = fromNode.conductorAttachments[span.fromAttachIdx] || fromNode.peakPos;
        const pEnd = toNode.conductorAttachments[span.toAttachIdx] || toNode.peakPos;
        if (!pStart || !pEnd) return;

        // Continuous mathematical catenary point evaluator
        const getCatenaryPoint = (t: number): Point2D => {
          const lx = pStart.x + (pEnd.x - pStart.x) * t;
          const ly = pStart.y + (pEnd.y - pStart.y) * t;
          const sagOffset = span.sag * scale * 4 * t * (1 - t);
          return { x: lx, y: ly + sagOffset };
        };

        // Draw parabolic catenary curve line with 24 smooth sub-segments
        const segments = 24;
        ctx.strokeStyle = span.pulseActive ? (span.pulseColor || activePulseColor) : catenaryStroke;
        ctx.lineWidth = span.pulseActive ? 1.3 : 0.7;
        ctx.beginPath();
        const startPt = getCatenaryPoint(0);
        ctx.moveTo(startPt.x, startPt.y);
        for (let i = 1; i <= segments; i++) {
          const pt = getCatenaryPoint(i / segments);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();

        // Smooth continuous 60fps micro-pulse motion (no index stepping / quantization)
        span.pulseProgress1 = (span.pulseProgress1 + span.pulseSpeed) % 1;
        span.pulseProgress2 = (span.pulseProgress2 + span.pulseSpeed) % 1;

        const pulseColor = span.pulseActive ? (span.pulseColor || activePulseColor) : activePulseColor;

        // Draw continuous smooth pulses with comet tail
        [span.pulseProgress1, span.pulseProgress2].forEach((prog) => {
          const head = getCatenaryPoint(prog);
          const tail = getCatenaryPoint(Math.max(0, prog - 0.045));

          // Fluid comet spark tail
          ctx.strokeStyle = pulseColor;
          ctx.lineWidth = span.pulseActive ? 1.5 : 1.0;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();

          // Sub-pixel pulse head bead
          ctx.fillStyle = pulseColor;
          ctx.beginPath();
          ctx.arc(head.x, head.y, span.pulseActive ? 2.4 * scale : 1.5 * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        // Hover proximity detection along catenary wire
        if (pointer.active) {
          const midPt = getCatenaryPoint(0.5);
          const dist = Math.hypot(pointer.x - midPt.x, pointer.y - midPt.y);
          if (dist < 36 && !span.pulseActive) {
            triggerFault(sIdx);
          }
        }
      });

      // 6. CURSOR TETHERING (Razor-sharp dynamic links without text tags)
      if (pointer.active) {
        const tetherTargets: { pos: Point2D; dist: number }[] = [];

        towerNodes.forEach((node) => {
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
          ctx.lineWidth = 0.65;
          ctx.setLineDash([3, 3]);

          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(target.pos.x, target.pos.y);
          ctx.stroke();

          // Node anchor highlight point
          ctx.setLineDash([]);
          ctx.fillStyle = highlightStroke;
          ctx.beginPath();
          ctx.arc(target.pos.x, target.pos.y, 2.2 * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        // Pointer crosshair reticle
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(pointer.x - 7, pointer.y);
        ctx.lineTo(pointer.x + 7, pointer.y);
        ctx.moveTo(pointer.x, pointer.y - 7);
        ctx.lineTo(pointer.x, pointer.y + 7);
        ctx.arc(pointer.x, pointer.y, 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7. OCCASIONAL SUBTLE FAULT PULSE (pure visual wire excitation, no text alerts)
      const timeSinceFault = Date.now() - lastFaultTime;
      if (timeSinceFault > 9000) {
        lastFaultTime = Date.now();
        const randSpanIdx = Math.floor(Math.random() * spans.length);
        triggerFault(randSpanIdx);
      }

      spans.forEach((span) => {
        if (span.pulseActive && Math.random() < 0.02) {
          span.pulseActive = false;
        }
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", onPointerMove as EventListener);
      container.removeEventListener("mouseleave", onPointerLeave as EventListener);
    };
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-auto z-0"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
