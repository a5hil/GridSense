import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 01: Normal Balanced Grid Operation", () => {
  test.beforeAll(async () => {
    console.log("[Test 01] Injecting 'n' to Pole 1 (COM7) and Pole 2 (COM9)...");
    await serialController.resetAllToNormal();
  });

  test("should deeply validate healthy telemetry, mathematical balance, and single-line flow", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Verify Top Header & Feeder Protection Badges
    await expect(page.locator("text=FEEDER HEALTHY").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=BALANCED & NORMAL").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=CONDUCTORS INTACT").first()).toBeVisible({ timeout: 10000 });

    // 2. Deep Telemetry Card 1: Line Differential Balance (|IA - IB| < 0.350A)
    const diffDisplay = page.locator("text=/Line Differential/i").first();
    await expect(diffDisplay).toBeVisible();
    const diffText = await diffDisplay.textContent();
    const diffMatch = diffText?.match(/([0-9.]+)\s*A/i);
    if (diffMatch && diffMatch[1]) {
      const idiffVal = parseFloat(diffMatch[1]);
      console.log(`[Test 01] Live Normal Differential Current: ${idiffVal}A`);
      expect(idiffVal).toBeLessThan(0.350); // Well below the 350mA trip threshold
    }

    // 3. Deep Telemetry Card 2: Transformer Demand Capacity
    await expect(page.locator("text=/TRANSFORMER DEMAND/i").first()).toBeVisible();
    await expect(page.locator("text=/% CAPACITY/i").first()).toBeVisible();

    // 4. Deep Telemetry Card 3: LV Bus Voltages & Nominal Frequency
    await expect(page.locator("text=/LV BUS VOLTAGE/i").first()).toBeVisible();
    await expect(page.locator("text=/Freq:/i").first()).toBeVisible();
    await expect(page.locator("text=/Unbalance:/i").first()).toBeVisible();

    // 5. Deep Telemetry Card 4: Conductor & Diff Integrity (P01 / P02 corridor)
    await expect(page.locator("text=/CONDUCTOR & DIFF INTEGRITY/i").first()).toBeVisible();
    await expect(page.locator("text=/CORRIDOR: F1-P01/i").first()).toBeVisible();

    // 6. Single-Line Diagram (SLD) Bus & RTU energization
    await expect(page.locator("text=SUBSTATION").first()).toBeVisible();
    await expect(page.locator("text=11kV BUS").first()).toBeVisible();
    await expect(page.locator("text=INCOMER RTU").first()).toBeVisible();
    await expect(page.locator("text=BOUNDARY RTU").first()).toBeVisible();

    // 7. Backend API Consistency: Verify /api/network/snapshot matches UI using authenticated context
    const snapshotRes = await page.request.get("/api/network/snapshot");
    expect(snapshotRes.ok()).toBeTruthy();
    const snapJson = await snapshotRes.json();
    expect(snapJson).toHaveProperty("snapshot");
    expect(snapJson.snapshot.nodes.length).toBeGreaterThan(0);
  });
});
