import { test, expect } from "@playwright/test";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 08: Full SCADA Navigation & Subsystem View Validation", () => {
  test("should seamlessly navigate between all 7 SCADA subsystems, verify controls, and validate settings", async ({ page }) => {
    await loginAsOperator(page);

    // 1. VIEW 1: Operations Desk
    await page.locator('button:has-text("Operations Desk")').first().click();
    await expect(page.locator("text=/FEEDER HEALTHY|FEEDER TRIP|BALANCED|ANOMALIES/i").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/SUBSTATION/i").first()).toBeVisible();

    // 2. VIEW 2: Geospatial GIS
    await page.locator('button:has-text("Geospatial GIS")').first().click();
    await expect(page.locator("text=/DISTRIBUTION ASSET HIERARCHY|GEOSPATIAL TOPOLOGY ENGINE|Mounting Mapbox|Feeder Network/i").first()).toBeVisible({ timeout: 10000 });

    // 3. VIEW 3: 3-Phase Network Model (Digital Twin)
    await page.locator('button:has-text("Network Model")').first().click();
    await expect(page.locator("text=/3-Phase|Digital Twin|Radial|Network/i").first()).toBeVisible({ timeout: 10000 });

    // 4. VIEW 4: Power Quality & Waveforms
    await page.locator('button:has-text("Power Quality & Waveforms")').first().click();
    await expect(page.locator("text=/Waveform|Trend|Power Quality/i").first()).toBeVisible({ timeout: 10000 });

    // 5. VIEW 5: OMS & Field Dispatch
    await page.locator('button:has-text("OMS & Field Dispatch")').first().click();
    await expect(page.locator("text=/Live Outage Supervision|Duty Linemen|SCADA Safety Interlock/i").first()).toBeVisible({ timeout: 10000 });

    // 6. VIEW 6: Communications & RTU (Firmware Diagnostics)
    await page.locator('button:has-text("Communications & RTU")').first().click();
    await expect(page.locator("text=/Gateway|Baud|115200|COM/i").first()).toBeVisible({ timeout: 10000 });

    // 7. VIEW 7: Sequence of Events (SOE) Audit Trail
    await page.locator('button:has-text("Sequence of Events (SOE)")').first().click();
    await expect(page.locator("text=/Sequential Event Recorder|Real-Time Audit Log/i").first()).toBeVisible({ timeout: 10000 });

    // 8. Navigation to Settings Page & Return
    const settingsLink = page.locator('a[href="/settings"]').first();
    if (await settingsLink.isVisible().catch(() => false)) {
      await settingsLink.click();
      await expect(page.locator("text=/SYSTEM SETTINGS|CONFIGURATION/i").first()).toBeVisible({ timeout: 10000 });
      // Return to main dashboard
      await page.locator('a[href="/"]').first().click();
      await expect(page.locator('button:has-text("Operations Desk")').first()).toBeVisible({ timeout: 10000 });
    }

    // 9. Direct Backend API Verification: Check /api/telemetry/ports
    const portsRes = await page.request.get("/api/telemetry/ports");
    expect(portsRes.ok()).toBeTruthy();
    const portsData = await portsRes.json();
    expect(portsData).toHaveProperty("ports");
    expect(Array.isArray(portsData.ports)).toBe(true);
  });
});
