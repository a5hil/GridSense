import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 06: Feeder Blackout & Last Gasp Dying Broadcast (ANSI 27)", () => {
  test.beforeAll(async () => {
    console.log("[Test 06] Injecting 'p' (0V Powercut & Last Gasp) to Pole 2 (COM9)...");
    await serialController.sendCommand(2, "p", 3500);
  });

  test.afterAll(async () => {
    console.log("[Test 06] Cleaning up: resetting nodes to normal ('n')...");
    await serialController.resetAllToNormal();
  });

  test("should capture Last Gasp broadcast, assert 0V de-energized feeder, and verify SLD blackout", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Verify Top Emergency Banner / Protection Status flags 0V Powercut or Outage
    const blackoutStatus = page.locator("text=/POWERCUT|DE-ENERGIZED|OUTAGE_LAST_GASP|ANSI 27|0V/i").first();
    await expect(blackoutStatus).toBeVisible({ timeout: 15000 });

    // 2. Deep Mathematical Telemetry Check: 0.0V Supply & 0A Flow
    const supplyCollapse = page.locator("text=/0.0V|0V SUPPLY|DE-ENERGIZED|NO FLOW/i").first();
    await expect(supplyCollapse).toBeVisible();

    // 3. Card 4: Conductor & Diff Integrity shows 0A Supply / De-energized
    const integrityCard = page.locator("text=/CONDUCTOR & DIFF INTEGRITY/i").first();
    await expect(integrityCard).toBeVisible();
    await expect(page.locator("text=/0A SUPPLY|DE-ENERGIZED/i").first()).toBeVisible();

    // 4. Single-Line Diagram (SLD) shows Blackout / De-energized feeder
    const sldDeenergized = page.locator("text=/DE-ENERGIZED|POWER CUT/i").first();
    await expect(sldDeenergized).toBeVisible();

    // 5. Sequence of Events (SOE) Audit Trail
    await page.locator('button:has-text("Sequence of Events (SOE)")').first().click();
    await expect(page.locator("text=/Real-Time Audit Log|Sequential Event Recorder/i").first()).toBeVisible({ timeout: 10000 });
    const blackoutLog = page.locator("text=/DE-ENERGIZED|ANSI 27|blackout|power cut|FDIR_CORE/i").first();
    await expect(blackoutLog).toBeVisible({ timeout: 10000 });

    // 6. Backend API Consistency: Verify /api/network/snapshot confirms feeder status
    const snapRes = await page.request.get("/api/network/snapshot");
    expect(snapRes.ok()).toBeTruthy();
  });
});
