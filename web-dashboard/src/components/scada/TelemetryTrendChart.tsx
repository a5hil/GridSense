"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  Flame,
  Gauge,
  GitBranch,
  Layers,
  Pause,
  Play,
  Radio,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { HistoricalTelemetryPoint } from "@/lib/types";
import { NetworkSnapshot } from "@/lib/network/types";

export interface PolyphaseHistoricalPoint {
  timeLabel: string;
  vR: number;
  vY: number;
  vB: number;
  iR: number;
  iY: number;
  iB: number;
  iNeutral: number;
  pR: number;
  pY: number;
  pB: number;
  pTotal: number;
  pfR: number;
  pfY: number;
  pfB: number;
  vUnb: number;
  iUnb: number;
}

interface TelemetryTrendChartProps {
  history: HistoricalTelemetryPoint[];
  tripLimit?: number;
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export const TelemetryTrendChart = React.memo(function TelemetryTrendChart({
  history,
  tripLimit = 0.35,
  isFrozen: controlledFrozen,
  onToggleFreeze,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: TelemetryTrendChartProps) {
  // Helper to determine if a pole ID refers to a digital twin pole
  const isTwinPole = (id?: string) => {
    if (!id) return false;
    const upper = id.toUpperCase();
    return (
      upper.startsWith("F1") ||
      upper.startsWith("F2") ||
      upper.startsWith("F3") ||
      upper.startsWith("LT") ||
      upper.includes("-P")
    );
  };

  // Waveform Scope: Physical P1/P2 Differential Anchor vs 3-Phase Polyphase Digital Twin Pole
  const [channelScope, setChannelScope] = React.useState<"ANCHOR" | "POLYPHASE">(() => {
    return isTwinPole(selectedPoleId) ? "POLYPHASE" : "ANCHOR";
  });
  const [activePoleId, setActivePoleId] = React.useState<string>(selectedPoleId || "F1-P01");
  const prevPoleRef = React.useRef<string>(selectedPoleId || "F1-P01");
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!selectedPoleId) return;
    setActivePoleId(selectedPoleId);
    if (isTwinPole(selectedPoleId)) {
      setChannelScope("POLYPHASE");
    }
  }, [selectedPoleId]);

  // Freeze / Buffer Capture State
  const [localFrozen, setLocalFrozen] = React.useState(false);
  const isFrozen = controlledFrozen !== undefined ? controlledFrozen : localFrozen;
  const [frozenBuffer, setFrozenBuffer] = React.useState<HistoricalTelemetryPoint[]>([]);
  const [frozenTime, setFrozenTime] = React.useState<string>("");

  const handleToggleFreeze = () => {
    if (!isFrozen) {
      setFrozenBuffer([...history]);
      setFrozenTime(new Date().toLocaleTimeString());
    }
    if (onToggleFreeze) {
      onToggleFreeze();
    } else {
      setLocalFrozen(!localFrozen);
    }
  };

  React.useEffect(() => {
    if (isFrozen && frozenBuffer.length === 0 && history.length > 0) {
      setFrozenBuffer([...history]);
      setFrozenTime(new Date().toLocaleTimeString());
    } else if (!isFrozen && frozenBuffer.length > 0) {
      setFrozenBuffer([]);
    }
  }, [isFrozen, history]);

  const rawData = isFrozen
    ? frozenBuffer.length > 0
      ? frozenBuffer
      : history
    : history.length > 0
    ? history
    : [];

  const handleExportWaveformCsv = () => {
    if (channelScope === "ANCHOR") {
      if (data.length === 0) return;
      const headers = [
        "Timestamp",
        "Time_Label",
        "V1_Incomer_V",
        "V2_Outgoing_V",
        "VDrop_Span_V",
        "I1_Incomer_A",
        "I2_Outgoing_A",
        "IDiff_Abs_A",
        "Trip_Limit_A",
        "P1_Incomer_W",
        "P2_Outgoing_W",
        "PLoss_Span_W",
        "PF1",
        "PF2",
        "Freq_Hz",
        "Is_Fault",
      ];
      const rows = data.map((d) => [
        `"${d.timestamp || ""}"`,
        `"${d.timeLabel}"`,
        d.v1,
        d.v2,
        d.vDrop ?? 0,
        d.i1,
        d.i2,
        d.idiff,
        tripLimit,
        d.p1 ?? 0,
        d.p2 ?? 0,
        d.pLoss ?? 0,
        d.pf1 ?? 0.96,
        d.pf2 ?? 0.96,
        d.freq1 ?? 50.0,
        d.isFault ? "TRUE" : "FALSE",
      ]);
      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `gridsense_ansi87l_differential_${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-")}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (polyHistory.length === 0) return;
    const headers = [
      "Timestamp",
      "Pole_ID",
      "VR_V",
      "VY_V",
      "VB_V",
      "V_Unb_Pct",
      "IR_A",
      "IY_A",
      "IB_A",
      "IN_A",
      "I_Unb_Pct",
      "PR_W",
      "PY_W",
      "PB_W",
      "PTotal_W",
      "PFR",
      "PFY",
      "PFB",
    ];
    const rows = polyHistory.map((p) => [
      `"${p.timeLabel}"`,
      `"${activeNode?.id || activePoleId}"`,
      p.vR,
      p.vY,
      p.vB,
      p.vUnb,
      p.iR,
      p.iY,
      p.iB,
      p.iNeutral,
      p.iUnb,
      p.pR,
      p.pY,
      p.pB,
      p.pTotal,
      p.pfR,
      p.pfY,
      p.pfB,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `gridsense_waveform_${(activeNode?.id || activePoleId).toLowerCase()}_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Enforce Radial Line Physics (V1 >= V2), strictly derived ΔI = |I1 - I2|, and direct data passthrough for ΔP = Math.max(0, P1 - P2) and ΔV = Math.max(0, V1 - V2)
  const data = React.useMemo(() => {
    // 1. First pass: compute clean physical electrical variables for each point
    const points = rawData.map((d) => {
      const v1 = Number(d.v1.toFixed(1));
      let v2 = Number(d.v2.toFixed(1));
      if (v1 > 10 && v2 > v1) {
        v2 = v1;
      }

      const i1 = Number(d.i1.toFixed(3));
      let i2 = Number(d.i2.toFixed(3));

      // Strict Current Differential: ΔI strictly equals |I1 - I2| on every tick
      const idiff = Number(Math.abs(i1 - i2).toFixed(3));

      const pf1 = d.pf1 !== undefined && d.pf1 > 0 ? d.pf1 : 0.96;
      const pf2 = d.pf2 !== undefined && d.pf2 > 0 ? d.pf2 : 0.96;

      // Active Power directly derived from stable V and I lines:
      const p1 = Number((v1 * i1 * pf1).toFixed(1));
      let p2 = Number((v2 * i2 * pf2).toFixed(1));
      if (p1 > 0 && p2 > p1) {
        p2 = p1;
      }

      return {
        ...d,
        v1,
        v2,
        i1,
        i2,
        idiff,
        p1,
        p2,
      };
    });

    // 2. Compute true physical line loss and span drop for every point
    const mapped = points.map((p) => {
      const pLoss = Number(Math.max(0, p.p1 - p.p2).toFixed(1));
      const vDrop = Number(Math.max(0, p.v1 - p.v2).toFixed(1));
      return {
        ...p,
        pLoss,
        vDrop,
      };
    });

    // 3. Apply a 3-point moving average to filter ADC quantization noise while preserving true dynamics
    if (mapped.length < 3) return mapped;
    return mapped.map((p, idx, arr) => {
      if (idx === 0 || idx === arr.length - 1 || p.isFault) return p;
      const prev = arr[idx - 1];
      const next = arr[idx + 1];
      if (prev.isFault || next.isFault) return p;

      return {
        ...p,
        pLoss: Number(((prev.pLoss + p.pLoss + next.pLoss) / 3).toFixed(1)),
        vDrop: Number(((prev.vDrop + p.vDrop + next.vDrop) / 3).toFixed(1)),
      };
    });
  }, [rawData, tripLimit]);

  // Helper to compute min, max, avg, current
  const calcStats = (vals: number[]) => {
    if (vals.length === 0) return { min: 0, max: 0, avg: 0, cur: 0 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const cur = vals[vals.length - 1];
    return { min, max, avg, cur };
  };

  // Hover data point (only shown when actively inspecting with crosshair)
  const hoveredPoint =
    hoverIndex !== null && data[hoverIndex]
      ? data[hoverIndex]
      : null;

  // Optimized High-Resolution Sizing for 2x2 Grid (1:1 isotropic aspect ratio)
  const svgWidth = 760;
  const svgHeight = 250;
  const padding = { top: 22, right: 42, bottom: 28, left: 58 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left;
    return padding.left + (index / (data.length - 1)) * graphWidth;
  };

  const getYCoord = (val: number, minY: number, maxY: number) => {
    if (maxY === minY) return padding.top + graphHeight / 2;
    return padding.top + graphHeight - ((val - minY) / (maxY - minY)) * graphHeight;
  };

  // Generic Line Path Generator
  const generatePath = (
    valExtractor: (d: HistoricalTelemetryPoint) => number,
    minY: number,
    maxY: number
  ) => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const val = valExtractor(d);
        const y = getYCoord(val, minY, maxY);
        const x = getX(i);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  // Generic Area Path Generator (Filled gradient under curves)
  const generateAreaPath = (
    valExtractor: (d: HistoricalTelemetryPoint) => number,
    minY: number,
    maxY: number
  ) => {
    if (data.length === 0) return "";
    const linePath = data
      .map((d, i) => {
        const val = valExtractor(d);
        const y = getYCoord(val, minY, maxY);
        const x = getX(i);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    const firstX = getX(0).toFixed(1);
    const lastX = getX(data.length - 1).toFixed(1);
    const bottomY = (svgHeight - padding.bottom).toFixed(1);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // 5 Y-Axis Tick Percentages for High Precision
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // X-Axis Time Markers (40 samples @ 250ms = 10s sliding window)
  const xTimeMarkers = [
    { p: 0.0, label: "T-10s" },
    { p: 0.25, label: "T-7.5s" },
    { p: 0.5, label: "T-5.0s" },
    { p: 0.75, label: "T-2.5s" },
    { p: 1.0, label: "LIVE" },
  ];

  // ==========================================
  // 1. DATA SCALES: CURRENT & FAULT LEAKAGE
  // ==========================================
  const allI = data.flatMap((d) => [d.i1, d.i2, d.idiff, tripLimit]);
  const minI = Math.max(0, Math.floor(Math.min(...(allI.length ? allI : [0])) * 10) / 10 - 0.2);
  const maxI = Math.ceil((Math.max(...(allI.length ? allI : [3.0])) + 0.3) * 10) / 10;
  const pathI1 = generatePath((d) => d.i1, minI, maxI);
  const pathI2 = generatePath((d) => d.i2, minI, maxI);
  const pathIdiff = generatePath((d) => d.idiff, minI, maxI);
  const areaIdiff = generateAreaPath((d) => d.idiff, minI, maxI);
  const yTripLimit = getYCoord(tripLimit, minI, maxI);
  const statsI1 = calcStats(data.map((d) => d.i1));
  const statsI2 = calcStats(data.map((d) => d.i2));
  const statsIdiff = calcStats(data.map((d) => d.idiff));

  // ==========================================
  // 2. DATA SCALES: VOLTAGE & FREQUENCY
  // ==========================================
  const allV = data.flatMap((d) => [d.v1, d.v2, 207, 253]);
  const minV = Math.max(0, Math.floor(Math.min(...(allV.length ? allV : [200])) - 5));
  const maxV = Math.ceil(Math.max(...(allV.length ? allV : [260])) + 5);
  const pathV1 = generatePath((d) => d.v1, minV, maxV);
  const pathV2 = generatePath((d) => d.v2, minV, maxV);
  const yOverV = getYCoord(253, minV, maxV);
  const yUnderV = getYCoord(207, minV, maxV);
  const statsV1 = calcStats(data.map((d) => d.v1));
  const statsV2 = calcStats(data.map((d) => d.v2));
  const statsFreq = calcStats(data.map((d) => d.freq1 ?? 50.0));

  // ==========================================
  // 3. DATA SCALES: POWER TRIANGLE (P / Q / S)
  // ==========================================
  const allP = data.flatMap((d) => [
    (d.p1 ?? 0) / 1000,
    (d.q1 ?? 0) / 1000,
    (d.s1 ?? 0) / 1000,
  ]);
  const minP = Math.max(0, Math.floor(Math.min(...(allP.length ? allP : [0])) * 10) / 10);
  const maxP = Math.max(0.5, Math.ceil((Math.max(...(allP.length ? allP : [0.6])) + 0.1) * 10) / 10);
  const pathPActive = generatePath((d) => (d.p1 ?? 0) / 1000, minP, maxP);
  const areaPActive = generateAreaPath((d) => (d.p1 ?? 0) / 1000, minP, maxP);
  const pathQReactive = generatePath((d) => (d.q1 ?? 0) / 1000, minP, maxP);
  const pathSApparent = generatePath((d) => (d.s1 ?? 0) / 1000, minP, maxP);
  const statsP1 = calcStats(data.map((d) => (d.p1 ?? 0) / 1000));
  const statsQ1 = calcStats(data.map((d) => (d.q1 ?? 0) / 1000));
  const statsS1 = calcStats(data.map((d) => (d.s1 ?? 0) / 1000));
  const statsPf = calcStats(data.map((d) => d.pf1 ?? 0.96));

  // ==========================================
  // 4. DATA SCALES: LINE LOSS (W) & SPAN VOLTAGE DROP (V)
  // Strictly derived from V and I: ΔP = P1 - P2, ΔV = V1 - V2
  // ==========================================
  const minLossW = 0;
  const maxLossW = Math.max(12, Math.ceil(Math.max(...data.map((d) => d.pLoss ?? 0), 6) * 1.3));
  const minDropV = 0;
  const maxDropV = Math.max(1.5, Math.ceil(Math.max(...data.map((d) => d.vDrop ?? 0), 0.8) * 1.5 * 10) / 10);

  const pathLoss = generatePath((d) => d.pLoss ?? 0, minLossW, maxLossW);
  const areaLoss = generateAreaPath((d) => d.pLoss ?? 0, minLossW, maxLossW);
  const pathVDrop = generatePath((d) => d.vDrop ?? 0, minDropV, maxDropV);
  const statsLossW = calcStats(data.map((d) => d.pLoss ?? 0));
  const statsVDrop = calcStats(data.map((d) => d.vDrop ?? 0));

  // ==========================================
  // DIGITAL TWIN 3-PHASE POLYPHASE CALCULATIONS
  // ==========================================
  const activeNode = React.useMemo(() => {
    if (!networkSnapshot || networkSnapshot.nodes.length === 0) return null;
    const target = (activePoleId || "").trim().toLowerCase();
    const normalizeId = (id: string) => id.toLowerCase().replace(/([a-z0-9]+)-p0?(\d+)/i, "$1-p$2");
    const targetNorm = normalizeId(target);

    return (
      networkSnapshot.nodes.find((n) => {
        const nId = n.id.toLowerCase();
        if (nId === target) return true;
        if (normalizeId(nId) === targetNorm) return true;
        if (
          (target === "pole-a" || target === "pole 1" || target === "p1") &&
          (nId === "pole-a" || (n.isLive && nId.includes("a")))
        ) return true;
        if (
          (target === "pole-b" || target === "pole 2" || target === "p2") &&
          (nId === "pole-b" || (n.isLive && nId.includes("b")))
        ) return true;
        return false;
      }) || networkSnapshot.nodes[0]
    );
  }, [networkSnapshot, activePoleId]);

  const nodesByFeeder = React.useMemo(() => {
    if (!networkSnapshot) return { "LT-1": [], "LT-2": [], "LT-3": [] };
    return {
      "LT-1": networkSnapshot.nodes.filter((n) => n.feederId === "LT-1"),
      "LT-2": networkSnapshot.nodes.filter((n) => n.feederId === "LT-2"),
      "LT-3": networkSnapshot.nodes.filter((n) => n.feederId === "LT-3"),
    };
  }, [networkSnapshot]);

  const [polyHistory, setPolyHistory] = React.useState<PolyphaseHistoricalPoint[]>([]);

  // Track polyphase telemetry buffer
  React.useEffect(() => {
    if (!activeNode) return;
    const isNewPole = prevPoleRef.current.toLowerCase() !== activeNode.id.toLowerCase();
    if (isNewPole) {
      prevPoleRef.current = activeNode.id;
    }

    const vR = activeNode.phases.R.v;
    const vY = activeNode.phases.Y.v;
    const vB = activeNode.phases.B.v;
    const iR = activeNode.phases.R.i;
    const iY = activeNode.phases.Y.i;
    const iB = activeNode.phases.B.i;
    const pfR = activeNode.phases.R.pf || 0.96;
    const pfY = activeNode.phases.Y.pf || 0.96;
    const pfB = activeNode.phases.B.pf || 0.96;
    const pR = activeNode.phases.R.p > 0 ? activeNode.phases.R.p : (iR > 0 ? vR * iR * pfR : 0);
    const pY = activeNode.phases.Y.p > 0 ? activeNode.phases.Y.p : (iY > 0 ? vY * iY * pfY : 0);
    const pB = activeNode.phases.B.p > 0 ? activeNode.phases.B.p : (iB > 0 ? vB * iB * pfB : 0);

    const vAvg = (vR + vY + vB) / 3;
    const vMaxDev = Math.max(Math.abs(vR - vAvg), Math.abs(vY - vAvg), Math.abs(vB - vAvg));
    const vUnb = vAvg > 10 ? (vMaxDev / vAvg) * 100 : 0;

    const iAvg = (iR + iY + iB) / 3;
    const iMaxDev = Math.max(Math.abs(iR - iAvg), Math.abs(iY - iAvg), Math.abs(iB - iAvg));
    const iUnb = iAvg > 0.05 ? (iMaxDev / iAvg) * 100 : 0;

    // Neutral return current magnitude
    const iNeutral = Math.sqrt(
      Math.max(0, iR * iR + iY * iY + iB * iB - iR * iY - iY * iB - iB * iR)
    );

    const newPt: PolyphaseHistoricalPoint = {
      timeLabel: new Date().toLocaleTimeString(),
      vR: Number(vR.toFixed(1)),
      vY: Number(vY.toFixed(1)),
      vB: Number(vB.toFixed(1)),
      iR: Number(iR.toFixed(3)),
      iY: Number(iY.toFixed(3)),
      iB: Number(iB.toFixed(3)),
      iNeutral: Number(iNeutral.toFixed(3)),
      pR: Math.round(pR),
      pY: Math.round(pY),
      pB: Math.round(pB),
      pTotal: Math.round(pR + pY + pB),
      pfR: Number(pfR.toFixed(2)),
      pfY: Number(pfY.toFixed(2)),
      pfB: Number(pfB.toFixed(2)),
      vUnb: Number(vUnb.toFixed(2)),
      iUnb: Number(iUnb.toFixed(2)),
    };

    setPolyHistory((prev) => {
      if (isFrozen) return prev;
      if (isNewPole || prev.length === 0) {
        const seeded: PolyphaseHistoricalPoint[] = [];
        for (let i = 20; i >= 1; i--) {
          const jitter = Math.sin(i * 0.7) * 0.012;
          seeded.push({
            ...newPt,
            vR: Number((newPt.vR * (1 + jitter)).toFixed(1)),
            vY: Number((newPt.vY * (1 - jitter)).toFixed(1)),
            vB: Number((newPt.vB * (1 + jitter * 0.5)).toFixed(1)),
            iR: Number(Math.max(0, newPt.iR * (1 + jitter * 1.5)).toFixed(3)),
            iY: Number(Math.max(0, newPt.iY * (1 - jitter * 1.5)).toFixed(3)),
            iB: Number(Math.max(0, newPt.iB * (1 + jitter)).toFixed(3)),
            pR: Math.max(0, Math.round(newPt.pR * (1 + jitter))),
            pY: Math.max(0, Math.round(newPt.pY * (1 - jitter))),
            pB: Math.max(0, Math.round(newPt.pB * (1 + jitter * 0.8))),
            pTotal: Math.max(0, Math.round(newPt.pTotal * (1 + jitter * 0.6))),
            timeLabel: `T-${(i * 0.5).toFixed(1)}s`,
          });
        }
        return [...seeded, newPt];
      }
      return [...prev.slice(-39), newPt];
    });
  }, [networkSnapshot, activeNode, isFrozen]);

  const getPolyX = (index: number, total: number) => {
    if (total <= 1) return padding.left;
    return padding.left + (index / (total - 1)) * graphWidth;
  };

  const generatePolyPath = (
    valExtractor: (p: PolyphaseHistoricalPoint) => number,
    minY: number,
    maxY: number
  ) => {
    if (polyHistory.length === 0) return "";
    return polyHistory
      .map((p, i) => {
        const val = valExtractor(p);
        const y = getYCoord(val, minY, maxY);
        const x = getPolyX(i, polyHistory.length);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const generatePolyAreaPath = (
    valExtractor: (p: PolyphaseHistoricalPoint) => number,
    minY: number,
    maxY: number
  ) => {
    if (polyHistory.length === 0) return "";
    const linePath = polyHistory
      .map((p, i) => {
        const val = valExtractor(p);
        const y = getYCoord(val, minY, maxY);
        const x = getPolyX(i, polyHistory.length);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    const firstX = getPolyX(0, polyHistory.length).toFixed(1);
    const lastX = getPolyX(polyHistory.length - 1, polyHistory.length).toFixed(1);
    const bottomY = (svgHeight - padding.bottom).toFixed(1);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // Polyphase scales
  const allPolyI = polyHistory.flatMap((p) => [p.iR, p.iY, p.iB, p.iNeutral]);
  const minPolyI = 0;
  const maxPolyI = Math.max(2.0, Math.ceil((Math.max(...(allPolyI.length ? allPolyI : [2.5])) + 0.3) * 10) / 10);
  const pathPolyIR = generatePolyPath((p) => p.iR, minPolyI, maxPolyI);
  const pathPolyIY = generatePolyPath((p) => p.iY, minPolyI, maxPolyI);
  const pathPolyIB = generatePolyPath((p) => p.iB, minPolyI, maxPolyI);
  const pathPolyIN = generatePolyPath((p) => p.iNeutral, minPolyI, maxPolyI);
  const statsPolyIR = calcStats(polyHistory.map((p) => p.iR));
  const statsPolyIY = calcStats(polyHistory.map((p) => p.iY));
  const statsPolyIB = calcStats(polyHistory.map((p) => p.iB));
  const statsPolyIN = calcStats(polyHistory.map((p) => p.iNeutral));
  const latestIUnb = polyHistory.length > 0 ? polyHistory[polyHistory.length - 1].iUnb : 0;

  const allPolyV = polyHistory.flatMap((p) => [p.vR, p.vY, p.vB]);
  const hasZeroV = allPolyV.some((v) => v < 50);
  const minPolyV = hasZeroV
    ? 0
    : Math.max(180, Math.floor(Math.min(...(allPolyV.length ? allPolyV : [200])) - 5));
  const maxPolyV = Math.min(270, Math.max(255, Math.ceil(Math.max(...(allPolyV.length ? allPolyV : [250])) + 5)));
  const pathPolyVR = generatePolyPath((p) => p.vR, minPolyV, maxPolyV);
  const pathPolyVY = generatePolyPath((p) => p.vY, minPolyV, maxPolyV);
  const pathPolyVB = generatePolyPath((p) => p.vB, minPolyV, maxPolyV);
  const yUpperV = getYCoord(243.8, minPolyV, maxPolyV);
  const yLowerV = getYCoord(216.2, minPolyV, maxPolyV);
  const statsPolyVR = calcStats(polyHistory.map((p) => p.vR));
  const statsPolyVY = calcStats(polyHistory.map((p) => p.vY));
  const statsPolyVB = calcStats(polyHistory.map((p) => p.vB));
  const latestVUnb = polyHistory.length > 0 ? polyHistory[polyHistory.length - 1].vUnb : 0;

  const allPolyP = polyHistory.flatMap((p) => [p.pR, p.pY, p.pB, p.pTotal]);
  const minPolyP = 0;
  const maxPolyP = Math.max(100, Math.ceil(Math.max(...(allPolyP.length ? allPolyP : [500])) * 1.25));
  const pathPolyPR = generatePolyPath((p) => p.pR, minPolyP, maxPolyP);
  const pathPolyPY = generatePolyPath((p) => p.pY, minPolyP, maxPolyP);
  const pathPolyPB = generatePolyPath((p) => p.pB, minPolyP, maxPolyP);
  const pathPolyPTotal = generatePolyPath((p) => p.pTotal, minPolyP, maxPolyP);
  const areaPolyPTotal = generatePolyAreaPath((p) => p.pTotal, minPolyP, maxPolyP);
  const statsPolyPR = calcStats(polyHistory.map((p) => p.pR));
  const statsPolyPY = calcStats(polyHistory.map((p) => p.pY));
  const statsPolyPB = calcStats(polyHistory.map((p) => p.pB));
  const statsPolyPTotal = calcStats(polyHistory.map((p) => p.pTotal));

  const minPolyPf = 0.8;
  const maxPolyPf = 1.0;
  const pathPolyPfR = generatePolyPath((p) => p.pfR, minPolyPf, maxPolyPf);
  const pathPolyPfY = generatePolyPath((p) => p.pfY, minPolyPf, maxPolyPf);
  const pathPolyPfB = generatePolyPath((p) => p.pfB, minPolyPf, maxPolyPf);
  const statsPolyPfR = calcStats(polyHistory.map((p) => p.pfR));
  const statsPolyPfY = calcStats(polyHistory.map((p) => p.pfY));
  const statsPolyPfB = calcStats(polyHistory.map((p) => p.pfB));
  const yPfNominal = getYCoord(0.9, minPolyPf, maxPolyPf);

  const hoveredPolyPoint =
    hoverIndex !== null && polyHistory[hoverIndex]
      ? polyHistory[hoverIndex]
      : null;

  return (
    <div className="flex-1 flex flex-col gap-3 font-mono">
      {/* 1. Global SCADA Header Bar with Channel Scope & Pole Selection */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-2.5 rounded-sm flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isFrozen ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isFrozen ? "bg-amber-500" : "bg-emerald-500"}`} />
            </span>
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-zinc-200">
              DISTURBANCE RECORDER &amp; POWER QUALITY ANALYZER // MULTI-CHANNEL OSCILLOGRAPHY
            </span>
          </div>

          {/* Unified SCADA Waveform View Mode: 3-Phase Polyphase vs ANSI 87L Differential Span */}
          <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-sm p-0.5 text-xs">
            <button
              onClick={() => setChannelScope("POLYPHASE")}
              className={`px-2 py-1 text-[10px] font-bold uppercase rounded-xs transition-colors flex items-center gap-1.5 ${
                channelScope === "POLYPHASE"
                  ? "bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>3-PHASE POLYPHASE CHANNELS</span>
            </button>
            <button
              onClick={() => setChannelScope("ANCHOR")}
              className={`px-2 py-1 text-[10px] font-bold uppercase rounded-xs transition-colors flex items-center gap-1.5 ${
                channelScope === "ANCHOR"
                  ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              <Radio className="h-3 w-3" />
              <span>ZONE 1 DIFFERENTIAL CHANNELS (ANSI 87L)</span>
            </button>
          </div>

          {/* Unified Grid Pole Selector (28 Distribution Poles across 3 Feeders) */}
          {networkSnapshot && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase">POLE:</span>
              <select
                value={activeNode ? activeNode.id : activePoleId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setActivePoleId(newId);
                  setChannelScope("POLYPHASE");
                  onSelectPole?.(newId);
                }}
                className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xs px-2 py-1 text-[11px] font-bold text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                <optgroup label="FEEDER LT-1 (RESIDENTIAL - 10 POLES)">
                  {nodesByFeeder["LT-1"].map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id === n.label ? n.id : `${n.id} - ${n.label}`} {n.id === "F1-P01" ? "[INCOMER RTU]" : n.id === "F1-P02" ? "[BOUNDARY RTU]" : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="FEEDER LT-2 (COMMERCIAL - 11 POLES)">
                  {nodesByFeeder["LT-2"].map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id === n.label ? n.id : `${n.id} - ${n.label}`}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="FEEDER LT-3 (AGRI/MIXED - 7 POLES)">
                  {nodesByFeeder["LT-3"].map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id === n.label ? n.id : `${n.id} - ${n.label}`}
                    </option>
                  ))}
                </optgroup>
              </select>

              {channelScope === "ANCHOR" ? (
                <span className="text-[10px] px-2 py-0.5 rounded-xs font-bold border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30">
                  SPAN: F1-P01 (INCOMER) ↔ F1-P02 (TERMINAL)
                </span>
              ) : activeNode ? (
                <span className={`text-[10px] px-2 py-0.5 rounded-xs font-bold border ${
                  activeNode.isLive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                }`}>
                  {activeNode.id === "F1-P01" ? "SECTION 1 INCOMER" : activeNode.id === "F1-P02" ? "SECTION 1 TERMINAL" : "DISTRIBUTION POLE"}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isFrozen && (
            <div className="flex items-center gap-1.5 text-xs bg-amber-500/10 border border-amber-500/40 text-amber-500 dark:text-amber-400 px-2 py-0.5 rounded-xs font-bold animate-pulse">
              <Clock className="h-3.5 w-3.5" />
              <span>BUFFER FROZEN AT {frozenTime || "INSPECTION"}</span>
            </div>
          )}

          {/* Freeze / Resume Toggle Button */}
          <button
            onClick={handleToggleFreeze}
            className={`px-3 py-1 text-xs rounded-sm transition-all flex items-center gap-1.5 font-bold cursor-pointer shadow-xs ${
              isFrozen
                ? "bg-amber-500 hover:bg-amber-600 text-zinc-950 border border-amber-400"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-zinc-700"
            }`}
            title={isFrozen ? "Resume Live Rolling Stream" : "Freeze Oscillography Buffer for Inspection"}
          >
            {isFrozen ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span>{isFrozen ? "RESUME CONTINUOUS RECORDING" : "FREEZE OSCILLOGRAPHY BUFFER"}</span>
          </button>

          {/* Export Waveforms CSV */}
          <button
            onClick={handleExportWaveformCsv}
            className="px-2.5 py-1 text-xs rounded-sm transition-all flex items-center gap-1.5 font-bold cursor-pointer bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-zinc-700 shadow-xs"
            title="Export 40-sample polyphase waveform data to CSV for post-incident power quality analysis"
          >
            <Download className="h-3.5 w-3.5 text-emerald-500" />
            <span>EXPORT COMTRADE / CSV</span>
          </button>

          <div className="text-xs text-slate-500 dark:text-zinc-400 border-l border-slate-200 dark:border-zinc-800 pl-3">
            BUFFER: <span className="text-slate-800 dark:text-zinc-200 font-bold">{channelScope === "ANCHOR" ? data.length : polyHistory.length}</span> / 40 SAMPLES
          </div>
        </div>
      </div>

      {/* 2. 2x2 High-Readability Full Screen Grid */}
      {channelScope === "ANCHOR" ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3.5 min-h-0">
          {/* ============================================================== */}
          {/* CHART 1: CURRENT & DIFFERENTIAL PROTECTION (ANSI 87L) */}
          {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                1. CURRENT &amp; DIFFERENTIAL PROTECTION (ANSI 87L)
              </span>
            </div>
            {/* Live Instantaneous Pill Badges with explicit color keys */}
            <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0 shadow-xs" />
                I1 (INCOMER): <span className="font-bold">{statsI1.cur.toFixed(3)}A</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0 shadow-xs" />
                I2 (OUTGOING): <span className="font-bold">{statsI2.cur.toFixed(3)}A</span>
              </span>
              <span className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs ${statsIdiff.cur > tripLimit ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/50 animate-pulse font-bold" : "text-rose-600 dark:text-rose-400"}`}>
                <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0 shadow-xs" />
                ΔI (|I1 - I2|): <span className="font-bold">{statsIdiff.cur.toFixed(3)}A</span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full overflow-visible font-mono tabular-nums"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              <defs>
                <linearGradient id="gradIdiff" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minI + p * (maxI - minI);
                const y = getYCoord(val, minI, maxI);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="end"
                    >
                      {val.toFixed(2)}A
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 16}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* ANSI 87L Trip Threshold Reference Line */}
              <line
                x1={padding.left}
                y1={yTripLimit}
                x2={svgWidth - padding.right}
                y2={yTripLimit}
                stroke="#f43f5e"
                strokeWidth="1.2"
                strokeDasharray="4 3"
              />
              <text
                x={svgWidth - padding.right - 6}
                y={yTripLimit - 5}
                fill="#f43f5e"
                fontSize="9.5"
                fontWeight="bold"
                textAnchor="end"
              >
                ANSI 87L TRIP LIMIT: {tripLimit.toFixed(2)}A
              </text>

              {/* Gradient Area under ΔI */}
              <path d={areaIdiff} fill="url(#gradIdiff)" />

              {/* Traces */}
              <path d={pathI1} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
              <path d={pathI2} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
              <path d={pathIdiff} fill="none" stroke="#f43f5e" strokeWidth="1.75" strokeLinecap="round" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="currentColor"
                    className="text-slate-400 dark:text-zinc-300"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].i1, minI, maxI)} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].i2, minI, maxI)} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].idiff, minI, maxI)} r="4" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.2" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPoint.timeLabel}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">I1: {hoveredPoint.i1.toFixed(3)}A</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">I2: {hoveredPoint.i2.toFixed(3)}A</span>
                <span className={`font-bold ${hoveredPoint.idiff > tripLimit ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-rose-600 dark:text-rose-400"}`}>
                  ΔI: {hoveredPoint.idiff.toFixed(3)}A
                </span>
                <span className="text-slate-500 dark:text-zinc-500 text-[10px]">
                  (MARGIN: {Math.max(0, tripLimit - hoveredPoint.idiff).toFixed(3)}A)
                </span>
              </div>
            )}
          </div>

          {/* Stats Bar with matching color indicators */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0" />
              <span>I1 (INCOMER): <span className="font-bold text-emerald-600 dark:text-emerald-400">{statsI1.cur.toFixed(3)} A</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsI1.avg.toFixed(2)}A)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0" />
              <span>I2 (TERMINAL): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsI2.cur.toFixed(3)} A</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsI2.avg.toFixed(2)}A)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0" />
              <span>DIFF ΔI: <span className={`font-bold ${statsIdiff.cur > tripLimit ? "text-rose-500 animate-pulse" : "text-rose-600 dark:text-rose-400"}`}>{statsIdiff.cur.toFixed(3)} A</span> <span className="text-slate-400 dark:text-zinc-500">(|I1 - I2|)</span></span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CHART 2: BUS VOLTAGE STABILITY & GRID FREQUENCY */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                2. BUS VOLTAGE STABILITY &amp; GRID FREQUENCY
              </span>
            </div>
            {/* Live Instantaneous Pill Badges (V1 Substation >= V2 Load End) */}
            <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0 shadow-xs" />
                V1 (SUBSTATION): <span className="font-bold">{statsV1.cur.toFixed(1)}V</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                V2 (LOAD END): <span className="font-bold">{statsV2.cur.toFixed(1)}V</span>
              </span>
              <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                <span className="h-2 w-2 rounded-full bg-[#a855f7] shrink-0 shadow-xs" />
                FREQ: <span className="font-bold">{statsFreq.cur.toFixed(2)}Hz</span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full overflow-visible font-mono tabular-nums"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {/* Shaded Statutory Voltage Safe Zone (+/- 10%) */}
              <rect
                x={padding.left}
                y={Math.min(yOverV, yUnderV)}
                width={graphWidth}
                height={Math.abs(yUnderV - yOverV)}
                fill="#10b981"
                fillOpacity="0.04"
              />

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minV + p * (maxV - minV);
                const y = getYCoord(val, minV, maxV);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="end"
                    >
                      {val.toFixed(0)}V
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 16}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Statutory Voltage Limits (+10% / -10%) */}
              <line x1={padding.left} y1={yOverV} x2={svgWidth - padding.right} y2={yOverV} stroke="#f43f5e" strokeWidth="1.1" strokeDasharray="4 3" />
              <text x={svgWidth - padding.right - 6} y={yOverV - 5} fill="#f43f5e" fontSize="9.5" fontWeight="bold" textAnchor="end">+10% UPPER (253V)</text>

              <line x1={padding.left} y1={yUnderV} x2={svgWidth - padding.right} y2={yUnderV} stroke="#f59e0b" strokeWidth="1.1" strokeDasharray="4 3" />
              <text x={svgWidth - padding.right - 6} y={yUnderV + 12} fill="#f59e0b" fontSize="9.5" fontWeight="bold" textAnchor="end">-10% LOWER (207V)</text>

              {/* Traces */}
              <path d={pathV1} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
              <path d={pathV2} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="currentColor"
                    className="text-slate-400 dark:text-zinc-300"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].v1, minV, maxV)} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].v2, minV, maxV)} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPoint.timeLabel}</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">V1: {hoveredPoint.v1.toFixed(1)}V</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">V2: {hoveredPoint.v2.toFixed(1)}V</span>
                <span className="text-purple-600 dark:text-purple-400 font-bold">FREQ: {(hoveredPoint.freq1 ?? 50.0).toFixed(2)}Hz</span>
                <span className="text-slate-500 dark:text-zinc-500 text-[10px]">
                  (DROP ΔV: {Math.max(0, hoveredPoint.v1 - hoveredPoint.v2).toFixed(1)}V)
                </span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0" />
              <span>V1 (SUBSTATION): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsV1.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsV1.avg.toFixed(1)}V)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0" />
              <span>V2 (TERMINAL): <span className="font-bold text-amber-600 dark:text-amber-400">{statsV2.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsV2.avg.toFixed(1)}V)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#a855f7] shrink-0" />
              <span>FREQUENCY: <span className="font-bold text-purple-600 dark:text-purple-400">{statsFreq.cur.toFixed(2)} Hz</span> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">(50Hz NOM)</span></span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CHART 3: POWER TRIANGLE (ACTIVE, REACTIVE, APPARENT & PF) */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                3. POWER TRIANGLE (P / Q / S) &amp; POWER FACTOR
              </span>
            </div>
            {/* Live Instantaneous Pill Badges */}
            <div className="flex items-center gap-2.5 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0 shadow-xs" />
                P: <span className="font-bold">{statsP1.cur.toFixed(2)}kW</span>
              </span>
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400" title="Dashed trace">
                <span className="w-3.5 h-0 border-t-2 border-dashed border-[#f43f5e] shrink-0" />
                Q: <span className="font-bold">{statsQ1.cur.toFixed(2)}kvar</span>
              </span>
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <span className="h-2 w-2 rounded-full bg-[#3b82f6] shrink-0 shadow-xs" />
                S: <span className="font-bold">{statsS1.cur.toFixed(2)}kVA</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                PF: <span className="font-bold">{statsPf.cur.toFixed(2)}</span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full overflow-visible font-mono tabular-nums"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              <defs>
                <linearGradient id="gradPActive" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minP + p * (maxP - minP);
                const y = getYCoord(val, minP, maxP);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="end"
                    >
                      {val.toFixed(2)}kW
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 16}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Gradient Area under Active Power P */}
              <path d={areaPActive} fill="url(#gradPActive)" />

              {/* Traces */}
              <path d={pathSApparent} fill="none" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" />
              <path d={pathPActive} fill="none" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" />
              <path d={pathQReactive} fill="none" stroke="#f43f5e" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="4 3" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="currentColor"
                    className="text-slate-400 dark:text-zinc-300"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord((data[hoverIndex].s1 ?? 0) / 1000, minP, maxP)} r="3.5" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord((data[hoverIndex].p1 ?? 0) / 1000, minP, maxP)} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord((data[hoverIndex].q1 ?? 0) / 1000, minP, maxP)} r="3.5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.2" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPoint.timeLabel}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">P: {((hoveredPoint.p1 ?? 0) / 1000).toFixed(2)}kW</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">Q: {((hoveredPoint.q1 ?? 0) / 1000).toFixed(2)}kvar</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">S: {((hoveredPoint.s1 ?? 0) / 1000).toFixed(2)}kVA</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">PF: {(hoveredPoint.pf1 ?? 0.96).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs tabular-nums font-mono">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0" />
              <span>ACTIVE P: <span className="font-bold text-emerald-600 dark:text-emerald-400">{statsP1.cur.toFixed(2)} kW</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0 border-t-2 border-dashed border-[#f43f5e] shrink-0" />
              <span>REACTIVE Q: <span className="font-bold text-rose-600 dark:text-rose-400">{statsQ1.cur.toFixed(2)} kvar</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#3b82f6] shrink-0" />
              <span>APPARENT S: <span className="font-bold text-blue-600 dark:text-blue-400">{statsS1.cur.toFixed(2)} kVA</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0" />
              <span>PF: <span className="font-bold text-amber-600 dark:text-amber-400">{statsPf.cur.toFixed(2)}</span> <span className="text-slate-400 dark:text-zinc-500">(LAG)</span></span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CHART 4: TECHNICAL LINE LOSS & SPAN VOLTAGE DROP */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                4. TECHNICAL LINE LOSS (ΔP) &amp; SPAN VOLTAGE DROP (ΔV)
              </span>
            </div>
            {/* Live Instantaneous Pill Badges */}
            <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                <span className="h-2 w-2 rounded-full bg-[#f97316] shrink-0 shadow-xs" />
                LINE LOSS ΔP: <span className="font-bold">{statsLossW.cur.toFixed(1)}W</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400" title="Dashed trace">
                <span className="w-3.5 h-0 border-t-2 border-dashed border-[#06b6d4] shrink-0" />
                SPAN DROP ΔV: <span className="font-bold">{statsVDrop.cur.toFixed(1)}V</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0 shadow-xs" />
                EFFICIENCY: <span className="font-bold">
                  {statsP1.cur > 0
                    ? `${(Math.max(0, 100 - (statsLossW.cur / (statsP1.cur * 1000)) * 100)).toFixed(2)}%`
                    : "99.8%"}
                </span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area with Dual Y-Axis: Left for ΔP (Watts), Right for ΔV (Volts) */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full overflow-visible font-mono tabular-nums"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              <defs>
                <linearGradient id="gradLoss" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.13" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines & Dual-Scale Labels */}
              {yTicks.map((p, idx) => {
                const valW = minLossW + p * (maxLossW - minLossW);
                const y = getYCoord(valW, minLossW, maxLossW);
                const valV = minDropV + p * (maxDropV - minDropV);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    {/* Left Axis: ΔP (Watts in Orange) */}
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-orange-600 dark:fill-orange-400 font-bold"
                      fontSize="10"
                      textAnchor="end"
                    >
                      {valW.toFixed(0)}W
                    </text>
                    {/* Right Axis: ΔV (Volts in Cyan) */}
                    <text
                      x={svgWidth - padding.right + 8}
                      y={y + 3.5}
                      className="fill-cyan-600 dark:fill-cyan-400 font-bold"
                      fontSize="10"
                      textAnchor="start"
                    >
                      {valV.toFixed(1)}V
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 16}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Gradient Area under Conductor Line Loss */}
              <path d={areaLoss} fill="url(#gradLoss)" />

              {/* Traces: Smooth Derived ΔP (Watts) and ΔV (Volts) */}
              <path d={pathLoss} fill="none" stroke="#f97316" strokeWidth="1.6" strokeLinecap="round" />
              <path d={pathVDrop} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 3" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="currentColor"
                    className="text-slate-400 dark:text-zinc-300"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].pLoss ?? 0, minLossW, maxLossW)} r="3.5" fill="#f97316" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].vDrop ?? 0, minDropV, maxDropV)} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPoint.timeLabel}</span>
                <span className="text-orange-600 dark:text-orange-400 font-bold">ΔP: {(hoveredPoint.pLoss ?? 0).toFixed(1)}W</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">ΔV: {(hoveredPoint.vDrop ?? 0).toFixed(1)}V</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  η: {hoveredPoint.p1 && hoveredPoint.p1 > 0
                    ? `${(Math.max(0, 100 - ((hoveredPoint.pLoss ?? 0) / hoveredPoint.p1) * 100)).toFixed(2)}%`
                    : "99.8%"}
                </span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f97316] shrink-0" />
              <span>LINE LOSS ΔP: <span className="font-bold text-orange-600 dark:text-orange-400">{statsLossW.cur.toFixed(1)} W</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsLossW.avg.toFixed(1)}W)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0 border-t-2 border-dashed border-[#06b6d4] shrink-0" />
              <span>SPAN DROP ΔV: <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsVDrop.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(NORM: &lt;3%)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0" />
              <span>SPAN EFFICIENCY: <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {statsP1.cur > 0
                  ? `${(Math.max(0, 100 - (statsLossW.cur / (statsP1.cur * 1000)) * 100)).toFixed(2)}%`
                  : "99.8%"}
              </span></span>
            </div>
          </div>
        </div>
      </div>
      ) : (
        /* ========================================================================= */
        /* DIGITAL TWIN 3-PHASE POLYPHASE POLE MONITOR (4 HIGH-PRECISION SCADA CHARTS) */
        /* ========================================================================= */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3.5 min-h-0">
          {/* ------------------------------------------------------------------------- */}
          {/* POLY CHART 1: 3-PHASE CURRENT & NEUTRAL DISPLACEMENT */}
          {/* ------------------------------------------------------------------------- */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-500" />
                <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                  1. 3-PHASE CURRENT &amp; NEUTRAL DISPLACEMENT ({activeNode?.id || activePoleId})
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0 shadow-xs" />
                  IR: <span className="font-bold">{statsPolyIR.cur.toFixed(3)}A</span>
                </span>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                  IY: <span className="font-bold">{statsPolyIY.cur.toFixed(3)}A</span>
                </span>
                <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0 shadow-xs" />
                  IB: <span className="font-bold">{statsPolyIB.cur.toFixed(3)}A</span>
                </span>
                <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400" title="Dashed trace">
                  <span className="w-3.5 h-0 border-t-2 border-dashed border-[#a855f7] shrink-0" />
                  IN: <span className="font-bold">{statsPolyIN.cur.toFixed(3)}A</span>
                </span>
              </div>
            </div>

            <div
              className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible font-mono tabular-nums"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {yTicks.map((p, idx) => {
                  const val = minPolyI + p * (maxPolyI - minPolyI);
                  const y = getYCoord(val, minPolyI, maxPolyI);
                  return (
                    <g key={idx}>
                      <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                      <text x={padding.left - 8} y={y + 3.5} className="fill-slate-500 dark:fill-zinc-400" fontSize="10" fontWeight="600" textAnchor="end">
                        {val.toFixed(2)}A
                      </text>
                    </g>
                  );
                })}

                {xTimeMarkers.map((marker, idx) => {
                  const x = padding.left + marker.p * graphWidth;
                  return (
                    <g key={idx}>
                      <line x1={x} y1={padding.top} x2={x} y2={svgHeight - padding.bottom} stroke="currentColor" className="text-slate-200 dark:text-zinc-800/60" strokeWidth="1" strokeDasharray="2 3" />
                      <text x={x} y={svgHeight - padding.bottom + 16} className="fill-slate-400 dark:fill-zinc-500" fontSize="9.5" fontWeight="500" textAnchor="middle">
                        {marker.label}
                      </text>
                    </g>
                  );
                })}

                <path d={pathPolyIR} fill="none" stroke="#f43f5e" strokeWidth="1.6" strokeLinecap="round" />
                <path d={pathPolyIY} fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" />
                <path d={pathPolyIB} fill="none" stroke="#06b6d4" strokeWidth="1.6" strokeLinecap="round" />
                <path d={pathPolyIN} fill="none" stroke="#a855f7" strokeWidth="1.35" strokeLinecap="round" strokeDasharray="4 3" />

                {/* DFR Trip Event Marker Line */}
                {networkSnapshot && networkSnapshot.detections.length > 0 && polyHistory.length > 1 && (
                  <g>
                    <line
                      x1={getPolyX(polyHistory.length - 1, polyHistory.length)}
                      y1={padding.top}
                      x2={getPolyX(polyHistory.length - 1, polyHistory.length)}
                      y2={svgHeight - padding.bottom}
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                    />
                    <text
                      x={Math.max(padding.left + 10, getPolyX(polyHistory.length - 1, polyHistory.length) - 8)}
                      y={padding.top + 14}
                      className="fill-rose-500 font-bold"
                      fontSize="9.5"
                      textAnchor="end"
                    >
                      ⚡ TRIP EXCURSION
                    </text>
                  </g>
                )}

                {hoverIndex !== null && polyHistory[hoverIndex] && (
                  <g>
                    <line
                      x1={getPolyX(hoverIndex, polyHistory.length)}
                      y1={padding.top}
                      x2={getPolyX(hoverIndex, polyHistory.length)}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-400 dark:text-zinc-300"
                      strokeWidth="1.0"
                      strokeDasharray="3 3"
                    />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].iR, minPolyI, maxPolyI)} r="3.5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].iY, minPolyI, maxPolyI)} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].iB, minPolyI, maxPolyI)} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].iNeutral, minPolyI, maxPolyI)} r="3" fill="#a855f7" stroke="#ffffff" strokeWidth="1.2" />
                  </g>
                )}

                {polyHistory.map((_, idx) => (
                  <rect key={idx} x={getPolyX(idx, polyHistory.length) - graphWidth / (polyHistory.length * 2)} y={padding.top} width={graphWidth / polyHistory.length} height={graphHeight} fill="transparent" className="cursor-crosshair" onMouseEnter={() => setHoverIndex(idx)} />
                ))}
              </svg>

              {hoveredPolyPoint && (
                <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                  <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPolyPoint.timeLabel}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">IR: {hoveredPolyPoint.iR.toFixed(3)}A</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">IY: {hoveredPolyPoint.iY.toFixed(3)}A</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">IB: {hoveredPolyPoint.iB.toFixed(3)}A</span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold">IN: {hoveredPolyPoint.iNeutral.toFixed(3)}A</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0" />
                <span>PEAK CURRENT: <span className="font-bold text-slate-800 dark:text-zinc-200">{Math.max(statsPolyIR.max, statsPolyIY.max, statsPolyIB.max).toFixed(3)} A</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-0 border-t-2 border-dashed border-[#a855f7] shrink-0" />
                <span>NEUTRAL RETURN: <span className="font-bold text-purple-600 dark:text-purple-400">{statsPolyIN.cur.toFixed(3)} A</span> <span className="text-slate-400 dark:text-zinc-500">(VEC SUM)</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0" />
                <span>CURRENT UNBALANCE: <span className="font-bold text-emerald-600 dark:text-emerald-400">{latestIUnb.toFixed(2)}%</span></span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------------- */}
          {/* POLY CHART 2: 3-PHASE VOLTAGES & TOLERANCE BAND */}
          {/* ------------------------------------------------------------------------- */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-500" />
                <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                  2. 3-PHASE VOLTAGES &amp; TOLERANCE BAND (230V NOMINAL ±6%)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0 shadow-xs" />
                  VR: <span className="font-bold">{statsPolyVR.cur.toFixed(1)}V</span>
                </span>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                  VY: <span className="font-bold">{statsPolyVY.cur.toFixed(1)}V</span>
                </span>
                <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0 shadow-xs" />
                  VB: <span className="font-bold">{statsPolyVB.cur.toFixed(1)}V</span>
                </span>
                <span className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs ${latestVUnb > 2.0 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 shadow-xs ${latestVUnb > 2.0 ? "bg-[#f59e0b]" : "bg-[#10b981]"}`} />
                  V-UNB: {latestVUnb.toFixed(2)}%
                </span>
              </div>
            </div>

            <div
              className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible font-mono tabular-nums"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {/* Shaded Statutory Voltage Safe Zone (+/- 6%) */}
                <rect
                  x={padding.left}
                  y={Math.min(yUpperV, yLowerV)}
                  width={graphWidth}
                  height={Math.abs(yLowerV - yUpperV)}
                  fill="#10b981"
                  fillOpacity="0.04"
                />

                {yTicks.map((p, idx) => {
                  const val = minPolyV + p * (maxPolyV - minPolyV);
                  const y = getYCoord(val, minPolyV, maxPolyV);
                  return (
                    <g key={idx}>
                      <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                      <text x={padding.left - 8} y={y + 3.5} className="fill-slate-500 dark:fill-zinc-400" fontSize="10" fontWeight="600" textAnchor="end">
                        {val.toFixed(0)}V
                      </text>
                    </g>
                  );
                })}

                {yUpperV >= padding.top && yUpperV <= svgHeight - padding.bottom && (
                  <>
                    <line x1={padding.left} y1={yUpperV} x2={svgWidth - padding.right} y2={yUpperV} stroke="#f59e0b" strokeWidth="1.1" strokeDasharray="4 3" opacity="0.8" />
                    <text x={svgWidth - padding.right - 6} y={yUpperV - 5} fill="#f59e0b" fontSize="9.5" fontWeight="bold" textAnchor="end">+6% UPPER (243.8V)</text>
                  </>
                )}

                {yLowerV >= padding.top && yLowerV <= svgHeight - padding.bottom && (
                  <>
                    <line x1={padding.left} y1={yLowerV} x2={svgWidth - padding.right} y2={yLowerV} stroke="#f59e0b" strokeWidth="1.1" strokeDasharray="4 3" opacity="0.8" />
                    <text x={svgWidth - padding.right - 6} y={yLowerV + 12} fill="#f59e0b" fontSize="9.5" fontWeight="bold" textAnchor="end">-6% LOWER (216.2V)</text>
                  </>
                )}

                {xTimeMarkers.map((marker, idx) => {
                  const x = padding.left + marker.p * graphWidth;
                  return (
                    <g key={idx}>
                      <line x1={x} y1={padding.top} x2={x} y2={svgHeight - padding.bottom} stroke="currentColor" className="text-slate-200 dark:text-zinc-800/60" strokeWidth="1" strokeDasharray="2 3" />
                      <text x={x} y={svgHeight - padding.bottom + 16} className="fill-slate-400 dark:fill-zinc-500" fontSize="9.5" fontWeight="500" textAnchor="middle">
                        {marker.label}
                      </text>
                    </g>
                  );
                })}

                <path d={pathPolyVR} fill="none" stroke="#f43f5e" strokeWidth="1.6" strokeLinecap="round" />
                <path d={pathPolyVY} fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" />
                <path d={pathPolyVB} fill="none" stroke="#06b6d4" strokeWidth="1.6" strokeLinecap="round" />

                {/* DFR Trip Event Marker Line */}
                {networkSnapshot && networkSnapshot.detections.length > 0 && polyHistory.length > 1 && (
                  <g>
                    <line
                      x1={getPolyX(polyHistory.length - 1, polyHistory.length)}
                      y1={padding.top}
                      x2={getPolyX(polyHistory.length - 1, polyHistory.length)}
                      y2={svgHeight - padding.bottom}
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                    />
                    <text
                      x={Math.max(padding.left + 10, getPolyX(polyHistory.length - 1, polyHistory.length) - 8)}
                      y={padding.top + 14}
                      className="fill-rose-500 font-bold"
                      fontSize="9.5"
                      textAnchor="end"
                    >
                      ⚡ TRIP EXCURSION
                    </text>
                  </g>
                )}

                {hoverIndex !== null && polyHistory[hoverIndex] && (
                  <g>
                    <line
                      x1={getPolyX(hoverIndex, polyHistory.length)}
                      y1={padding.top}
                      x2={getPolyX(hoverIndex, polyHistory.length)}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-400 dark:text-zinc-300"
                      strokeWidth="1.0"
                      strokeDasharray="3 3"
                    />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].vR, minPolyV, maxPolyV)} r="3.5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].vY, minPolyV, maxPolyV)} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].vB, minPolyV, maxPolyV)} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                  </g>
                )}

                {polyHistory.map((_, idx) => (
                  <rect key={idx} x={getPolyX(idx, polyHistory.length) - graphWidth / (polyHistory.length * 2)} y={padding.top} width={graphWidth / polyHistory.length} height={graphHeight} fill="transparent" className="cursor-crosshair" onMouseEnter={() => setHoverIndex(idx)} />
                ))}
              </svg>

              {hoveredPolyPoint && (
                <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                  <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPolyPoint.timeLabel}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">VR: {hoveredPolyPoint.vR.toFixed(1)}V</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">VY: {hoveredPolyPoint.vY.toFixed(1)}V</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">VB: {hoveredPolyPoint.vB.toFixed(1)}V</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">UNB: {hoveredPolyPoint.vUnb.toFixed(2)}%</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0" />
                <span>VR (PHASE R): <span className="font-bold text-rose-600 dark:text-rose-400">{statsPolyVR.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsPolyVR.avg.toFixed(1)}V)</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0" />
                <span>VY (PHASE Y): <span className="font-bold text-amber-600 dark:text-amber-400">{statsPolyVY.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsPolyVY.avg.toFixed(1)}V)</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0" />
                <span>VB (PHASE B): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsPolyVB.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(AVG: {statsPolyVB.avg.toFixed(1)}V)</span></span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------------- */}
          {/* POLY CHART 3: 3-PHASE ACTIVE LOAD & TOTAL DEMAND */}
          {/* ------------------------------------------------------------------------- */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                  3. 3-PHASE ACTIVE LOAD &amp; POLE CONSUMPTION (WATTS)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0 shadow-xs" />
                  PR: <span className="font-bold">{statsPolyPR.cur}W</span>
                </span>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                  PY: <span className="font-bold">{statsPolyPY.cur}W</span>
                </span>
                <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0 shadow-xs" />
                  PB: <span className="font-bold">{statsPolyPB.cur}W</span>
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0 shadow-xs" />
                  TOTAL: {(statsPolyPTotal.cur / 1000).toFixed(2)} kW
                </span>
              </div>
            </div>

            <div
              className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible font-mono tabular-nums"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                <defs>
                  <linearGradient id="gradPolyPTotal" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {yTicks.map((p, idx) => {
                  const val = minPolyP + p * (maxPolyP - minPolyP);
                  const y = getYCoord(val, minPolyP, maxPolyP);
                  return (
                    <g key={idx}>
                      <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                      <text x={padding.left - 8} y={y + 3.5} className="fill-slate-500 dark:fill-zinc-400" fontSize="10" fontWeight="600" textAnchor="end">
                        {val.toFixed(0)}W
                      </text>
                    </g>
                  );
                })}

                {xTimeMarkers.map((marker, idx) => {
                  const x = padding.left + marker.p * graphWidth;
                  return (
                    <g key={idx}>
                      <line x1={x} y1={padding.top} x2={x} y2={svgHeight - padding.bottom} stroke="currentColor" className="text-slate-200 dark:text-zinc-800/60" strokeWidth="1" strokeDasharray="2 3" />
                      <text x={x} y={svgHeight - padding.bottom + 16} className="fill-slate-400 dark:fill-zinc-500" fontSize="9.5" fontWeight="500" textAnchor="middle">
                        {marker.label}
                      </text>
                    </g>
                  );
                })}

                <path d={areaPolyPTotal} fill="url(#gradPolyPTotal)" />
                <path d={pathPolyPTotal} fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" />
                <path d={pathPolyPR} fill="none" stroke="#f43f5e" strokeWidth="1.3" strokeLinecap="round" />
                <path d={pathPolyPY} fill="none" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" />
                <path d={pathPolyPB} fill="none" stroke="#06b6d4" strokeWidth="1.3" strokeLinecap="round" />

                {hoverIndex !== null && polyHistory[hoverIndex] && (
                  <g>
                    <line
                      x1={getPolyX(hoverIndex, polyHistory.length)}
                      y1={padding.top}
                      x2={getPolyX(hoverIndex, polyHistory.length)}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-400 dark:text-zinc-300"
                      strokeWidth="1.0"
                      strokeDasharray="3 3"
                    />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pTotal, minPolyP, maxPolyP)} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pR, minPolyP, maxPolyP)} r="3" fill="#f43f5e" stroke="#ffffff" strokeWidth="1" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pY, minPolyP, maxPolyP)} r="3" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pB, minPolyP, maxPolyP)} r="3" fill="#06b6d4" stroke="#ffffff" strokeWidth="1" />
                  </g>
                )}

                {polyHistory.map((_, idx) => (
                  <rect key={idx} x={getPolyX(idx, polyHistory.length) - graphWidth / (polyHistory.length * 2)} y={padding.top} width={graphWidth / polyHistory.length} height={graphHeight} fill="transparent" className="cursor-crosshair" onMouseEnter={() => setHoverIndex(idx)} />
                ))}
              </svg>

              {hoveredPolyPoint && (
                <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                  <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPolyPoint.timeLabel}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">TOTAL: {hoveredPolyPoint.pTotal}W</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">PR: {hoveredPolyPoint.pR}W</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">PY: {hoveredPolyPoint.pY}W</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">PB: {hoveredPolyPoint.pB}W</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0" />
                <span>TOTAL DEMAND: <span className="font-bold text-emerald-600 dark:text-emerald-400">{(statsPolyPTotal.cur / 1000).toFixed(2)} kW</span> <span className="text-slate-400 dark:text-zinc-500">({statsPolyPTotal.cur} W)</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0" />
                <span>AVERAGE LOAD: <span className="font-bold text-slate-800 dark:text-zinc-200">{(statsPolyPTotal.avg / 1000).toFixed(2)} kW</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0" />
                <span>PEAK DEMAND: <span className="font-bold text-slate-800 dark:text-zinc-200">{(statsPolyPTotal.max / 1000).toFixed(2)} kW</span></span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------------- */}
          {/* POLY CHART 4: 3-PHASE POWER FACTOR & DISPLACEMENT QUALITY */}
          {/* ------------------------------------------------------------------------- */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-purple-500" />
                <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                  4. POWER FACTOR PER PHASE &amp; DISPLACEMENT QUALITY
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0 shadow-xs" />
                  PFR: <span className="font-bold">{statsPolyPfR.cur.toFixed(2)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                  PFY: <span className="font-bold">{statsPolyPfY.cur.toFixed(2)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0 shadow-xs" />
                  PFB: <span className="font-bold">{statsPolyPfB.cur.toFixed(2)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="h-2 w-2 rounded-full bg-[#10b981] shrink-0 shadow-xs" />
                  AVG: {((statsPolyPfR.cur + statsPolyPfY.cur + statsPolyPfB.cur) / 3).toFixed(2)}
                </span>
              </div>
            </div>

            <div
              className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none aspect-[760/250] w-full"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible font-mono tabular-nums"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {yTicks.map((p, idx) => {
                  const val = minPolyPf + p * (maxPolyPf - minPolyPf);
                  const y = getYCoord(val, minPolyPf, maxPolyPf);
                  return (
                    <g key={idx}>
                      <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                      <text x={padding.left - 8} y={y + 3.5} className="fill-slate-500 dark:fill-zinc-400" fontSize="10" fontWeight="600" textAnchor="end">
                        {val.toFixed(2)}
                      </text>
                    </g>
                  );
                })}

                <line x1={padding.left} y1={yPfNominal} x2={svgWidth - padding.right} y2={yPfNominal} stroke="#a855f7" strokeWidth="1.1" strokeDasharray="4 3" opacity="0.85" />
                <text x={svgWidth - padding.right - 6} y={yPfNominal + 12} fill="#a855f7" fontSize="9.5" fontWeight="bold" textAnchor="end">0.90 PF STATUTORY MIN</text>

                {xTimeMarkers.map((marker, idx) => {
                  const x = padding.left + marker.p * graphWidth;
                  return (
                    <g key={idx}>
                      <line x1={x} y1={padding.top} x2={x} y2={svgHeight - padding.bottom} stroke="currentColor" className="text-slate-200 dark:text-zinc-800/60" strokeWidth="1" strokeDasharray="2 3" />
                      <text x={x} y={svgHeight - padding.bottom + 16} className="fill-slate-400 dark:fill-zinc-500" fontSize="9.5" fontWeight="500" textAnchor="middle">
                        {marker.label}
                      </text>
                    </g>
                  );
                })}

                <path d={pathPolyPfR} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />
                <path d={pathPolyPfY} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
                <path d={pathPolyPfB} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />

                {hoverIndex !== null && polyHistory[hoverIndex] && (
                  <g>
                    <line
                      x1={getPolyX(hoverIndex, polyHistory.length)}
                      y1={padding.top}
                      x2={getPolyX(hoverIndex, polyHistory.length)}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-400 dark:text-zinc-300"
                      strokeWidth="1.0"
                      strokeDasharray="3 3"
                    />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pfR, minPolyPf, maxPolyPf)} r="3.5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pfY, minPolyPf, maxPolyPf)} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx={getPolyX(hoverIndex, polyHistory.length)} cy={getYCoord(polyHistory[hoverIndex].pfB, minPolyPf, maxPolyPf)} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                  </g>
                )}

                {polyHistory.map((_, idx) => (
                  <rect key={idx} x={getPolyX(idx, polyHistory.length) - graphWidth / (polyHistory.length * 2)} y={padding.top} width={graphWidth / polyHistory.length} height={graphHeight} fill="transparent" className="cursor-crosshair" onMouseEnter={() => setHoverIndex(idx)} />
                ))}
              </svg>

              {hoveredPolyPoint && (
                <div className="pointer-events-none absolute top-2 left-16 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs font-mono tabular-nums shadow-md backdrop-blur-xs">
                  <span className="text-slate-500 dark:text-zinc-400 font-bold">{hoveredPolyPoint.timeLabel}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">PFR: {hoveredPolyPoint.pfR.toFixed(2)}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">PFY: {hoveredPolyPoint.pfY.toFixed(2)}</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">PFB: {hoveredPolyPoint.pfB.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs tabular-nums font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f43f5e] shrink-0" />
                <span>PF (PHASE R): <span className="font-bold text-rose-600 dark:text-rose-400">{statsPolyPfR.cur.toFixed(2)}</span> <span className="text-slate-400 dark:text-zinc-500">(IND)</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b] shrink-0" />
                <span>PF (PHASE Y): <span className="font-bold text-amber-600 dark:text-amber-400">{statsPolyPfY.cur.toFixed(2)}</span> <span className="text-slate-400 dark:text-zinc-500">(IND)</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#06b6d4] shrink-0" />
                <span>PF (PHASE B): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsPolyPfB.cur.toFixed(2)}</span> <span className="text-slate-400 dark:text-zinc-500">(IND)</span></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
