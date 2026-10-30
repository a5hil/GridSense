"use client";

import * as React from "react";
import {
  Compass,
  Crosshair,
  ExternalLink,
  Eye,
  Info,
  Key,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Radio,
  RotateCcw,
  Settings,
  AlertOctagon,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GridTelemetry, PoleData } from "@/lib/types";
import { NetworkSnapshot, NodeState } from "@/lib/network/types";
import { useTheme } from "@/lib/theme-context";

interface GisFeederMapProps {
  telemetry: GridTelemetry | null;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (pole: any) => void;
}

// GPS Coordinates for Real Distribution Feeder Network
const ASSETS = {
  substation: {
    name: "Angamaly 33/11kV Substation",
    coords: [76.40610968438718, 10.23210933563371] as [number, number],
    type: "SUBSTATION",
  },
  dtr: {
    name: "DTR-01 (250 kVA, 11kV/415V)",
    coords: [76.4082, 10.2315] as [number, number],
    type: "DTR",
  },
  pole1: {
    id: "F1-P01",
    name: "F1-P01 // Incomer Terminal",
    coords: [76.4085, 10.2318] as [number, number],
    role: "Incomer",
  },
  pole2: {
    id: "F1-P02",
    name: "F1-P02 // Feeder Section Terminal",
    coords: [76.40875, 10.232172] as [number, number],
    role: "Outgoing",
  },
  spur3: {
    id: "Pole-C",
    name: "Pole 3 // Branch Spur (Planned)",
    coords: [76.40892, 10.232444] as [number, number],
    role: "Branch",
  },
};

// Official Mapbox GL Styles
const MAP_STYLES = {
  DARK: {
    name: "Mapbox SCADA Dark",
    url: "mapbox://styles/mapbox/dark-v11",
  },
  SATELLITE: {
    name: "Mapbox Satellite Streets",
    url: "mapbox://styles/mapbox/satellite-streets-v12",
  },
  STREETS: {
    name: "Mapbox Day Vector",
    url: "mapbox://styles/mapbox/streets-v12",
  },
  NAVIGATION: {
    name: "Mapbox Nav Night",
    url: "mapbox://styles/mapbox/navigation-night-v1",
  },
};

// Fallback raster styles if Mapbox token is unauthorized/empty
const FALLBACK_STYLES = {
  DARK: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  STREETS: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

const DEFAULT_MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

declare global {
  interface Window {
    mapboxgl?: any;
    maplibregl?: any;
  }
}

export const GisFeederMap = React.memo(function GisFeederMap({
  telemetry,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: GisFeederMapProps) {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);
  const markersMapRef = React.useRef<Map<string, { marker: any; el: HTMLDivElement }>>(new Map());
  const appliedStyleRef = React.useRef<string>("");

  const { theme } = useTheme();
  const [mapLoaded, setMapLoaded] = React.useState(false);
  const [mapMode, setMapMode] = React.useState<"NORMAL" | "SATELLITE">("NORMAL");
  const [selectedAsset, setSelectedAsset] = React.useState<any>(null);
  const [mapboxToken, setMapboxToken] = React.useState<string>(DEFAULT_MAPBOX_TOKEN);
  const [tokenAuthError, setTokenAuthError] = React.useState(false);
  const [isLegendOpen, setIsLegendOpen] = React.useState(false);

  const getMapStyleUrl = React.useCallback(
    (mode: "NORMAL" | "SATELLITE", activeTheme: string) => {
      const activeToken = (mapboxToken || DEFAULT_MAPBOX_TOKEN || "").trim();
      const hasToken = activeToken.length > 0;
      if (mode === "SATELLITE") {
        return !hasToken || tokenAuthError
          ? FALLBACK_STYLES.DARK
          : MAP_STYLES.SATELLITE.url;
      }
      const styleKey = activeTheme === "light" ? "STREETS" : "DARK";
      return !hasToken || tokenAuthError
        ? FALLBACK_STYLES[styleKey]
        : MAP_STYLES[styleKey].url;
    },
    [mapboxToken, tokenAuthError]
  );

  const isFault = telemetry?.fault || (telemetry?.idiff ?? 0) >= (telemetry?.trip_limit ?? 0.35);
  const isLastGasp = telemetry?.fault_code === "OUTAGE_LAST_GASP";
  const isPowerCut = telemetry?.fault_code === "POWERCUT" || Boolean(telemetry && (telemetry.p1?.v ?? 0) < 50 && (telemetry.p2?.v ?? 0) < 50);
  const isPowerCutRef = React.useRef(isPowerCut);
  isPowerCutRef.current = isPowerCut;

  // Load custom token from localStorage if present
  React.useEffect(() => {
    try {
      const savedToken = localStorage.getItem("gridsense_mapbox_token");
      if (savedToken && savedToken.trim().length > 0) {
        setMapboxToken(savedToken.trim());
      }
    } catch {
      // LocalStorage access restricted in iframe/sandbox
    }
  }, []);

  // Dynamically update map base style when theme or mapMode changes
  React.useEffect(() => {
    if (mapInstanceRef.current && mapLoaded) {
      const styleUrl = getMapStyleUrl(mapMode, theme);
      if (appliedStyleRef.current !== styleUrl) {
        appliedStyleRef.current = styleUrl;
        mapInstanceRef.current.setStyle(styleUrl, { diff: false });
        mapInstanceRef.current.once("style.load", () => {
          renderFeederVectors(mapInstanceRef.current);
          renderAssetMarkers(mapInstanceRef.current);
        });
      }
    }
  }, [theme, mapMode, mapLoaded, getMapStyleUrl]);

  // 1. Dynamically Load Official Mapbox GL JS v3 & CSS
  React.useEffect(() => {
    const existingScript = document.getElementById("mapbox-gl-script");
    if (!existingScript) {
      // Load CSS
      const link = document.createElement("link");
      link.id = "mapbox-gl-css";
      link.rel = "stylesheet";
      link.href = "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css";
      document.head.appendChild(link);

      // Load Script
      const script = document.createElement("script");
      script.id = "mapbox-gl-script";
      script.src = "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js";
      script.async = true;
      script.onload = () => {
        initializeMap();
      };
      document.body.appendChild(script);
    } else if (window.mapboxgl && !mapInstanceRef.current) {
      initializeMap();
    }

    return () => {
      markersMapRef.current.clear();
      markersRef.current = [];
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapboxToken]);

  // 2. Initialize Mapbox GL Instance
  const initializeMap = () => {
    if (!mapContainerRef.current || !window.mapboxgl) return;

    markersMapRef.current.clear();
    markersRef.current = [];
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const gl = window.mapboxgl;
      const activeToken = (mapboxToken || DEFAULT_MAPBOX_TOKEN || "").trim();
      const hasToken = activeToken.length > 0;
      if (hasToken) {
        gl.accessToken = activeToken;
      }

      const initialTheme =
        typeof document !== "undefined" && document.documentElement.classList.contains("light")
          ? "light"
          : theme;
      const styleUrl = getMapStyleUrl(mapMode, initialTheme);
      appliedStyleRef.current = styleUrl;

      const map = new gl.Map({
        container: mapContainerRef.current,
        style: styleUrl,
        center: [76.4076, 10.2318],
        zoom: 16.2,
        pitch: 45, // 3D SCADA perspective tilt
        bearing: -15,
        attributionControl: false,
      });

      map.addControl(new gl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

      mapInstanceRef.current = map;

      map.on("load", () => {
        setMapLoaded(true);
        setTokenAuthError(false);
        renderFeederVectors(map);
        renderAssetMarkers(map);
      });

      map.on("error", (e: any) => {
        const errorMsg = e?.error?.message || "";
        const status = e?.error?.status || e?.status;
        if (status === 401 || errorMsg.includes("401") || errorMsg.includes("Unauthorized") || errorMsg.includes("access token")) {
          console.warn("[Mapbox GL] Authentication warning:", errorMsg);
          setTokenAuthError(true);
        }
      });

      map.on("idle", () => {
        if (markersRef.current.length === 0) {
          renderAssetMarkers(map);
        }
      });

      map.on("resize", () => {
        if (markersRef.current.length === 0) {
          renderAssetMarkers(map);
        }
      });

      const syncZoomAttr = () => {
        if (mapContainerRef.current) {
          mapContainerRef.current.setAttribute(
            "data-zoomed-in",
            map.getZoom() >= 17.2 ? "true" : "false"
          );
        }
      };
      syncZoomAttr();
      map.on("zoom", syncZoomAttr);
    } catch (err) {
      console.error("Mapbox GL initialization error:", err);
    }
  };

  // 3. Render Feeder Line Vectors
  const renderFeederVectors = (map: any) => {
    if (!map) return;

    // 11kV Substation -> DTR Line
    const feeder11kVSpec = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [ASSETS.substation.coords, ASSETS.dtr.coords],
      },
      properties: { name: "11kV Primary Feeder Cable", color: "#0ea5e9" },
    };

    let features: any[] = [feeder11kVSpec];

    if (networkSnapshot) {
      const topoNodes = networkSnapshot.topology.nodes;
      const nodeCoordMap = new Map<string, [number, number]>();
      topoNodes.forEach((n: any) => nodeCoordMap.set(n.id, [n.lng, n.lat]));

      // Connect each pole to its parent
      topoNodes.forEach((n: any) => {
        if (!n.parentId) return;
        const pCoords = nodeCoordMap.get(n.parentId);
        const nCoords = nodeCoordMap.get(n.id);
        if (!pCoords || !nCoords) return;

        // Check if section is tripped
        const isTripped = networkSnapshot.sections.some(
          (s: any) => s.parentId === n.parentId && s.childIds.includes(n.id) && s.tripped
        );
        const parentNode = networkSnapshot.nodes.find((x: any) => x.id === n.parentId);
        const isDeenergized = (!parentNode?.energized || parentNode?.status === "DEENERGIZED") && (!n.energized || n.status === "DEENERGIZED");

        const feederDef = networkSnapshot.topology.feeders.find((f: any) => f.id === n.feederId);
        const color = isTripped ? "#f43f5e" : isDeenergized ? "#64748b" : feederDef?.color || "#10b981";

        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [pCoords, nCoords],
          },
          properties: {
            name: `${n.parentId} ➔ ${n.id}`,
            color,
            isTripped,
          },
        });
      });
    } else {
      // Fallback 2-Pole Vectors
      const ltLeadSpec = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [ASSETS.dtr.coords, ASSETS.pole1.coords],
        },
        properties: { name: "415V DTR Outgoing LT", color: isPowerCut ? "#64748b" : "#10b981" },
      };

      const protectedSpanSpec = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [ASSETS.pole1.coords, ASSETS.pole2.coords],
        },
        properties: { name: "Protected Feeder Span (FDIR Zone)", color: isFault ? "#f43f5e" : isPowerCut ? "#64748b" : "#10b981" },
      };

      features.push(ltLeadSpec, protectedSpanSpec);
    }

    try {
      if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) {
        return;
      }
      if (!map.getSource("feeder-lines")) {
        map.addSource("feeder-lines", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features,
          },
        });

        // Layer 1: Ambient Neon Feeder Glow
        map.addLayer({
          id: "feeder-lines-glow",
          type: "line",
          source: "feeder-lines",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 6,
            "line-opacity": 0.35,
            "line-blur": 3,
          },
        });

        // Layer 2: Main Solid Conductor
        map.addLayer({
          id: "feeder-lines-layer",
          type: "line",
          source: "feeder-lines",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3,
            "line-opacity": 0.95,
          },
        });

        // Layer 3: Dynamic Energy Flow Particle Stream (Moving Dashes)
        map.addLayer({
          id: "feeder-lines-flow",
          type: "line",
          source: "feeder-lines",
          paint: {
            "line-color": "#ffffff",
            "line-width": 2,
            "line-opacity": 0.85,
            "line-dasharray": [0.4, 2.5],
          },
        });
      } else {
        map.getSource("feeder-lines").setData({
          type: "FeatureCollection",
          features,
        });
      }
    } catch {
      // Style is still transitioning; style.load listener will re-invoke renderFeederVectors
    }
  };

  // Real-time animation loop for flowing energy particles along conductors
  React.useEffect(() => {
    let animId: number;
    let step = 0;
    let lastTime = 0;

    const animateFlow = (time: number) => {
      // Step every ~45ms for smooth ~22fps particle drift; skip GPU repaint if tab is hidden or feeder is de-energized
      if (time - lastTime > 45 && !isPowerCutRef.current && (typeof document === "undefined" || !document.hidden)) {
        lastTime = time;
        step = (step + 0.15) % 4;
        if (mapInstanceRef.current && mapInstanceRef.current.getLayer("feeder-lines-flow")) {
          try {
            mapInstanceRef.current.setPaintProperty("feeder-lines-flow", "line-dasharray", [
              0,
              step,
              0.5,
              Math.max(0.1, 4 - step),
            ]);
          } catch {
            // Layer might be re-creating during style changes
          }
        }
      }
      animId = requestAnimationFrame(animateFlow);
    };

    animId = requestAnimationFrame(animateFlow);
    return () => cancelAnimationFrame(animId);
  }, [mapLoaded]);

  // 4. Render SCADA Asset Markers using Circular Energy Flow Nodes (in-place DOM updates)
  const renderAssetMarkers = (map: any) => {
    if (!map || !window.mapboxgl) return;
    const gl = window.mapboxgl;
    const activeIds = new Set<string>();

    // Helper to create or update Circular Energy Flow Node in-place (preserving hover state & avoiding DOM teardown)
    const upsertCircularNodeMarker = (
      coords: [number, number],
      spec: {
        id: string;
        label: string;
        badgeText: string;
        color: string;
        iconType: "SUBSTATION" | "DTR" | "POLE" | "LIVE_POLE";
        loadingPct?: number;
        isLive?: boolean;
        isSelected?: boolean;
        isDeenergized?: boolean;
        isTripped?: boolean;
        isWarn?: boolean;
        feederName?: string;
        phases?: {
          R: { v: number; i: number; p: number };
          Y: { v: number; i: number; p: number; source?: string };
          B: { v: number; i: number; p: number; source?: string };
        };
        statusText?: string;
      },
      onClick: () => void
    ) => {
      activeIds.add(spec.id);
      const isLight = theme === "light";
      const zIdx = spec.isSelected
        ? "50"
        : spec.isLive
          ? "45"
          : spec.iconType === "SUBSTATION" || spec.iconType === "DTR"
            ? "42"
            : "35";

      const isSub = spec.iconType === "SUBSTATION";
      const isDtr = spec.iconType === "DTR";
      const isLive = spec.isLive || spec.iconType === "LIVE_POLE";
      const size = isSub ? 40 : isDtr ? 38 : 30;
      const alwaysShowPill = Boolean(isSub || isDtr || isLive || spec.isTripped || spec.isSelected);

      // Radar pulse for alarm or live pole
      let haloHtml = "";
      if (spec.isTripped) {
        haloHtml = `
          <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-rose-500/35 animate-ping pointer-events-none -z-10"></div>
          <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-rose-500/25 animate-pulse pointer-events-none -z-10"></div>
        `;
      } else if (isLive && !spec.isDeenergized) {
        haloHtml = `
          <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-emerald-500/20 animate-ping pointer-events-none -z-10"></div>
        `;
      }

      // SVG Icon based on type
      let iconSvg = "";
      if (isSub) {
        // Transmission Grid Tower
        iconSvg = `
          <svg viewBox="0 0 24 24" class="w-4 h-4 text-sky-500 dark:text-sky-400 stroke-current fill-none stroke-[2]">
            <path d="M4 22h16M12 2v20M8 8h8M6 14h12M9 4l6 18M15 4L9 22"/>
          </svg>
        `;
      } else if (isDtr) {
        // Transformer Dual Coils with Donut Arc
        const pct = Math.min(100, Math.max(0, spec.loadingPct ?? 26));
        const circ = 100.5; // 2 * PI * 16
        const strokeColor = pct > 85 ? "#f43f5e" : pct > 65 ? "#f59e0b" : "#10b981";
        const offset = circ * (1 - pct / 100);
        iconSvg = `
          <svg class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 38 38">
            <circle cx="19" cy="19" r="16" stroke="${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.10)"}" stroke-width="1.5" fill="none"/>
            <circle cx="19" cy="19" r="16" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" fill="none"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
          </svg>
          <svg viewBox="0 0 24 24" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-current fill-none stroke-[1.8] relative z-10">
            <circle cx="9" cy="12" r="4.5" />
            <circle cx="15" cy="12" r="4.5" />
          </svg>
        `;
      } else {
        // Uniform Circular Pole Marker (F1-P01..P28)
        const rawPart =
          spec.id === "POLE-A" || spec.id === "Pole-A"
            ? "P1"
            : spec.id === "POLE-B" || spec.id === "Pole-B"
              ? "P2"
              : spec.id.split("-").pop() || spec.id;
        const cleanNum = rawPart.replace(/^P0?/, "P");
        iconSvg = `
          <span class="text-[10px] font-bold font-mono tracking-tight" style="color: ${spec.color}">
            ${cleanNum}
          </span>
        `;
      }

      // Quick hover preview tooltip
      const hoverTooltipHtml = spec.phases
        ? `
        <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none absolute bottom-full mb-2 w-52 ${isLight
          ? "bg-white/95 border border-slate-300 text-slate-800 shadow-xl"
          : "bg-[#090a0f]/95 border border-zinc-700/80 text-zinc-300 shadow-2xl"
        } rounded-sm p-2.5 text-[10px] font-mono z-50 backdrop-blur-md left-1/2 -translate-x-1/2">
          <div class="flex items-center justify-between border-b ${isLight ? "border-slate-200 text-slate-900" : "border-zinc-800 text-zinc-100"} pb-1 mb-1.5 font-bold">
            <span>${spec.label}</span>
            <span class="text-[9px]" style="color: ${spec.color}">${spec.feederName || spec.id}</span>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between items-center"><span class="text-rose-600 dark:text-rose-400 font-bold">[R]</span><span class="${isLight ? "text-slate-800" : "text-zinc-200"} tabular-nums">${spec.phases.R.v.toFixed(1)}V • ${spec.phases.R.i.toFixed(2)}A</span><span class="${isLight ? "text-slate-500" : "text-zinc-400"}">${spec.phases.R.p.toFixed(0)}W</span></div>
            <div class="flex justify-between items-center"><span class="text-amber-700 dark:text-amber-400 font-bold">[Y]</span>${spec.phases.Y.source === "NOT_INSTRUMENTED" ? '<span class="text-[9px] text-amber-600 dark:text-amber-500 italic">NOT INSTR</span>' : `<span class="${isLight ? "text-slate-800" : "text-zinc-200"} tabular-nums">${spec.phases.Y.v.toFixed(1)}V • ${spec.phases.Y.i.toFixed(2)}A</span><span class="${isLight ? "text-slate-500" : "text-zinc-400"}">${spec.phases.Y.p.toFixed(0)}W</span>`}</div>
            <div class="flex justify-between items-center"><span class="text-blue-700 dark:text-cyan-400 font-bold">[B]</span>${spec.phases.B.source === "NOT_INSTRUMENTED" ? '<span class="text-[9px] text-blue-600 dark:text-cyan-500 italic">NOT INSTR</span>' : `<span class="${isLight ? "text-slate-800" : "text-zinc-200"} tabular-nums">${spec.phases.B.v.toFixed(1)}V • ${spec.phases.B.i.toFixed(2)}A</span><span class="${isLight ? "text-slate-500" : "text-zinc-400"}">${spec.phases.B.p.toFixed(0)}W</span>`}</div>
          </div>
          <div class="mt-1.5 pt-1 border-t ${isLight ? "border-slate-200 text-slate-500" : "border-zinc-800 text-zinc-400"} text-[9px] flex justify-between">
            <span>STATUS:</span>
            <span class="${spec.isTripped ? "text-rose-600 dark:text-rose-400 font-bold animate-pulse" : "text-emerald-600 dark:text-emerald-400 font-bold"}">${spec.statusText || "NORMAL"}</span>
          </div>
        </div>
      `
        : "";

      const circleBg = isLight ? "#ffffff" : "#090a0f";
      const selectedRing = spec.isSelected ? `, 0 0 0 3px ${spec.color}55` : "";
      const circleShadow = isLight
        ? `0 1px 4px rgba(0,0,0,0.14), 0 0 4px ${spec.color}33${selectedRing}`
        : `0 0 8px ${spec.color}40, 0 2px 6px rgba(0,0,0,0.75)${selectedRing}`;
      const badgeBg = isLight ? "rgba(255, 255, 255, 0.94)" : "rgba(9, 10, 15, 0.90)";
      const badgeBorder = isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.12)";
      const badgeColor = isLight ? "#0f172a" : "#fafafa";
      const badgeShadow = isLight ? "0 1px 2px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.6)";

      const nextHtml = `
        ${haloHtml}
        ${hoverTooltipHtml}
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${circleBg};
          border: ${spec.isSelected ? "2px" : "1.5px"} solid ${spec.color};
          box-shadow: ${circleShadow};
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transform: ${spec.isSelected ? "scale(1.15)" : "scale(1)"};
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s ease;
        " class="group-hover:scale-125">
          ${iconSvg}
        </div>
        <div class="${alwaysShowPill
          ? "opacity-100"
          : "pole-pill-badge opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        }" style="
          margin-top: 2px;
          background: ${badgeBg};
          border: ${badgeBorder};
          color: ${badgeColor};
          font-family: monospace;
          font-size: 9px;
          font-weight: 700;
          padding: 0.5px 5px;
          border-radius: 9999px;
          white-space: nowrap;
          box-shadow: ${badgeShadow};
          letter-spacing: -0.02em;
        ">
          ${spec.badgeText}
        </div>
      `;

      const existing = markersMapRef.current.get(spec.id);
      if (existing) {
        if (existing.el.innerHTML !== nextHtml) {
          existing.el.innerHTML = nextHtml;
        }
        existing.el.style.zIndex = zIdx;
        existing.el.onclick = onClick;
        return;
      }

      const el = document.createElement("div");
      el.className = "relative flex flex-col items-center cursor-pointer group select-none";
      el.style.zIndex = zIdx;
      el.style.pointerEvents = "auto";
      el.innerHTML = nextHtml;
      el.onclick = onClick;

      const marker = new gl.Marker({ element: el }).setLngLat(coords).addTo(map);
      markersMapRef.current.set(spec.id, { marker, el });
    };

    // 1. Substation Circular Hub
    upsertCircularNodeMarker(
      ASSETS.substation.coords,
      {
        id: "SUBSTATION",
        label: "Angamaly Substation",
        badgeText: "33kV SUB",
        color: "#0ea5e9",
        iconType: "SUBSTATION",
        statusText: "HEALTHY (11kV OK)",
      },
      () => setSelectedAsset(ASSETS.substation)
    );

    // 2. DTR-01 Circular Hub with % Load Arc
    const dtrKva = networkSnapshot ? networkSnapshot.dtr.kva : 65.7;
    const dtrPct = networkSnapshot ? networkSnapshot.dtr.loadingPct : 26.3;
    upsertCircularNodeMarker(
      ASSETS.dtr.coords,
      {
        id: "DTR-01",
        label: "DTR-01 (250 kVA)",
        badgeText: `DTR • ${dtrKva.toFixed(0)}kVA`,
        color: "#10b981",
        iconType: "DTR",
        loadingPct: dtrPct,
        statusText: `ONLINE (${dtrPct}% LOAD)`,
      },
      () => setSelectedAsset(ASSETS.dtr)
    );

    if (networkSnapshot) {
      // Render all 28 poles from Network Twin as Circular Flow Nodes
      networkSnapshot.nodes.forEach((node: any) => {
        if (node.id === "DTR-01") return;
        const topoNode = networkSnapshot.topology.nodes.find((n: any) => n.id === node.id);
        if (!topoNode) return;

        const isLive = node.isLive;
        const isTripped = node.status === "ALARM";
        const isWarn = node.status === "WARN";
        const isDeenergized = node.status === "DEENERGIZED" || !node.energized;

        let color = isTripped
          ? "#f43f5e"
          : isWarn
            ? "#f59e0b"
            : isDeenergized
              ? "#64748b"
              : "#10b981";
        const fDef = networkSnapshot.topology.feeders.find((f: any) => f.id === node.feederId);
        if (!isLive && !isTripped && !isWarn && !isDeenergized) {
          color = fDef?.color || "#71717a";
        }

        const label = isLive
          ? (node.id === "F1-P01" || node.id === "POLE-A")
            ? "F1-P01 (Live Incomer)"
            : "F1-P02 (Live Outgoing)"
          : node.label;

        const shortId = node.id.split("-").pop() || node.id;
        const badgeText = isDeenergized
          ? "0V • OUTAGE"
          : isLive
            ? `${node.phases.R.v.toFixed(0)}V • ${node.phases.R.i.toFixed(2)}A`
            : `${shortId.replace(/^P0?/, "P")} • ${node.phases.R.i.toFixed(1)}A`;

        const normSelected = selectedPoleId?.trim().toLowerCase() || "";
        const isSelected = Boolean(
          normSelected &&
          (node.id.toLowerCase() === normSelected ||
            ((normSelected === "pole-a" || normSelected === "p1" || normSelected === "f1-p01") &&
              (node.id === "F1-P01" || node.id === "POLE-A")) ||
            ((normSelected === "pole-b" || normSelected === "p2" || normSelected === "f1-p02") &&
              (node.id === "F1-P02" || node.id === "POLE-B")))
        );

        upsertCircularNodeMarker(
          [topoNode.lng, topoNode.lat],
          {
            id: node.id,
            label,
            badgeText,
            color,
            iconType: isLive ? "LIVE_POLE" : "POLE",
            isLive,
            isSelected,
            isDeenergized,
            isTripped,
            isWarn,
            feederName: fDef?.name || node.feederId,
            phases: node.phases,
            statusText: isDeenergized ? "DE-ENERGIZED (0V)" : node.status,
          },
          () => {
            setSelectedAsset(node);
            if (onSelectPole) onSelectPole(node);
          }
        );
      });
    } else {
      // Fallback 2-Pole Hardware Markers
      const p1Current = telemetry ? telemetry.p1.i : 2.45;
      const p1Color = isFault ? "#f43f5e" : isPowerCut ? "#64748b" : "#10b981";
      upsertCircularNodeMarker(
        ASSETS.pole1.coords,
        {
          id: "F1-P01",
          label: "F1-P01 (Live Incomer)",
          badgeText: isPowerCut ? "0V • OUTAGE" : `${(telemetry?.p1.v ?? 230).toFixed(0)}V • ${p1Current.toFixed(2)}A`,
          color: p1Color,
          iconType: "LIVE_POLE",
          isLive: true,
          isDeenergized: isPowerCut,
          isTripped: isFault,
          statusText: isPowerCut ? "DE-ENERGIZED (0V)" : isFault ? "DIFFERENTIAL FAULT" : "HEALTHY",
        },
        () => {
          if (telemetry) {
            setSelectedAsset(telemetry.p1);
            if (onSelectPole) onSelectPole(telemetry.p1);
          }
        }
      );

      const p2Current = telemetry ? telemetry.p2.i : 2.43;
      const p2Color = isLastGasp || telemetry?.p2.isOnline === false ? "#f43f5e" : isFault ? "#f43f5e" : isPowerCut ? "#64748b" : "#10b981";
      upsertCircularNodeMarker(
        ASSETS.pole2.coords,
        {
          id: "F1-P02",
          label: "F1-P02 (Live Outgoing)",
          badgeText: telemetry?.p2.isOnline === false ? "OUTAGE" : isPowerCut ? "0V • OUTAGE" : `${(telemetry?.p2.v ?? 230).toFixed(0)}V • ${p2Current.toFixed(2)}A`,
          color: p2Color,
          iconType: "LIVE_POLE",
          isLive: true,
          isDeenergized: isPowerCut || telemetry?.p2.isOnline === false,
          isTripped: isFault || isLastGasp,
          statusText: telemetry?.p2.isOnline === false ? "OUTAGE" : isPowerCut ? "DE-ENERGIZED (0V)" : isFault ? "TRIPPED" : "HEALTHY",
        },
        () => {
          if (telemetry) {
            setSelectedAsset(telemetry.p2);
            if (onSelectPole) onSelectPole(telemetry.p2);
          }
        }
      );
    }

    // Remove any stale markers no longer in activeIds
    for (const [id, entry] of markersMapRef.current.entries()) {
      if (!activeIds.has(id)) {
        entry.marker.remove();
        markersMapRef.current.delete(id);
      }
    }
    markersRef.current = Array.from(markersMapRef.current.values()).map((v) => v.marker);
  };

  // Re-render vectors and markers when telemetry or networkSnapshot updates
  React.useEffect(() => {
    if (mapInstanceRef.current && mapLoaded) {
      renderFeederVectors(mapInstanceRef.current);
      renderAssetMarkers(mapInstanceRef.current);
    }
  }, [telemetry, networkSnapshot, isFault, mapLoaded, theme, selectedPoleId]);

  // Handle container resize & ensure markers are drawn on tab switches
  React.useEffect(() => {
    if (!mapContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
        renderAssetMarkers(mapInstanceRef.current);
      }
    });
    ro.observe(mapContainerRef.current);

    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
        renderAssetMarkers(mapInstanceRef.current);
      }
    }, 350);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [mapLoaded]);

  // Handle Mode Switch (NORMAL vs SATELLITE)
  const handleModeChange = (mode: "NORMAL" | "SATELLITE") => {
    setMapMode(mode);
    if (mapInstanceRef.current) {
      const styleUrl = getMapStyleUrl(mode, theme);
      if (appliedStyleRef.current !== styleUrl) {
        appliedStyleRef.current = styleUrl;
        mapInstanceRef.current.setStyle(styleUrl, { diff: false });
        mapInstanceRef.current.once("style.load", () => {
          renderFeederVectors(mapInstanceRef.current);
          renderAssetMarkers(mapInstanceRef.current);
        });
      }
    }
  };

  // Reset Camera View to Center
  const handleResetCamera = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({
        center: [76.4076, 10.2318],
        zoom: 16.2,
        pitch: 45,
        bearing: -15,
        essential: true,
      });
    }
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col h-full overflow-hidden transition-colors shadow-xs dark:shadow-none">
      {/* Real Map Header Controls */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950/80 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
            GEOGRAPHIC ADMS // ASSET &amp; FEEDER TOPOLOGY GIS
          </span>
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
            WGS84: 10.2319° N, 76.4089° E
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Base Layer Switcher: NORMAL & SATELLITE */}
          <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-sm p-0.5">
            <button
              onClick={() => handleModeChange("NORMAL")}
              className={`px-2.5 py-0.5 text-[10px] rounded-sm transition-colors cursor-pointer ${mapMode === "NORMAL"
                  ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
            >
              NORMAL
            </button>
            <button
              onClick={() => handleModeChange("SATELLITE")}
              className={`px-2.5 py-0.5 text-[10px] rounded-sm transition-colors cursor-pointer ${mapMode === "SATELLITE"
                  ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
            >
              SATELLITE
            </button>
          </div>

          {/* Reset Camera */}
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] font-mono cursor-pointer"
            onClick={handleResetCamera}
            title="Recenter Camera on Angamaly Substation Bus"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            RECENTER
          </Button>
        </div>
      </div>

      {/* Mapbox Real Map Viewport */}
      <div className="relative flex-1 min-h-[400px] bg-slate-100 dark:bg-[#070809] overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Fault Alert Callout Banner over Map */}
        {isFault && (
          <div className="absolute top-14 left-3 border border-rose-500 bg-rose-50/95 dark:bg-zinc-950/95 p-2.5 rounded-sm shadow-2xl flex items-center justify-between gap-3 text-xs font-mono text-rose-900 dark:text-rose-200 animate-pulse z-10 max-w-md">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-500 shrink-0" />
              <div>
                <span className="font-bold uppercase tracking-wider block">
                  ANSI 87L FAULT LOCALIZED // SPAN F1-P01 ↔ F1-P02
                </span>
                <span className="text-[10px] text-rose-700 dark:text-rose-300">
                  Sectionalizer Span (10.231800°N ↔ 10.232172°N) // I_diff = {telemetry?.idiff.toFixed(3)}A
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.flyTo({
                    center: [76.408625, 10.231986],
                    zoom: 18.5,
                    pitch: 45,
                    duration: 1200,
                  });
                }
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] px-2.5 py-1 rounded-xs flex items-center gap-1 shadow-sm shrink-0 cursor-pointer transition-colors"
              title="Smooth zoom camera to faulted differential span"
            >
              <Crosshair className="h-3 w-3" />
              <span>LOCATE FAULT (GIS)</span>
            </button>
          </div>
        )}

        {/* Selected Asset Telemetry HUD Popover */}
        {selectedAsset && (
          <div className="absolute bottom-3 left-3 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 p-3 rounded-sm shadow-2xl max-w-xs font-mono text-xs z-10">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-1 mb-2">
              <span className="font-bold text-slate-900 dark:text-zinc-100 uppercase">
                {selectedAsset.name || selectedAsset.label}
              </span>
              <button
                onClick={() => setSelectedAsset(null)}
                className="text-slate-400 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            </div>

            {selectedAsset.phases ? (
              <div className="space-y-1.5 text-[11px] text-slate-700 dark:text-zinc-300">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-zinc-800 text-[10px]">
                  <span className="text-slate-500 dark:text-zinc-400">FEEDER: {selectedAsset.feederId}</span>
                  <Badge variant={selectedAsset.isLive ? "healthy" : "outline"} className="text-[9px] py-0">
                    {selectedAsset.isLive ? "CLASS 0.5S RTU" : "WLS ESTIMATED NODE"}
                  </Badge>
                </div>
                {/* Phase R */}
                <div className="flex items-center justify-between font-mono">
                  <span className="text-rose-600 dark:text-rose-400 font-bold">[R]</span>
                  <span>{selectedAsset.phases.R.v.toFixed(1)}V</span>
                  <span>{selectedAsset.phases.R.i.toFixed(3)}A</span>
                  <span>{selectedAsset.phases.R.p.toFixed(0)}W</span>
                </div>
                {/* Phase Y */}
                <div className="flex items-center justify-between font-mono">
                  <span className="text-amber-700 dark:text-amber-400 font-bold">[Y]</span>
                  {selectedAsset.phases.Y.source === "NOT_INSTRUMENTED" ? (
                    <span className="text-[9px] text-amber-600 dark:text-amber-500 italic">UNINSTRUMENTED</span>
                  ) : (
                    <>
                      <span>{selectedAsset.phases.Y.v.toFixed(1)}V</span>
                      <span>{selectedAsset.phases.Y.i.toFixed(3)}A</span>
                      <span>{selectedAsset.phases.Y.p.toFixed(0)}W</span>
                    </>
                  )}
                </div>
                {/* Phase B */}
                <div className="flex items-center justify-between font-mono">
                  <span className="text-blue-700 dark:text-cyan-400 font-bold">[B]</span>
                  {selectedAsset.phases.B.source === "NOT_INSTRUMENTED" ? (
                    <span className="text-[9px] text-blue-600 dark:text-cyan-500 italic">UNINSTRUMENTED</span>
                  ) : (
                    <>
                      <span>{selectedAsset.phases.B.v.toFixed(1)}V</span>
                      <span>{selectedAsset.phases.B.i.toFixed(3)}A</span>
                      <span>{selectedAsset.phases.B.p.toFixed(0)}W</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span>PARENT: {selectedAsset.parentId || "ROOT"}</span>
                  <span className={selectedAsset.status === "ALARM" ? "text-rose-600 dark:text-rose-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                    {selectedAsset.status}
                  </span>
                </div>
              </div>
            ) : selectedAsset.v !== undefined ? (
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 dark:text-zinc-300">
                <div>
                  <span className="text-slate-500 dark:text-zinc-500">VOLTAGE:</span>{" "}
                  <span className="tabular-nums font-semibold">{selectedAsset.v.toFixed(1)}V</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-500">CURRENT:</span>{" "}
                  <span className="tabular-nums font-semibold">{selectedAsset.i.toFixed(3)}A</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-500">ACTIVE P:</span>{" "}
                  <span className="tabular-nums font-semibold">
                    {selectedAsset.p ? selectedAsset.p.toFixed(1) : (selectedAsset.v * selectedAsset.i * 0.96).toFixed(1)}W
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-500">RSSI/SNR:</span>{" "}
                  <span className="tabular-nums font-semibold">
                    {selectedAsset.rssi}dBm / +{selectedAsset.snr}dB
                  </span>
                </div>
                <div className="col-span-2 text-[10px] text-slate-500 dark:text-zinc-400 mt-1 pt-1 border-t border-slate-200 dark:border-zinc-800">
                  GPS: {selectedAsset.lat?.toFixed(5)}°N, {selectedAsset.lng?.toFixed(5)}°E
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-700 dark:text-zinc-300 space-y-1">
                <div>
                  <span className="text-slate-500 dark:text-zinc-500">TYPE:</span> {selectedAsset.type || "INFRASTRUCTURE"}
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-500">GRID SECTION:</span> 11kV Feeder 04
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-200 dark:border-zinc-800">
                  COORDS: {selectedAsset.coords?.[1]?.toFixed(4)}°N, {selectedAsset.coords?.[0]?.toFixed(4)}°E
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Formal IEEE/IEC Map Legend */}
        <div className="absolute bottom-3 right-3 z-10 font-mono">
          {isLegendOpen ? (
            <div className="border border-slate-300 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 p-3 rounded-sm text-[10px] space-y-2 shadow-xl backdrop-blur-xs max-w-xs">
              <div className="text-[9px] uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-bold border-b border-slate-200 dark:border-zinc-800 pb-1.5 flex items-center justify-between gap-4">
                <span>IEEE / IEC ELECTRICAL SYMBOLS</span>
                <button
                  onClick={() => setIsLegendOpen(false)}
                  className="text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white px-1.5 py-0.5 rounded border border-slate-300 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-700 text-[9px]"
                >
                  ✕ Close
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs border border-sky-400 bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-[9px] font-bold text-sky-600 dark:text-sky-400">⌁</span>
                <span className="text-slate-800 dark:text-zinc-200">33/11 kV Grid Substation (GSS Incomer)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400">⧇</span>
                <span className="text-slate-800 dark:text-zinc-200">250 kVA Pad-Mounted Transformer (DTR-01)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 ring-2 ring-emerald-500/50 animate-pulse flex items-center justify-center text-[9px] text-emerald-600 dark:text-emerald-300 font-bold">◉</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">ANSI 87L RTU Unit (P01 / P02)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-purple-400 bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-[9px] text-purple-600 dark:text-purple-300">●</span>
                <span className="text-slate-700 dark:text-zinc-300">Tangent &amp; Radial Poles (P03–P28)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-rose-500 bg-rose-50 dark:bg-rose-950/80 animate-ping flex items-center justify-center text-[9px] text-rose-600 dark:text-rose-300">✖</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">Tripped Section / Circuit Lockout</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-zinc-800/80 text-[9px] text-slate-500 dark:text-zinc-400">
                <span className="h-1 w-5 bg-emerald-500 rounded-full inline-block" />
                <span>415/240 V Overhead Aerial Bunched Cable</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsLegendOpen(true)}
              className="bg-white/95 hover:bg-slate-100 dark:bg-zinc-950/85 dark:hover:bg-zinc-900 border border-slate-300 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 px-2 py-1 rounded-sm text-[10px] shadow-lg backdrop-blur-xs flex items-center gap-1.5 transition-colors"
            >
              <Info className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>IEEE / IEC Legend</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
});
