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
  TELEMETRY_BUS: "LR1121 SUB-GHZ RF MESH",
  RF_BAND: "866.3 MHz IN865",
  RF_STATUS_OK: "866.3 MHz IN865 (OK)",

  // Status Labels
  FEEDER_HEALTHY: "FEEDER HEALTHY",
  FEEDER_ALERT: "FEEDER ALERT",
  GATEWAY_ONLINE: "GATEWAY ONLINE",
  GATEWAY_OFFLINE: "GATEWAY OFFLINE",
  FEED_OFFLINE_MSG: "Telemetry Feed Offline",
  GATEWAY_LOST_MSG: "Gateway Connection Lost",
};
