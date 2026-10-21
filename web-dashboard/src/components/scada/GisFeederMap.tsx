"use client";

import * as React from "react";
import {
  Compass,
  Crosshair,
  ExternalLink,
  Eye,
  Key,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Radio,
  RotateCcw,
  Settings,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GridTelemetry, PoleData } from "@/lib/types";
import { useTheme } from "@/lib/theme-context";

interface GisFeederMapProps {
  telemetry: GridTelemetry | null;
  selectedPoleId?: string;
  onSelectPole?: (pole: PoleData) => void;
}

// GPS Coordinates for Real Distribution Feeder at FISAT Campus
const ASSETS = {
  substation: {
    name: "FISAT 33/11kV Substation",
    coords: [76.4082, 10.2312] as [number, number],
    type: "SUBSTATION",
  },
  dtr: {
    name: "DTR-01 (250 kVA, 11kV/415V)",
    coords: [76.4085, 10.2315] as [number, number],
    type: "DTR",
  },
  pole1: {
    id: "Pole-A",
    name: "Pole 1 // Incomer (Node A)",
    coords: [76.4088, 10.2318] as [number, number],
    role: "Incomer",
  },
  pole2: {
    id: "Pole-B",
    name: "Pole 2 // Outgoing (Node B)",
    coords: [76.4095, 10.2325] as [number, number],
    role: "Outgoing",
  },
  spur3: {
    id: "Pole-C",
    name: "Pole 3 // Branch Spur (Planned)",
    coords: [76.4102, 10.2331] as [number, number],
    role: "Branch",
  },
};

const MAP_STYLES = {
  DARK: {
    name: "SCADA Dark",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  SATELLITE: {
    name: "Satellite Streets",
    url: {
      version: 8,
      sources: {
        "esri-satellite": {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Esri, Maxar, Earthstar Geographics",
        },
        "carto-labels": {
          type: "raster",
          tiles: [
            "https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: "satellite-layer",
          type: "raster",
          source: "esri-satellite",
        },
        {
          id: "labels-layer",
          type: "raster",
          source: "carto-labels",
        },
      ],
    },
  },
  STREETS: {
    name: "Vector Streets",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
};

declare global {
  interface Window {
    maplibregl?: any;
    mapboxgl?: any;
  }
}

export function GisFeederMap({
  telemetry,
  selectedPoleId,
  onSelectPole,
}: GisFeederMapProps) {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);

  const { theme } = useTheme();
  const [mapLoaded, setMapLoaded] = React.useState(false);
  const [currentStyleKey, setCurrentStyleKey] = React.useState<"DARK" | "SATELLITE" | "STREETS">("DARK");
  const [selectedAsset, setSelectedAsset] = React.useState<any>(null);
  const [mapboxToken, setMapboxToken] = React.useState<string>("");
  const [showTokenModal, setShowTokenModal] = React.useState(false);
  const [mapEngine, setMapEngine] = React.useState<"MapLibre" | "Mapbox">("MapLibre");

  const isFault = telemetry?.fault || (telemetry?.idiff ?? 0) >= (telemetry?.trip_limit ?? 0.35);
  const isLastGasp = telemetry?.fault_code === "OUTAGE_LAST_GASP";

  // Sync with theme changes
  React.useEffect(() => {
    if (theme === "light" && currentStyleKey === "DARK") {
      handleStyleChange("STREETS");
    } else if (theme === "dark" && currentStyleKey === "STREETS") {
      handleStyleChange("DARK");
    }
  }, [theme]);

  // 1. Dynamically Load MapLibre GL JS / Mapbox GL JS
  React.useEffect(() => {
    const existingScript = document.getElementById("gis-map-script");
    if (!existingScript) {
      // Load CSS
      const link = document.createElement("link");
      link.id = "gis-map-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
      document.head.appendChild(link);

      // Load Script
      const script = document.createElement("script");
      script.id = "gis-map-script";
      script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
      script.async = true;
      script.onload = () => {
        initializeMap();
      };
      document.body.appendChild(script);
    } else if (window.maplibregl && !mapInstanceRef.current) {
      initializeMap();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Initialize Map Instance
  const initializeMap = () => {
    if (!mapContainerRef.current || !window.maplibregl || mapInstanceRef.current) return;

    try {
      const gl = window.maplibregl;
      const map = new gl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLES[currentStyleKey].url,
        center: [76.4089, 10.2319],
        zoom: 16.5,
        pitch: 45, // 3D SCADA perspective tilt
        bearing: -15,
        attributionControl: false,
      });

      map.addControl(new gl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

      mapInstanceRef.current = map;

      map.on("load", () => {
        setMapLoaded(true);
        renderFeederVectors(map);
        renderAssetMarkers(map);
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
    } catch (err) {
      console.error("Map initialization error:", err);
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
      properties: { name: "11kV Primary Feeder Cable" },
    };

    // 415V LT Line: DTR -> Pole 1
    const ltLeadSpec = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [ASSETS.dtr.coords, ASSETS.pole1.coords],
      },
      properties: { name: "415V DTR Outgoing LT" },
    };

    // 415V Protected Span: Pole 1 -> Pole 2 (Active Differential Zone)
    const protectedSpanSpec = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [ASSETS.pole1.coords, ASSETS.pole2.coords],
      },
      properties: { name: "Protected Feeder Span (FDIR Zone)" },
    };

    // Branch Spur: Pole 2 -> Spur 3
    const spurSpec = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [ASSETS.pole2.coords, ASSETS.spur3.coords],
      },
      properties: { name: "Branch Lateral Spur 1" },
    };

    // Add or Update Sources
    if (!map.getSource("feeder-lines")) {
      map.addSource("feeder-lines", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [feeder11kVSpec, ltLeadSpec, spurSpec],
        },
      });

      map.addLayer({
        id: "feeder-lines-layer",
        type: "line",
        source: "feeder-lines",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 3,
          "line-dasharray": [2, 1],
        },
      });
    }

    // Protected Span Source (Dynamically Styled on Fault)
    const spanColor = isFault ? "#f43f5e" : "#10b981";
    const spanWidth = isFault ? 6 : 4;

    if (!map.getSource("protected-span")) {
      map.addSource("protected-span", {
        type: "geojson",
        data: protectedSpanSpec,
      });

      map.addLayer({
        id: "protected-span-layer",
        type: "line",
        source: "protected-span",
        paint: {
          "line-color": spanColor,
          "line-width": spanWidth,
        },
      });
    } else {
      map.getSource("protected-span").setData(protectedSpanSpec);
      if (map.getLayer("protected-span-layer")) {
        map.setPaintProperty("protected-span-layer", "line-color", spanColor);
        map.setPaintProperty("protected-span-layer", "line-width", spanWidth);
      }
    }
  };

  // 4. Render SCADA Asset Markers
  const renderAssetMarkers = (map: any) => {
    if (!map || !window.maplibregl) return;
    const gl = window.maplibregl;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Helper to create HTML element for marker
    const createMarkerElement = (
      label: string,
      sublabel: string,
      color: string,
      isPulsing = false,
      showRadarPing = false
    ) => {
      const el = document.createElement("div");
      el.className = "relative flex flex-col items-center cursor-pointer group z-30 select-none";
      el.style.zIndex = "40";
      el.style.pointerEvents = "auto";

      const radarPingHtml = showRadarPing
        ? `<div class="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-rose-500/40 animate-ping pointer-events-none -z-10"></div>
           <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-rose-500/30 animate-pulse pointer-events-none -z-10"></div>`
        : "";

      el.innerHTML = `
        ${radarPingHtml}
        <div style="background: #09090b; border: 2px solid ${color}; color: #fafafa; padding: 2px 6px; border-radius: 2px; font-family: monospace; font-size: 10px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 4px;" class="${
        isPulsing ? "animate-pulse" : ""
      }">
          <span style="height: 6px; width: 6px; border-radius: 50%; background: ${color};"></span>
          <span>${label}</span>
        </div>
        <div style="background: rgba(9, 9, 11, 0.9); border: 1px solid #27272a; color: ${color}; font-size: 9px; font-family: monospace; padding: 1px 4px; border-radius: 2px; margin-top: 2px;">
          ${sublabel}
        </div>
      `;
      return el;
    };

    // 1. Substation Marker
    const subEl = createMarkerElement("SUBSTATION 33kV", "PRIMARY", "#0ea5e9");
    const subMarker = new gl.Marker({ element: subEl })
      .setLngLat(ASSETS.substation.coords)
      .addTo(map);
    subEl.onclick = () => setSelectedAsset(ASSETS.substation);
    markersRef.current.push(subMarker);

    // 2. DTR Marker
    const dtrEl = createMarkerElement("DTR-01", "250 kVA", "#10b981");
    const dtrMarker = new gl.Marker({ element: dtrEl })
      .setLngLat(ASSETS.dtr.coords)
      .addTo(map);
    dtrEl.onclick = () => setSelectedAsset(ASSETS.dtr);
    markersRef.current.push(dtrMarker);

    // 3. Pole 1 (Incomer) Marker
    const p1Current = telemetry ? `${telemetry.p1.i.toFixed(2)}A` : "2.45A";
    const p1Color = isFault ? "#f43f5e" : "#10b981";
    const p1El = createMarkerElement("POLE 1 (INCOMER)", `${p1Current} | 230V`, p1Color, isFault, isFault || isLastGasp);
    const p1Marker = new gl.Marker({ element: p1El })
      .setLngLat(ASSETS.pole1.coords)
      .addTo(map);
    p1El.onclick = () => {
      if (telemetry) {
        setSelectedAsset(telemetry.p1);
        if (onSelectPole) onSelectPole(telemetry.p1);
      }
    };
    markersRef.current.push(p1Marker);

    // 4. Pole 2 (Outgoing) Marker
    const p2Current = telemetry ? `${telemetry.p2.i.toFixed(2)}A` : "2.43A";
    const p2Color = isLastGasp || telemetry?.p2.isOnline === false ? "#f43f5e" : isFault ? "#f43f5e" : "#10b981";
    const p2Sublabel = telemetry?.p2.isOnline === false ? "OUTAGE" : `${p2Current} | 230V`;
    const p2El = createMarkerElement("POLE 2 (OUTGOING)", p2Sublabel, p2Color, isFault || isLastGasp, isFault || isLastGasp);
    const p2Marker = new gl.Marker({ element: p2El })
      .setLngLat(ASSETS.pole2.coords)
      .addTo(map);
    p2El.onclick = () => {
      if (telemetry) {
        setSelectedAsset(telemetry.p2);
        if (onSelectPole) onSelectPole(telemetry.p2);
      }
    };
    markersRef.current.push(p2Marker);
  };

  // Re-render vectors and markers when telemetry updates
  React.useEffect(() => {
    if (mapInstanceRef.current && mapLoaded) {
      renderFeederVectors(mapInstanceRef.current);
      renderAssetMarkers(mapInstanceRef.current);
    }
  }, [telemetry, isFault, mapLoaded]);

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

  // Handle Style Switch
  const handleStyleChange = (styleKey: "DARK" | "SATELLITE" | "STREETS") => {
    setCurrentStyleKey(styleKey);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setStyle(MAP_STYLES[styleKey].url);
      mapInstanceRef.current.once("style.load", () => {
        renderFeederVectors(mapInstanceRef.current);
        renderAssetMarkers(mapInstanceRef.current);
      });
    }
  };

  // Reset Camera View to Center
  const handleResetCamera = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({
        center: [76.4089, 10.2319],
        zoom: 16.5,
        pitch: 45,
        bearing: -15,
        essential: true,
      });
    }
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] rounded-sm flex flex-col h-full overflow-hidden transition-colors shadow-xs dark:shadow-none">
      {/* Real Map Header Controls */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-3 py-2 bg-slate-50 dark:bg-zinc-950/80 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
            MAPBOX GIS GEOSPATIAL VECTOR MAP // REAL-WORLD FEEDER
          </span>
          <Badge variant="outline" className="text-[10px]">
            WGS84: 10.2319° N, 76.4089° E
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Base Layer Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-sm p-0.5">
            <button
              onClick={() => handleStyleChange("DARK")}
              className={`px-2 py-0.5 text-[10px] rounded-sm transition-colors ${
                currentStyleKey === "DARK"
                  ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              SCADA DARK
            </button>
            <button
              onClick={() => handleStyleChange("STREETS")}
              className={`px-2 py-0.5 text-[10px] rounded-sm transition-colors ${
                currentStyleKey === "STREETS"
                  ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              DAY VECTOR
            </button>
            <button
              onClick={() => handleStyleChange("SATELLITE")}
              className={`px-2 py-0.5 text-[10px] rounded-sm transition-colors ${
                currentStyleKey === "SATELLITE"
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
            className="h-6 px-2 text-[10px]"
            onClick={handleResetCamera}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            CENTER
          </Button>
        </div>
      </div>

      {/* Mapbox Real Map Viewport */}
      <div className="relative flex-1 min-h-[350px] bg-[#070809] overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Fault Alert Callout Banner over Map */}
        {isFault && (
          <div className="absolute top-3 left-3 border border-rose-600 bg-zinc-950/95 p-2.5 rounded-sm shadow-2xl flex items-center gap-2 text-xs font-mono text-rose-200 animate-pulse z-10">
            <ShieldAlert className="h-4 w-4 text-rose-500 animate-bounce" />
            <div>
              <span className="font-bold uppercase tracking-wider block">
                DIFFERENTIAL FAULT PINPOINTED ON REAL MAP
              </span>
              <span className="text-[10px] text-rose-300">
                Between Pole 1 (10.2318°N) and Pole 2 (10.2325°N) // ΔI = {telemetry?.idiff.toFixed(3)}A
              </span>
            </div>
          </div>
        )}

        {/* Selected Asset Telemetry HUD Popover */}
        {selectedAsset && (
          <div className="absolute bottom-3 left-3 border border-zinc-700 bg-zinc-950/95 p-3 rounded-sm shadow-2xl max-w-xs font-mono text-xs z-10">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1 mb-2">
              <span className="font-bold text-zinc-100 uppercase">
                {selectedAsset.name || selectedAsset.label}
              </span>
              <button
                onClick={() => setSelectedAsset(null)}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            </div>

            {selectedAsset.v !== undefined ? (
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-300">
                <div>
                  <span className="text-zinc-500">VOLTAGE:</span>{" "}
                  <span className="tabular-nums font-semibold">{selectedAsset.v.toFixed(1)}V</span>
                </div>
                <div>
                  <span className="text-zinc-500">CURRENT:</span>{" "}
                  <span className="tabular-nums font-semibold">{selectedAsset.i.toFixed(3)}A</span>
                </div>
                <div>
                  <span className="text-zinc-500">ACTIVE P:</span>{" "}
                  <span className="tabular-nums font-semibold">
                    {selectedAsset.p ? selectedAsset.p.toFixed(1) : (selectedAsset.v * selectedAsset.i * 0.96).toFixed(1)}W
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">RSSI/SNR:</span>{" "}
                  <span className="tabular-nums font-semibold">
                    {selectedAsset.rssi}dBm / +{selectedAsset.snr}dB
                  </span>
                </div>
                <div className="col-span-2 text-[10px] text-zinc-400 mt-1 pt-1 border-t border-zinc-800">
                  GPS: {selectedAsset.lat?.toFixed(5)}°N, {selectedAsset.lng?.toFixed(5)}°E
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-zinc-300 space-y-1">
                <div>
                  <span className="text-zinc-500">TYPE:</span> {selectedAsset.type || "INFRASTRUCTURE"}
                </div>
                <div>
                  <span className="text-zinc-500">GRID SECTION:</span> 11kV Feeder 04
                </div>
                <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-800">
                  COORDS: {selectedAsset.coords?.[1]?.toFixed(4)}°N, {selectedAsset.coords?.[0]?.toFixed(4)}°E
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 right-3 border border-zinc-800 bg-zinc-950/90 px-2.5 py-1.5 rounded-sm font-mono text-[10px] space-y-1 z-10">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-zinc-300">11kV Primary Feeder Cable</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-300">415V LT Feeder Conductor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-rose-300">FDIR Protected Zone (Fault)</span>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="border-t border-zinc-800 px-3 py-1.5 bg-zinc-950/70 flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <div className="flex items-center gap-3">
          <span>ENGINE: REAL MAPBOX / MAPLIBRE WebGL</span>
          <span>•</span>
          <span>PITCH: 45° 3D TILT</span>
          <span>•</span>
          <span>TILES: CartoDB Dark Matter / Esri World Imagery</span>
        </div>
        <div className="text-emerald-400">
          HARDWARE ACCELERATED (60 FPS)
        </div>
      </div>
    </div>
  );
}
