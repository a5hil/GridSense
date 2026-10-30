import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  WifiOff,
  ZapOff,
  Lock,
  FlaskConical,
  Activity,
  LucideIcon,
} from "lucide-react";

export type AlarmSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "WARNING" | "INFO" | "OK";

interface StatusIconProps {
  severity: AlarmSeverity;
  acked?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Standardized ISA-101 / ISA-18.2 compliant status & alarm icon component.
 * Shapes uniquely differentiate alarm priority regardless of color perception:
 * - CRITICAL: Octagon (Stop / Trip)
 * - WARNING/HIGH: Triangle (Caution / Limit excursion)
 * - INFO: Circle Info
 * - OK: Circle Check
 * Motion (pulse/blink) is strictly reserved for UNACKNOWLEDGED alarms.
 */
export const StatusIcon: React.FC<StatusIconProps> = ({
  severity,
  acked = true,
  className = "",
  size = "md",
}) => {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  }[size];

  // Motion rule: ONLY unacknowledged active alarms are permitted to animate
  const motionClass = !acked ? "animate-pulse" : "";

  switch (severity) {
    case "CRITICAL":
      return (
        <AlertOctagon
          className={`${sizeClasses} text-rose-600 dark:text-rose-500 shrink-0 ${motionClass} ${className}`}
          aria-label="Critical Alarm"
        />
      );
    case "HIGH":
    case "WARNING":
    case "MEDIUM":
      return (
        <AlertTriangle
          className={`${sizeClasses} text-amber-500 dark:text-amber-400 shrink-0 ${motionClass} ${className}`}
          aria-label="Warning Alarm"
        />
      );
    case "INFO":
      return (
        <Info
          className={`${sizeClasses} text-cyan-600 dark:text-cyan-400 shrink-0 ${className}`}
          aria-label="Advisory Information"
        />
      );
    case "OK":
    default:
      return (
        <CheckCircle2
          className={`${sizeClasses} text-emerald-600 dark:text-emerald-400 shrink-0 ${className}`}
          aria-label="Normal Healthy State"
        />
      );
  }
};

/**
 * GridSense Standard Icon System Mapping
 * Ensures 1:1 conceptual mapping across the entire ADMS console.
 */
export const ScadaIcons = {
  // Alarm & Condition
  Critical: AlertOctagon,
  Warning: AlertTriangle,
  Info: Info,
  Healthy: CheckCircle2,
  CommsOffline: WifiOff,
  DeEnergized: ZapOff,
  Interlock: Lock,
  Simulation: FlaskConical,

  // Technical Domain
  LiveTelemetry: Activity,
};

