"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme-context";

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Point2D {
  x: number;
  y: number;
}

interface TowerNode {
  id: string;
  name: string;
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
  voltage: string;
  pulseProgress?: number;
  pulseActive?: boolean;
  pulseColor?: string;
}

export function HairlineTransmissionGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const [activeTelemetry, setActiveTelemetry] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Pointer state
    const pointer = {
      x: -9999,
      y: -9999,
      active: false,
      targetX: -9999,
      targetY: -9999,
    };

    // Telemetry pulse tracker
    let lastFaultTime = Date.now();
    let faultLabelTimer: NodeJS.Timeout | null = null;

    // Handle high-DPI resize
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

    // Isometric projection: 30-degree isometric mapping
    // isoX = (x - y) * cos(30°)
    // isoY = (x + y) * sin(30°) - z
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

    // Transmission network definitions
    const towerNodes: TowerNode[] = [
      // Left high-voltage lattice tower (400kV Trunk)
      {
        id: "T1",
        name: "TWR-401A",
        type: "lattice",
        baseX: -340,
        baseY: -40,
        floatPhase: 0.2,
        floatSpeed: 0.0011,
        floatAmp: 7.5,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // Far-left distribution pole (11kV feeder)
      {
        id: "P1",
        name: "POLE-11-04",
        type: "pole",
        baseX: -460,
        baseY: 180,
        floatPhase: 1.8,
        floatSpeed: 0.0014,
        floatAmp: 5.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // Right high-voltage lattice tower (220kV Feeder Interconnect)
      {
        id: "T2",
        name: "TWR-220B",
        type: "lattice",
        baseX: 360,
        baseY: -80,
        floatPhase: 3.1,
        floatSpeed: 0.00095,
        floatAmp: 8.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // Lower-right primary substation transformer bank
      {
        id: "S1",
        name: "SUB-ANG-33kV",
        type: "substation",
        baseX: 330,
        baseY: 210,
        floatPhase: 4.5,
        floatSpeed: 0.0008,
        floatAmp: 4.5,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // Far-right distribution pole
      {
        id: "P2",
        name: "POLE-33-09",
        type: "pole",
        baseX: 520,
        baseY: 80,
        floatPhase: 5.2,
        floatSpeed: 0.0013,
        floatAmp: 6.0,
        currentZOffset: 0,
        conductorAttachments: [],
      },
      // Background intermediate tower
      {
        id: "T3",
        name: "TWR-401B",
        type: "lattice",
        baseX: -60,
        baseY: -280,
        floatPhase: 2.3,
        floatSpeed: 0.001,
        floatAmp: 6.5,
        currentZOffset: 0,
        conductorAttachments: [],
      },
    ];

    // Catenary transmission spans connecting the network
    const spans: CatenarySpan[] = [
      {
        fromNodeId: "T1",
        fromAttachIdx: 0,
        toNodeId: "T3",
        toAttachIdx: 0,
        sag: 22,
        voltage: "400kV",
        pulseProgress: 0.25,
      },
      {
        fromNodeId: "T1",
        fromAttachIdx: 1,
        toNodeId: "T3",
        toAttachIdx: 1,
        sag: 20,
        voltage: "400kV",
        pulseProgress: 0.65,
      },
      {
        fromNodeId: "T3",
        fromAttachIdx: 0,
        toNodeId: "T2",
        toAttachIdx: 0,
        sag: 26,
        voltage: "400kV",
        pulseProgress: 0.45,
      },
      {
        fromNodeId: "T3",
        fromAttachIdx: 1,
        toNodeId: "T2",
        toAttachIdx: 1,
        sag: 24,
        voltage: "400kV",
        pulseProgress: 0.85,
      },
      {
        fromNodeId: "T1",
        fromAttachIdx: 2,
        toNodeId: "P1",
        toAttachIdx: 0,
        sag: 16,
        voltage: "11kV",
        pulseProgress: 0.1,
      },
      {
        fromNodeId: "T2",
        fromAttachIdx: 1,
        toNodeId: "S1",
        toAttachIdx: 0,
        sag: 19,
        voltage: "33kV",
        pulseProgress: 0.35,
      },
      {
        fromNodeId: "T2",
        fromAttachIdx: 2,
        toNodeId: "S1",
        toAttachIdx: 1,
        sag: 18,
        voltage: "33kV",
        pulseProgress: 0.72,
      },
      {
        fromNodeId: "S1",
        fromAttachIdx: 1,
        toNodeId: "P2",
        toAttachIdx: 0,
        sag: 15,
        voltage: "33kV",
        pulseProgress: 0.55,
      },
    ];

    // Trigger an ADMS fault ripple across a span
    const triggerFault = (spanIdx: number, reason: string) => {
      const span = spans[spanIdx];
      if (!span) return;
      span.pulseActive = true;
      span.pulseColor = Math.random() > 0.4 ? "#f59e0b" : "#10b981"; // Amber or Signal Emerald

      setActiveTelemetry(reason);
      if (faultLabelTimer) clearTimeout(faultLabelTimer);
      faultLabelTimer = setTimeout(() => {
        setActiveTelemetry(null);
      }, 2600);
    };

    let startTime = performance.now();

    // Render loop
    const render = (now: number) => {
      const isDark = theme === "dark" || document.documentElement.classList.contains("dark");

      // Smooth pointer interpolation
      if (pointer.active) {
        pointer.x += (pointer.targetX - pointer.x) * 0.15;
        pointer.y += (pointer.targetY - pointer.y) * 0.15;
      } else {
        pointer.x = -9999;
        pointer.y = -9999;
      }

      // Dynamic theme palettes
      // Hairline style: razor-sharp single stroke, 0.5px - 1px width
      const bg = isDark ? "#050608" : "#f8fafc";
      const gridLine = isDark ? "rgba(30, 41, 59, 0.35)" : "rgba(226, 232, 240, 0.8)";
      const axisGuide = isDark ? "rgba(45, 212, 191, 0.12)" : "rgba(13, 148, 136, 0.15)";
      const lineStroke = isDark ? "rgba(148, 163, 184, 0.45)" : "rgba(51, 65, 85, 0.55)";
      const latticeStroke = isDark ? "rgba(94, 234, 212, 0.65)" : "rgba(30, 41, 59, 0.75)";
      const highlightStroke = isDark ? "#2dd4bf" : "#0d9488";
      const catenaryStroke = isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(71, 85, 105, 0.7)";
      const tetherStroke = isDark ? "rgba(45, 212, 191, 0.7)" : "rgba(13, 148, 136, 0.75)";
      const textDim = isDark ? "rgba(148, 163, 184, 0.5)" : "rgba(100, 116, 139, 0.7)";
      const activePulseColor = isDark ? "#00f5d4" : "#059669";

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. CLEAR CANVAS
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const originX = width / 2;
      const originY = height / 2 + 30;
      const scale = Math.min(width, height) / 840;

      // 2. ISOMETRIC SUBSTATION GROUND MATRIX & GRID GUIDES
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = gridLine;

      const gridSize = 36;
      const gridExtent = 720;

      // Draw subtle isometric grid lines
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
      ctx.setLineDash([4, 4]);
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

      // 3. ZERO-GRAVITY FLOATING PHYSICS UPDATE
      towerNodes.forEach((node) => {
        const elapsed = now * node.floatSpeed + node.floatPhase;
        node.currentZOffset = Math.sin(elapsed) * node.floatAmp;
        node.conductorAttachments = [];
      });

      // 4. DRAW 3D TRANSMISSION STRUCTURES
      // Function to draw a 4-leg high-voltage lattice transmission tower
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

        // 4 Footing pads on ground plane
        const footings: Point2D[] = [
          project(bx - baseHalfWidth, by - baseHalfWidth, bz, originX, originY, scale),
          project(bx + baseHalfWidth, by - baseHalfWidth, bz, originX, originY, scale),
          project(bx + baseHalfWidth, by + baseHalfWidth, bz, originX, originY, scale),
          project(bx - baseHalfWidth, by + baseHalfWidth, bz, originX, originY, scale),
        ];

        // Waist level nodes
        const waistNodes: Point2D[] = [
          project(bx - waistHalfWidth, by - waistHalfWidth, bz + waistHeight, originX, originY, scale),
          project(bx + waistHalfWidth, by - waistHalfWidth, bz + waistHeight, originX, originY, scale),
          project(bx + waistHalfWidth, by + waistHalfWidth, bz + waistHeight, originX, originY, scale),
          project(bx - waistHalfWidth, by + waistHalfWidth, bz + waistHeight, originX, originY, scale),
        ];

        // Mid-waist cross-bracing level
        const midNodes: Point2D[] = [
          project(bx - baseHalfWidth * 0.55, by - baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
          project(bx + baseHalfWidth * 0.55, by - baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
          project(bx + baseHalfWidth * 0.55, by + baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
          project(bx - baseHalfWidth * 0.55, by + baseHalfWidth * 0.55, bz + waistHeight * 0.5, originX, originY, scale),
        ];

        // Crossarm 1 (Lower)
        const armLeft1 = project(bx - crossarmSpan1, by, bz + crossarmHeight1, originX, originY, scale);
        const armRight1 = project(bx + crossarmSpan1, by, bz + crossarmHeight1, originX, originY, scale);
        const armCenter1 = project(bx, by, bz + crossarmHeight1, originX, originY, scale);

        // Crossarm 2 (Upper)
        const armLeft2 = project(bx - crossarmSpan2, by, bz + crossarmHeight2, originX, originY, scale);
        const armRight2 = project(bx + crossarmSpan2, by, bz + crossarmHeight2, originX, originY, scale);
        const armCenter2 = project(bx, by, bz + crossarmHeight2, originX, originY, scale);

        // Peak top groundwire spire
        const peak = project(bx, by, bz + peakHeight, originX, originY, scale);
        node.peakPos = peak;
        node.screenPos = project(bx, by, bz + waistHeight, originX, originY, scale);

        // Insulator strings (hanging down 8px from arm ends)
        const insLeft1: Point2D = { x: armLeft1.x, y: armLeft1.y + 10 * scale };
        const insRight1: Point2D = { x: armRight1.x, y: armRight1.y + 10 * scale };
        const insLeft2: Point2D = { x: armLeft2.x, y: armLeft2.y + 9 * scale };

        node.conductorAttachments = [insLeft1, insRight1, insLeft2];

        // Draw footing square
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(footings[0].x, footings[0].y);
        ctx.lineTo(footings[1].x, footings[1].y);
        ctx.lineTo(footings[2].x, footings[2].y);
        ctx.lineTo(footings[3].x, footings[3].y);
        ctx.closePath();
        ctx.stroke();

        // Tower primary legs
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(footings[i].x, footings[i].y);
          ctx.lineTo(waistNodes[i].x, waistNodes[i].y);
          ctx.lineTo(peak.x, peak.y);
        }
        ctx.stroke();

        // Diagonal lattice X-braces
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          // Lower X-brace
          ctx.moveTo(footings[i].x, footings[i].y);
          ctx.lineTo(midNodes[next].x, midNodes[next].y);
          ctx.moveTo(footings[next].x, footings[next].y);
          ctx.lineTo(midNodes[i].x, midNodes[i].y);

          // Upper X-brace to waist
          ctx.moveTo(midNodes[i].x, midNodes[i].y);
          ctx.lineTo(waistNodes[next].x, waistNodes[next].y);
          ctx.moveTo(midNodes[next].x, midNodes[next].y);
          ctx.lineTo(waistNodes[i].x, waistNodes[i].y);
        }
        ctx.stroke();

        // Crossarms and cantilever struts
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        // Lower crossarm
        ctx.moveTo(armLeft1.x, armLeft1.y);
        ctx.lineTo(armRight1.x, armRight1.y);
        ctx.moveTo(armLeft1.x, armLeft1.y);
        ctx.lineTo(armCenter2.x, armCenter2.y);
        ctx.moveTo(armRight1.x, armRight1.y);
        ctx.lineTo(armCenter2.x, armCenter2.y);

        // Upper crossarm
        ctx.moveTo(armLeft2.x, armLeft2.y);
        ctx.lineTo(armRight2.x, armRight2.y);
        ctx.moveTo(armLeft2.x, armLeft2.y);
        ctx.lineTo(peak.x, peak.y);
        ctx.moveTo(armRight2.x, armRight2.y);
        ctx.lineTo(peak.x, peak.y);
        ctx.stroke();

        // Insulator strings (micro-ladder / disks)
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        [insLeft1, insRight1, insLeft2].forEach((ins, idx) => {
          const armEnd = idx === 0 ? armLeft1 : idx === 1 ? armRight1 : armLeft2;
          ctx.moveTo(armEnd.x, armEnd.y);
          ctx.lineTo(ins.x, ins.y);
          // Small insulator disc
          ctx.arc(ins.x, ins.y, 1.5 * scale, 0, Math.PI * 2);
        });
        ctx.stroke();

        // Tower peak light / tag
        ctx.fillStyle = highlightStroke;
        ctx.beginPath();
        ctx.arc(peak.x, peak.y, 1.8 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Subtle node label
        ctx.font = "9px monospace";
        ctx.fillStyle = textDim;
        ctx.fillText(node.name, peak.x + 6, peak.y - 4);
      };

      // Function to draw a distribution utility pole
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
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Crossarm
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(armLeft.x, armLeft.y);
        ctx.lineTo(armRight.x, armRight.y);
        ctx.stroke();

        // Transformer drum silhouette on side
        const transCanTop = project(bx + 6, by - 6, bz + poleHeight - 24, originX, originY, scale);
        const transCanBot = project(bx + 6, by - 6, bz + poleHeight - 40, originX, originY, scale);
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.65;
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
        ctx.arc(armLeft.x, armLeft.y, 1.4 * scale, 0, Math.PI * 2);
        ctx.arc(armRight.x, armRight.y, 1.4 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "8px monospace";
        ctx.fillStyle = textDim;
        ctx.fillText(node.name, top.x + 5, top.y - 3);
      };

      // Function to draw a substation transformer bank
      const drawSubstation = (node: TowerNode) => {
        const bx = node.baseX;
        const by = node.baseY;
        const bz = node.currentZOffset;

        const hw = 30; // half width
        const hd = 22; // half depth
        const th = 40; // transformer tank height

        // 8 vertices of transformer enclosure prism
        const b00 = project(bx - hw, by - hd, bz, originX, originY, scale);
        const b10 = project(bx + hw, by - hd, bz, originX, originY, scale);
        const b11 = project(bx + hw, by + hd, bz, originX, originY, scale);
        const b01 = project(bx - hw, by + hd, bz, originX, originY, scale);

        const t00 = project(bx - hw, by - hd, bz + th, originX, originY, scale);
        const t10 = project(bx + hw, by - hd, bz + th, originX, originY, scale);
        const t11 = project(bx + hw, by + hd, bz + th, originX, originY, scale);
        const t01 = project(bx - hw, by + hd, bz + th, originX, originY, scale);

        // Transformer deck center
        const deckCenter = project(bx, by, bz + th, originX, originY, scale);
        node.peakPos = deckCenter;
        node.screenPos = deckCenter;

        // Bushings (high voltage porcelain horns)
        const bushing1 = project(bx - 12, by, bz + th + 26, originX, originY, scale);
        const bushing2 = project(bx + 12, by, bz + th + 26, originX, originY, scale);
        node.conductorAttachments = [bushing1, bushing2];

        // Base perimeter
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(b00.x, b00.y);
        ctx.lineTo(b10.x, b10.y);
        ctx.lineTo(b11.x, b11.y);
        ctx.lineTo(b01.x, b01.y);
        ctx.closePath();
        ctx.stroke();

        // Vertical edges
        ctx.strokeStyle = latticeStroke;
        ctx.lineWidth = 0.8;
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
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(t00.x, t00.y);
        ctx.lineTo(t10.x, t10.y);
        ctx.lineTo(t11.x, t11.y);
        ctx.lineTo(t01.x, t01.y);
        ctx.closePath();
        ctx.stroke();

        // Radiator cooling fins (vertical parallel ribs on side)
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
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        const bBase1 = project(bx - 12, by, bz + th, originX, originY, scale);
        const bBase2 = project(bx + 12, by, bz + th, originX, originY, scale);
        ctx.moveTo(bBase1.x, bBase1.y);
        ctx.lineTo(bushing1.x, bushing1.y);
        ctx.moveTo(bBase2.x, bBase2.y);
        ctx.lineTo(bushing2.x, bushing2.y);
        ctx.stroke();

        // Corona toroidal rings
        ctx.beginPath();
        ctx.arc(bushing1.x, bushing1.y, 2.2 * scale, 0, Math.PI * 2);
        ctx.arc(bushing2.x, bushing2.y, 2.2 * scale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = "8px monospace";
        ctx.fillStyle = textDim;
        ctx.fillText(node.name, deckCenter.x + 8, deckCenter.y - 12);
      };

      // Draw all structures
      towerNodes.forEach((node) => {
        if (node.type === "lattice") drawLatticeTower(node);
        else if (node.type === "pole") drawPole(node);
        else if (node.type === "substation") drawSubstation(node);
      });

      // 5. DRAW SUSPENDED CATENARY TRANSMISSION LINES & TELEMETRY PULSES
      spans.forEach((span, sIdx) => {
        const fromNode = towerNodes.find((n) => n.id === span.fromNodeId);
        const toNode = towerNodes.find((n) => n.id === span.toNodeId);
        if (!fromNode || !toNode) return;

        const pStart = fromNode.conductorAttachments[span.fromAttachIdx] || fromNode.peakPos;
        const pEnd = toNode.conductorAttachments[span.toAttachIdx] || toNode.peakPos;
        if (!pStart || !pEnd) return;

        // Draw parabolic catenary curve
        const segments = 16;
        const curvePoints: Point2D[] = [];

        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          // Linear interpolation between start and end
          const lx = pStart.x + (pEnd.x - pStart.x) * t;
          const ly = pStart.y + (pEnd.y - pStart.y) * t;
          // Sag factor: maximum at t = 0.5
          const sagOffset = span.sag * scale * 4 * t * (1 - t);
          curvePoints.push({ x: lx, y: ly + sagOffset });
        }

        // Draw the catenary wire
        ctx.strokeStyle = span.pulseActive ? (span.pulseColor || activePulseColor) : catenaryStroke;
        ctx.lineWidth = span.pulseActive ? 1.4 : 0.75;
        ctx.beginPath();
        ctx.moveTo(curvePoints[0].x, curvePoints[0].y);
        for (let i = 1; i <= segments; i++) {
          ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
        }
        ctx.stroke();

        // Micro-pulse animation along the transmission wire
        if (span.pulseProgress === undefined) span.pulseProgress = (sIdx * 0.2) % 1;
        span.pulseProgress = (span.pulseProgress + 0.003) % 1;

        // Calculate current pulse point on catenary
        const pulseIdx = Math.floor(span.pulseProgress * (curvePoints.length - 1));
        const pulsePt = curvePoints[pulseIdx];

        if (pulsePt) {
          ctx.fillStyle = span.pulseActive ? (span.pulseColor || activePulseColor) : activePulseColor;
          ctx.beginPath();
          ctx.arc(pulsePt.x, pulsePt.y, span.pulseActive ? 2.8 * scale : 1.6 * scale, 0, Math.PI * 2);
          ctx.fill();

          // Small trailing spark
          const prevIdx = Math.max(0, pulseIdx - 2);
          const prevPt = curvePoints[prevIdx];
          ctx.strokeStyle = activePulseColor;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(pulsePt.x, pulsePt.y);
          ctx.lineTo(prevPt.x, prevPt.y);
          ctx.stroke();
        }

        // Check if pointer is hovering close to this span
        if (pointer.active) {
          const midPt = curvePoints[Math.floor(segments / 2)];
          const dist = Math.hypot(pointer.x - midPt.x, pointer.y - midPt.y);
          if (dist < 40 && !span.pulseActive) {
            triggerFault(
              sIdx,
              `SCADA TELEMETRY: ${span.voltage} LINK [${fromNode.name} -> ${toNode.name}] ACTIVE`
            );
          }
        }
      });

      // 6. CURSOR TETHERING (Antigravity interactive dynamic links)
      if (pointer.active) {
        // Collect candidate nodes (tower peaks & attachments)
        const tetherTargets: { pos: Point2D; name: string; dist: number }[] = [];

        towerNodes.forEach((node) => {
          if (node.peakPos) {
            const d = Math.hypot(pointer.x - node.peakPos.x, pointer.y - node.peakPos.y);
            tetherTargets.push({ pos: node.peakPos, name: node.name, dist: d });
          }
          node.conductorAttachments.forEach((att, aIdx) => {
            const d = Math.hypot(pointer.x - att.x, pointer.y - att.y);
            tetherTargets.push({ pos: att, name: `${node.name}-A${aIdx}`, dist: d });
          });
        });

        // Sort by distance and tether to nearest 2-3 nodes
        tetherTargets.sort((a, b) => a.dist - b.dist);
        const maxTetherRadius = 260;
        const nearest = tetherTargets.filter((t) => t.dist < maxTetherRadius).slice(0, 3);

        nearest.forEach((target) => {
          const alpha = 1 - target.dist / maxTetherRadius;
          ctx.strokeStyle = tetherStroke;
          ctx.lineWidth = 0.7;
          ctx.setLineDash([3, 3]);

          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(target.pos.x, target.pos.y);
          ctx.stroke();

          // Anchor point at node
          ctx.setLineDash([]);
          ctx.fillStyle = highlightStroke;
          ctx.beginPath();
          ctx.arc(target.pos.x, target.pos.y, 2.5 * scale, 0, Math.PI * 2);
          ctx.fill();

          // Distance read-out hairline label
          if (target.dist > 30) {
            const midX = (pointer.x + target.pos.x) / 2;
            const midY = (pointer.y + target.pos.y) / 2;
            ctx.font = "8px monospace";
            ctx.fillStyle = textDim;
            ctx.fillText(`${Math.round(target.dist)}m`, midX + 4, midY - 2);
          }
        });

        // Pointer crosshair reticle
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        // Crosshairs
        ctx.moveTo(pointer.x - 8, pointer.y);
        ctx.lineTo(pointer.x + 8, pointer.y);
        ctx.moveTo(pointer.x, pointer.y - 8);
        ctx.lineTo(pointer.x, pointer.y + 8);
        // Small ring
        ctx.arc(pointer.x, pointer.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7. OCCASIONAL AUTOMATED FAULT SIMULATION (every 8.5 seconds)
      const timeSinceFault = Date.now() - lastFaultTime;
      if (timeSinceFault > 8500) {
        lastFaultTime = Date.now();
        const randSpanIdx = Math.floor(Math.random() * spans.length);
        const targetSpan = spans[randSpanIdx];
        const reason = `ADMS EVENT: ANSI 87L WAVE TRIP @ ${targetSpan.fromNodeId}-${targetSpan.toNodeId} (ΔI=0.38A)`;
        triggerFault(randSpanIdx, reason);
      }

      // Reset any active fault pulses after duration
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
      if (faultLabelTimer) clearTimeout(faultLabelTimer);
    };
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-auto z-0"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Floating Telemetry HUD Pill (Micro-pulse indicator) */}
      {activeTelemetry && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1 bg-white/90 dark:bg-black/90 border border-emerald-500/50 dark:border-teal-500/50 shadow-md backdrop-blur-md rounded-xs flex items-center gap-2 pointer-events-none transition-all animate-pulse">
          <div className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-teal-400" />
          <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-700 dark:text-teal-300">
            {activeTelemetry}
          </span>
        </div>
      )}
    </div>
  );
}
