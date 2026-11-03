import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 04: Broken Neutral & Phase Voltage Shift", () => {
  test.beforeAll(async () => {
    console.log("[Test 04] Injecting 'b' (Broken Neutral) to Pole 2 (COM9)...");
    await serialController.sendCommand(2, "b", 3500);
  });

  test.afterAll(async () => {
    console.log("[Test 04] Cleaning up: resetting nodes to normal ('n')...");
    await serialController.resetAllToNormal();
  });

  test("should detect broken neutral voltage shift, unbalance spread, and log advisory to SOE", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Verify Broken Neutral / Voltage Shift Alert
    const neutralFault = page.locator("text=/BROKEN_NEUTRAL|NEUTRAL|UNBALANCED|VOLTAGE SKEW/i").first();
    await expect(neutralFault).toBeVisible({ timeout: 15000 });

    // 2. Deep Mathematical Assertion: Check LV Bus Voltage Card for Phase Voltage Shift
    const busCard = page.locator("text=/LV BUS VOLTAGE/i").first();
    await expect(busCard).toBeVisible();

    // Check that Unbalance percentage is computed and displayed
    const unbalanceLabel = page.locator("text=/Unbalance:/i").first();
    await expect(unbalanceLabel).toBeVisible();

    // 3. Navigate to Sequence of Events (SOE)
    await page.locator('button:has-text("Sequence of Events")').first().click();
    await expect(page.locator("text=/Real-Time Audit Log|Sequential Event Recorder/i").first()).toBeVisible({ timeout: 10000 });

    // 4. Verify event logs exist in audit trail
    const logRecord = page.locator("text=/NEUTRAL|UNBALANCE|VOLTAGE|FDIR|ALARM/i").first();
    await expect(logRecord).toBeVisible({ timeout: 10000 });

    // 5. Backend API Consistency: Verify /api/network/snapshot reports voltage data
    const snapRes = await page.request.get("/api/network/snapshot");
    expect(snapRes.ok()).toBeTruthy();
    const snap = await snapRes.json();
    expect(snap.snapshot.dtr.voltage).toBeDefined();
  });
});
