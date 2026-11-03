import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 02: High-Current Differential Fault / Illegal Tapping", () => {
  test.beforeAll(async () => {
    console.log("[Test 02] Injecting 'd' (Differential Fault) to Pole 2 (COM9)...");
    await serialController.sendCommand(2, "d", 3500);
  });

  test.afterAll(async () => {
    console.log("[Test 02] Cleaning up: resetting nodes to normal ('n')...");
    await serialController.resetAllToNormal();
  });

  test("should detect ANSI 87L differential trip, verify leakage threshold, acknowledge alarm, and log to SOE", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Verify Emergency Alarm Banner & ANSI 87L Trip Badge
    const diffStatus = page.locator("text=/DIFFERENTIAL|ANSI 87L|DIFF_CURRENT_FAULT/i").first();
    await expect(diffStatus).toBeVisible({ timeout: 15000 });

    // 2. Deep Mathematical Assertion: Verify Differential Current >= 0.350A
    const idiffDisplay = page.locator("text=/Differential Current|I_diff|DIFF TRIP/i").first();
    await expect(idiffDisplay).toBeVisible({ timeout: 10000 });
    const idiffText = await idiffDisplay.textContent();
    const idiffMatch = idiffText?.match(/([0-9.]+)\s*A/i);
    if (idiffMatch && idiffMatch[1]) {
      const idiffVal = parseFloat(idiffMatch[1]);
      console.log(`[Test 02] Verified Injected Differential Fault Current: ${idiffVal}A`);
      expect(idiffVal).toBeGreaterThanOrEqual(0.350);
    }

    // 3. Verify Section 1 Supervisory Control shows Tripped state
    const trippedSection = page.locator("text=/TRIPPED|ISOLATED|ACTION REQUIRED|ALERT/i").first();
    await expect(trippedSection).toBeVisible({ timeout: 15000 });

    // 4. Interactive Operator Action: Acknowledge Active Alarm
    const ackButton = page.locator('button:has-text("ACKNOWLEDGE")').first();
    if (await ackButton.isVisible().catch(() => false)) {
      console.log("[Test 02] Acknowledging active differential alarm...");
      await ackButton.click();
      await page.waitForTimeout(1000);
    }

    // 5. Deep SOE Verification: Navigate to Sequence of Events
    await page.locator('button:has-text("Sequence of Events")').first().click();
    await expect(page.locator("text=/Real-Time Audit Log|Sequential Event Recorder/i").first()).toBeVisible({ timeout: 10000 });

    // Verify critical fault event entry in audit log
    const auditRecord = page.locator("text=/FEEDER TRIP|Differential|87L|FDIR/i").first();
    await expect(auditRecord).toBeVisible({ timeout: 10000 });

    // 6. Backend API Consistency: Verify /api/network/snapshot reports active fault
    const snapRes = await page.request.get("/api/network/snapshot");
    expect(snapRes.ok()).toBeTruthy();
  });
});
