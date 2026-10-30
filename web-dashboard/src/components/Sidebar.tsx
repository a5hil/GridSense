"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Network,
  AudioWaveform,
  Wrench,
  RadioTower,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from "lucide-react";
import { useDashboard, ActiveView } from "@/context/DashboardContext";

interface NavItem {
  id: ActiveView;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  badgeVariant?: "warning" | "destructive" | "normal";
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeView,
    setActiveView,
    networkSnapshot,
    openTicketsCount,
  } = useDashboard();

  // Keep collapse state local to Sidebar so toggling never re-renders the heavy SCADA canvas/charts
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Hydrate persisted state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gridsense_sidebar_collapsed");
      if (saved === "true") setIsCollapsed(true);
    } catch {}
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("gridsense_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  // Professional Webapp Keyboard Shortcut: `[` or `Ctrl+B` / `Cmd+B` to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (
        (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b")
      ) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const isSettingsPage = pathname === "/settings";

  // Calculate dynamic badge indicators
  const detectionCount = networkSnapshot?.detections?.length ?? 0;

  const navItems: NavItem[] = [
    {
      id: "OPERATOR",
      label: "Operations Desk",
      shortcut: "Alt+1",
      icon: LayoutDashboard,
    },
    {
      id: "GIS",
      label: "Geospatial GIS",
      shortcut: "Alt+2",
      icon: MapPin,
    },
    {
      id: "NETWORK",
      label: "Network Model (3Φ)",
      shortcut: "Alt+3",
      icon: Network,
      badgeCount: detectionCount,
      badgeVariant: "destructive",
    },
    {
      id: "WAVEFORMS",
      label: "Power Quality & Waveforms",
      shortcut: "Alt+4",
      icon: AudioWaveform,
    },
    {
      id: "OMS",
      label: "OMS & Field Dispatch",
      shortcut: "Alt+5",
      icon: Wrench,
      badgeCount: openTicketsCount,
      badgeVariant: "warning",
    },
    {
      id: "COMMS",
      label: "Communications & RTU",
      shortcut: "Alt+6",
      icon: RadioTower,
    },
    {
      id: "SOE",
      label: "Sequence of Events (SOE)",
      shortcut: "Alt+7",
      icon: ScrollText,
    },
  ];

  const handleNavClick = (viewId: ActiveView) => {
    setActiveView(viewId);
    if (pathname !== "/") {
      router.push("/");
    }
  };

  return (
    <aside
      aria-label="Primary Navigation"
      data-collapsed={isCollapsed}
      className={`relative h-screen flex flex-col justify-between border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] font-mono select-none shrink-0 z-40 transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isCollapsed ? "w-[60px]" : "w-[248px]"
      }`}
    >
      {/* Interactive Right-Edge Resize/Toggle Rail (Linear/Supabase/Vercel pattern) */}
      <div
        onClick={toggleSidebar}
        title={isCollapsed ? "Expand sidebar ([ or Ctrl+B)" : "Collapse sidebar ([ or Ctrl+B)"}
        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize group/rail z-50 flex items-center justify-center"
      >
        <div className="w-[2px] h-full bg-transparent group-hover/rail:bg-emerald-500/60 transition-colors duration-150" />
      </div>

      {/* 1. TOP BRAND HEADER & COLLAPSE TOGGLE */}
      <div>
        <div className="h-14 border-b border-slate-200 dark:border-zinc-800 flex items-center px-[11px] overflow-hidden">
          {/* Persistent 36x36px Left Brand / Expand Button Slot — zero DOM swap on toggle */}
          <button
            type="button"
            onClick={() => {
              if (isCollapsed) {
                toggleSidebar();
              } else {
                handleNavClick("OPERATOR");
              }
            }}
            className="relative w-9 h-9 rounded-sm bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/15 flex items-center justify-center shrink-0 transition-colors group cursor-pointer"
            title={isCollapsed ? "Expand Sidebar ([)" : "GridSense ADMS Home"}
          >
            <Zap
              className={`h-4 w-4 text-emerald-500 dark:text-emerald-400 fill-emerald-500/80 dark:fill-emerald-400 transition-all duration-150 ${
                isCollapsed
                  ? "group-hover:scale-75 group-hover:opacity-0"
                  : ""
              }`}
            />
            <PanelLeftOpen
              className={`h-4 w-4 text-emerald-600 dark:text-emerald-400 absolute transition-all duration-150 ${
                isCollapsed
                  ? "scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                  : "scale-75 opacity-0 pointer-events-none"
              }`}
            />
          </button>

          {/* Brand Title + Collapse Button — stays mounted in DOM for smooth transition */}
          <div
            className={`flex items-center justify-between flex-1 min-w-0 pl-2.5 transition-[opacity,transform] duration-150 ease-out ${
              isCollapsed
                ? "opacity-0 -translate-x-2 pointer-events-none"
                : "opacity-100 translate-x-0"
            }`}
          >
            <Link
              href="/"
              onClick={() => setActiveView("OPERATOR")}
              className="flex flex-col min-w-0 whitespace-nowrap overflow-hidden"
              tabIndex={isCollapsed ? -1 : 0}
            >
              <span className="text-xs font-black tracking-wider text-slate-900 dark:text-zinc-100 leading-tight">
                GRIDSENSE
              </span>
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest leading-tight">
                ADMS 2.0
              </span>
            </Link>

            <button
              type="button"
              onClick={toggleSidebar}
              tabIndex={isCollapsed ? -1 : 0}
              className="h-7 w-7 rounded-sm flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors shrink-0 cursor-pointer"
              title="Collapse Sidebar ([ or Ctrl+B)"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. PRIMARY NAVIGATION (TOP) */}
        <div className="py-2.5 px-[11px] space-y-1">
          {/* Fixed-height section header prevents vertical icon jumping on collapse */}
          <div className="relative h-5 flex items-center px-2 overflow-hidden">
            <span
              className={`text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 whitespace-nowrap transition-opacity duration-150 ${
                isCollapsed ? "opacity-0" : "opacity-100"
              }`}
            >
              GRID SUPERVISION
            </span>
            <div
              className={`absolute left-2 right-2 h-[1px] bg-slate-200 dark:bg-zinc-800 transition-opacity duration-150 ${
                isCollapsed ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              !isSettingsPage &&
              (activeView === item.id ||
                (item.id === "COMMS" && activeView === "DIAGNOSTICS") ||
                (item.id === "SOE" && activeView === "LOGS"));

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`group relative w-full h-9 flex items-center rounded-sm transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? "bg-emerald-500/12 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/90 dark:hover:bg-zinc-900/70 font-medium"
                }`}
              >
                {/* Left Active Pill Indicator — fixed geometry in both collapsed & expanded states */}
                <span
                  className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all duration-150 ${
                    isActive
                      ? "bg-emerald-600 dark:bg-emerald-400 opacity-100"
                      : "bg-transparent opacity-0"
                  }`}
                />

                {/* Fixed 36x36px Icon Rail Slot — icon never shifts horizontally or vertically */}
                <span className="w-9 h-9 flex items-center justify-center shrink-0 relative">
                  <Icon
                    className={`h-4 w-4 transition-colors duration-150 ${
                      isActive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-zinc-200"
                    }`}
                  />

                  {/* Indicator Pip in Collapsed Mode */}
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span
                      className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#0c0d10] transition-opacity duration-150 ${
                        isCollapsed ? "opacity-100" : "opacity-0"
                      } ${
                        item.badgeVariant === "destructive"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                      }`}
                    />
                  )}
                </span>

                {/* Label & Count Badge — stays mounted in DOM, smoothly clipped */}
                <span
                  className={`flex items-center justify-between flex-1 min-w-0 pr-2.5 overflow-hidden whitespace-nowrap font-sans text-xs tracking-wide transition-[opacity,transform] duration-150 ease-out ${
                    isCollapsed
                      ? "opacity-0 -translate-x-1.5 pointer-events-none"
                      : "opacity-100 translate-x-0"
                  }`}
                >
                  <span className="truncate text-left">{item.label}</span>

                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span
                      className={`ml-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs shrink-0 ${
                        item.badgeVariant === "destructive"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/40"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40"
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </span>

                {/* Unclipped Floating Tooltip in Collapsed Mode */}
                <div
                  className={`absolute left-full ml-2.5 px-2.5 py-1.5 bg-white dark:bg-[#0c0d10] border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-[11px] font-mono rounded-sm shadow-xl whitespace-nowrap pointer-events-none transition-all duration-150 z-[100] flex items-center gap-2 ${
                    isCollapsed
                      ? "opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
                      : "hidden"
                  }`}
                >
                  <span className="font-semibold">{item.label}</span>
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span
                      className={`text-[10px] px-1 rounded-xs font-bold ${
                        item.badgeVariant === "destructive"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/40"
                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-400 dark:text-zinc-500 border border-slate-200 dark:border-zinc-800 px-1 rounded-xs">
                    {item.shortcut}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SECONDARY NAVIGATION (BOTTOM): SETTINGS */}
      <div className="p-[11px] border-t border-slate-200 dark:border-zinc-800">
        <Link
          href="/settings"
          className={`group relative w-full h-9 flex items-center rounded-sm transition-colors duration-150 cursor-pointer ${
            isSettingsPage
              ? "bg-emerald-500/12 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/90 dark:hover:bg-zinc-900/70 font-medium"
          }`}
        >
          {/* Left Active Pill Indicator */}
          <span
            className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all duration-150 ${
              isSettingsPage
                ? "bg-emerald-600 dark:bg-emerald-400 opacity-100"
                : "bg-transparent opacity-0"
            }`}
          />

          {/* Fixed 36x36px Icon Rail Slot */}
          <span className="w-9 h-9 flex items-center justify-center shrink-0">
            <Settings
              className={`h-4 w-4 transition-transform duration-200 group-hover:rotate-45 ${
                isSettingsPage
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-zinc-200"
              }`}
            />
          </span>

          {/* Label & Version — stays mounted in DOM */}
          <span
            className={`flex items-center justify-between flex-1 min-w-0 pr-2.5 overflow-hidden whitespace-nowrap font-sans text-xs tracking-wide transition-[opacity,transform] duration-150 ease-out ${
              isCollapsed
                ? "opacity-0 -translate-x-1.5 pointer-events-none"
                : "opacity-100 translate-x-0"
            }`}
          >
            <span className="truncate text-left">Settings</span>
            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
              v2.0
            </span>
          </span>

          {/* Unclipped Floating Tooltip in Collapsed Mode */}
          <div
            className={`absolute left-full ml-2.5 px-2.5 py-1.5 bg-white dark:bg-[#0c0d10] border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-[11px] font-mono rounded-sm shadow-xl whitespace-nowrap pointer-events-none transition-all duration-150 z-[100] flex items-center gap-2 ${
              isCollapsed
                ? "opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
                : "hidden"
            }`}
          >
            <span className="font-semibold">Settings</span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500">
              v2.0
            </span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
