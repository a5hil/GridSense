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
  isAuthChecking: boolean;
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
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [networkSnapshot, setNetworkSnapshot] = useState<NetworkSnapshot | null>(null);
  const [openTicketsCount, setOpenTicketsCount] = useState<number>(0);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [scadaSettings, setScadaSettings] = useState<OmsSettings | null>(null);

  // Load user profile and SCADA settings on mount
  useEffect(() => {
    if (pathname === "/login") {
      setIsAuthChecking(false);
      return;
    }

    fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("UNAUTHORIZED");
        return res.json();
      })
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
          setIsAuthChecking(false);
        } else {
          throw new Error("UNAUTHORIZED");
        }
      })
      .catch(() => {
        setCurrentUser(null);
        setIsAuthChecking(false);
        if (typeof window !== "undefined") {
          window.location.replace("/login");
        }
      });

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

  const setNetworkSnapshotStable = React.useCallback((snap: NetworkSnapshot | null) => {
    setNetworkSnapshot((prev) => (prev === snap ? prev : snap));
  }, []);

  const setOpenTicketsCountStable = React.useCallback((count: number) => {
    setOpenTicketsCount((prev) => (prev === count ? prev : count));
  }, []);

  const setSystemStatusStable = React.useCallback((status: SystemStatus | null) => {
    setSystemStatus((prev) => (prev === status ? prev : status));
  }, []);

  const setIsFaultStable = React.useCallback((fault: boolean) => {
    setIsFault((prev) => (prev === fault ? prev : fault));
  }, []);

  const setActiveFaultAnsiStable = React.useCallback((ansi: string | null) => {
    setActiveFaultAnsi((prev) => (prev === ansi ? prev : ansi));
  }, []);

  const setActiveFaultTitleStable = React.useCallback((title: string | null) => {
    setActiveFaultTitle((prev) => (prev === title ? prev : title));
  }, []);

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
      setIsFault: setIsFaultStable,
      activeFaultAnsi,
      setActiveFaultAnsi: setActiveFaultAnsiStable,
      activeFaultTitle,
      setActiveFaultTitle: setActiveFaultTitleStable,
      connectedSSE,
      setConnectedSSE,
      isAudioMuted,
      setIsAudioMuted,
      toggleAudioMuted,
      lastHeartbeat,
      setLastHeartbeat,
      currentUser,
      setCurrentUser,
      isAuthChecking,
      handleLogout,
      networkSnapshot,
      setNetworkSnapshot: setNetworkSnapshotStable,
      openTicketsCount,
      setOpenTicketsCount: setOpenTicketsCountStable,
      systemStatus,
      setSystemStatus: setSystemStatusStable,
      scadaSettings,
      setScadaSettings,
    }),
    [
      isSidebarCollapsed,
      toggleSidebar,
      activeView,
      isFault,
      setIsFaultStable,
      activeFaultAnsi,
      setActiveFaultAnsiStable,
      activeFaultTitle,
      setActiveFaultTitleStable,
      connectedSSE,
      isAudioMuted,
      toggleAudioMuted,
      lastHeartbeat,
      currentUser,
      isAuthChecking,
      handleLogout,
      networkSnapshot,
      setNetworkSnapshotStable,
      openTicketsCount,
      setOpenTicketsCountStable,
      systemStatus,
      setSystemStatusStable,
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
