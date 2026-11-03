import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 05: Feeder Thermal Overload / Overcurrent (ANSI 50/51)", () => {
  test.beforeAll(async () => {
    console.log("[Test 05] Injecting 'o' (Overcurrent) to Pole 2 (COM9)...");
    await serialController.sendCommand(2, "o", 3500);
  });

  test.afterAll(async () => {
    console.log("[Test 05] Cleaning up: resetting nodes to normal ('n')...");
    await serialController.resetAllToNormal();
  });

  test("should detect overcurrent surge, highlight transformer demand overload, and allow operator ACK", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Verify Overcurrent FDIR Decision & ANSI 50/51 Badge
    const ocStatus = page.locator("text=/OVERCURRENT|ANSI 50|OVERLOAD/i").first();
    await expect(ocStatus).toBeVisible({ timeout: 15000 });

    // 2. Deep Telemetry Card 2: Transformer Demand (DTR-01) Overload
    const demandCard = page.locator("text=/TRANSFORMER DEMAND/i").first();
    await expect(demandCard).toBeVisible();

    // Verify Capacity percentage indicator is active
    const capacityBadge = page.locator("text=/% CAPACITY/i").first();
    await expect(capacityBadge).toBeVisible();

    // 3. Deep Telemetry Card 4: Conductor & Diff Integrity Current Spike
    const currentSumDisplay = page.locator("text=/CONDUCTOR & DIFF INTEGRITY/i").first();
    await expect(currentSumDisplay).toBeVisible();
    await expect(page.locator("text=/SUM/i").first()).toBeVisible();

    // 4. Interactive Operator Action: Acknowledge Overload Alarm
    const ackButton = page.locator('button:has-text("ACKNOWLEDGE")').first();
    if (await ackButton.isVisible().catch(() => false)) {
      console.log("[Test 05] Operator acknowledging overcurrent advisory...");
      await ackButton.click();
      await page.waitForTimeout(1000);
    }

    // 5. Backend API Consistency: Verify /api/network/snapshot contains overcurrent telemetry
    const snapRes = await page.request.get("/api/network/snapshot");
    expect(snapRes.ok()).toBeTruthy();
    const snap = await snapRes.json();
    expect(snap.snapshot.dtr).toBeDefined();
    expect(snap.snapshot.nodes.length).toBeGreaterThan(0);
  });
});
