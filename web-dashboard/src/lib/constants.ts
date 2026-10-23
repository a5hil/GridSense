/**
 * GridSense Enterprise ADMS - Production Configuration & Naming System
 * Commercial-grade distribution management constants.
 */

export const ENTERPRISE_CONFIG = {
  SYSTEM_NAME: "GridSense ADMS",
  EDITION: "Enterprise Suite",
  VERSION: "2026.4",
  COPYRIGHT: "GridSense ADMS © 2026 // Enterprise Suite",

  // Substation & Primary Infrastructure
  SUBSTATION_NAME: "ANGAMALY 33/11kV PRIMARY SUBSTATION",
  SUBSTATION_SHORT: "ANGAMALY 33/11kV",
  FEEDER_NAME: "FEEDER 04 (11kV INDUSTRIAL/COMMERCIAL)",
  FEEDER_SHORT: "FEEDER 04",
  DTR_NAME: "DTR-01 (250 kVA, 11kV/415V)",
  DTR_SHORT: "DTR-01",
  SECTOR_LT_BUS: "SECTOR 4 LT DISTRIBUTION BUS",
  CONTROL_CENTER: "DISTRIBUTION_CONTROL_CENTER_01",

  // Communications & Protocol
  TELEMETRY_BUS: "SUB-GHZ SCADA MESH",
  RF_BAND: "SECURE SCADA RF LINK",
  RF_STATUS_OK: "SCADA TELEMETRY (OK)",

  // Status Labels
  FEEDER_HEALTHY: "FEEDER HEALTHY",
  FEEDER_ALERT: "FEEDER ALERT",
  GATEWAY_ONLINE: "GATEWAY ONLINE",
  GATEWAY_OFFLINE: "GATEWAY OFFLINE",
  FEED_OFFLINE_MSG: "Telemetry Feed Offline",
  GATEWAY_LOST_MSG: "Gateway Connection Lost",
};
