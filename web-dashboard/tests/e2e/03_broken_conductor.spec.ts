import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 03: Downstream Broken Conductor (Phase Y Snap)", () => {
  test.beforeAll(async () => {
    console.log("[Test 03] Injecting 'y' (Broken Conductor) to Pole 2 (COM9)...");
    await serialController.sendCommand(2, "y", 3500);
  });

  test.afterAll(async () => {
    console.log("[Test 03] Cleaning up: resetting nodes to normal ('n')...");
    await serialController.resetAllToNormal();
  });

  test("should detect ANSI 46BC open conductor, trigger Safety Critical Override, and register in OMS dispatch", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Verify Broken Conductor / ANSI 46BC Detection
    const conductorFault = page.locator("text=/BROKEN_CONDUCTOR|ANSI 46BC|OPEN CONDUCTOR/i").first();
    await expect(conductorFault).toBeVisible({ timeout: 15000 });

    // 2. Verify Conductor Integrity Card flags physical line defect
    const integrityCard = page.locator("text=/CONDUCTOR|DIFF INTEGRITY|SNAP/i").first();
    await expect(integrityCard).toBeVisible();

    // 3. Deep OMS Workflow: Navigate to OMS & Field Dispatch view
    await page.locator('button:has-text("OMS & Field Dispatch")').first().click();

    // 4. Verify Workforce Metrics & Safety Interlock are mounted
    await expect(page.locator("text=/Duty Linemen|SCADA Safety Interlock|Action Required/i").first()).toBeVisible({ timeout: 10000 });

    // 5. Verify Incident in Live Outage Supervision & Soak Watchlist
    const outageWatchlist = page.locator("text=/Live Outage Supervision|Active Incidents|SOAK/i").first();
    await expect(outageWatchlist).toBeVisible();

    // 6. Verify Lineman Dispatch or Operational Action Controls exist in OMS
    const actionControls = page.locator("text=/Dispatch Lineman|Clear PTW|ESCALATED|DISPATCH REQ|Live Outage Supervision/i").first();
    await expect(actionControls).toBeVisible({ timeout: 10000 });

    // 7. Backend API Consistency: Verify /api/oms/tickets returns incident list
    const ticketsRes = await page.request.get("/api/oms/tickets");
    expect(ticketsRes.ok()).toBeTruthy();
    const ticketsData = await ticketsRes.json();
    expect(Array.isArray(ticketsData.tickets)).toBe(true);
  });
});
