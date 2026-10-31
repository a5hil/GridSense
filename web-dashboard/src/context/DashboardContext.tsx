"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ScadaUser } from "@/lib/auth";
import { NetworkSnapshot } from "@/lib/network/types";
import { OmsSettings, SystemStatus } from "@/lib/types";

export type ActiveView =
  | "OPERATOR"
  | "GIS"
  | "NETWORK"
  | "WAVEFORMS"
  | "OMS"
  | "COMMS"
  | "SOE"
  | "DIAGNOSTICS"
  | "LOGS";

interface DashboardContextType {
  // Sidebar state
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;

  // Navigation view
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  // System & Telemetry health states
  isFault: boolean;
  setIsFault: (isFault: boolean) => void;
  activeFaultAnsi: string | null;
  setActiveFaultAnsi: (ansi: string | null) => void;
  activeFaultTitle: string | null;
  setActiveFaultTitle: (title: string | null) => void;

  // Comms & Hardware States
  connectedSSE: boolean;
  setConnectedSSE: (connected: boolean) => void;
  isAudioMuted: boolean;
  setIsAudioMuted: React.Dispatch<React.SetStateAction<boolean>>;
  toggleAudioMuted: () => void;
  lastHeartbeat: string;
  setLastHeartbeat: (time: string) => void;

  // Operator Profile
  currentUser: ScadaUser | null;
  setCurrentUser: (user: ScadaUser | null) => void;
  handleLogout: () => void;

  // Macro metrics & Badges
  networkSnapshot: NetworkSnapshot | null;
  setNetworkSnapshot: (snap: NetworkSnapshot | null) => void;
  openTicketsCount: number;
  setOpenTicketsCount: (count: number) => void;
  systemStatus: SystemStatus | null;
  setSystemStatus: (status: SystemStatus | null) => void;
  scadaSettings: OmsSettings | null;
  setScadaSettings: (settings: OmsSettings | null) => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<ActiveView>("OPERATOR");
  const [isFault, setIsFault] = useState<boolean>(false);
  const [activeFaultAnsi, setActiveFaultAnsi] = useState<string | null>(null);
  const [activeFaultTitle, setActiveFaultTitle] = useState<string | null>(null);
  const [connectedSSE, setConnectedSSE] = useState<boolean>(true);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("--:--:--");
  const [currentUser, setCurrentUser] = useState<ScadaUser | null>(null);
  const [networkSnapshot, setNetworkSnapshot] = useState<NetworkSnapshot | null>(null);
  const [openTicketsCount, setOpenTicketsCount] = useState<number>(0);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [scadaSettings, setScadaSettings] = useState<OmsSettings | null>(null);

  // Load user profile and SCADA settings on mount
  useEffect(() => {
    if (pathname === "/login") return;

    fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});

    fetch("/api/oms/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.settings) {
          setScadaSettings(data.settings);
        }
      })
      .catch(() => {});

    fetch("/api/network/snapshot", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.snapshot) {
          setNetworkSnapshot(data.snapshot);
          if (data.snapshot.detections && data.snapshot.detections.length > 0) {
            setIsFault(true);
            setActiveFaultAnsi(data.snapshot.detections[0].ansiCode || "87L");
            setActiveFaultTitle(data.snapshot.detections[0].title || "Feeder Anomaly");
          } else if (!data.snapshot.liveLinkUp) {
            setIsFault(true);
            setActiveFaultAnsi("COMMS");
            setActiveFaultTitle("Node Offline // Gateway Disconnected");
          }
        }
      })
      .catch(() => {});
  }, [pathname]);

  const toggleSidebar = React.useCallback(() => setIsSidebarCollapsed((prev) => !prev), []);
  const toggleAudioMuted = React.useCallback(() => setIsAudioMuted((prev) => !prev), []);

  const handleLogout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setCurrentUser(null);
    window.location.href = "/login";
  }, []);

  const contextValue = React.useMemo(
    () => ({
      isSidebarCollapsed,
      setIsSidebarCollapsed,
      toggleSidebar,
      activeView,
      setActiveView,
      isFault,
      setIsFault,
      activeFaultAnsi,
      setActiveFaultAnsi,
      activeFaultTitle,
      setActiveFaultTitle,
      connectedSSE,
      setConnectedSSE,
      isAudioMuted,
      setIsAudioMuted,
      toggleAudioMuted,
      lastHeartbeat,
      setLastHeartbeat,
      currentUser,
      setCurrentUser,
      handleLogout,
      networkSnapshot,
      setNetworkSnapshot,
      openTicketsCount,
      setOpenTicketsCount,
      systemStatus,
      setSystemStatus,
      scadaSettings,
      setScadaSettings,
    }),
    [
      isSidebarCollapsed,
      toggleSidebar,
      activeView,
      isFault,
      activeFaultAnsi,
      activeFaultTitle,
      connectedSSE,
      isAudioMuted,
      toggleAudioMuted,
      lastHeartbeat,
      currentUser,
      handleLogout,
      networkSnapshot,
      openTicketsCount,
      systemStatus,
      scadaSettings,
    ]
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return ctx;
}
