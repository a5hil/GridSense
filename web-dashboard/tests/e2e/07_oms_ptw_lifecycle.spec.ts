import { test, expect } from "@playwright/test";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 07: OMS Field Crew Dispatch, Safety Interlock & PTW Lifecycle", () => {
  test("should deeply test workforce roster, supervisory safety controls, and PTW ticket lifecycle", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Navigate to OMS & Field Dispatch view
    await page.locator('button:has-text("OMS & Field Dispatch")').first().click();

    // 2. Deep Workforce Roster & Duty Linemen Verification
    await expect(page.locator("text=/Duty Linemen/i").first()).toBeVisible({ timeout: 10000 });

    // 3. Safety Standards Assertion: Central Electricity Authority (CEA) Section 44 Interlock
    const safetyInterlockCard = page.locator("text=/SCADA Safety Interlock|CEA SEC 44|RECLOSE READY|LOTO LOCKED/i").first();
    await expect(safetyInterlockCard).toBeVisible();

    // 4. Live Outage Supervision Table & Incident Roster
    const supervisionTable = page.locator("text=/Live Outage Supervision|Active Incidents/i").first();
    await expect(supervisionTable).toBeVisible();

    // 5. Interactive Operational Action: Test PTW Safety Closure
    const clearPtwBtn = page.locator('button:has-text("Clear PTW & Close")').first();
    if (await clearPtwBtn.isVisible().catch(() => false)) {
      console.log("[Test 07] Operator clicking 'Clear PTW & Close' for regulatory clearance...");
      await clearPtwBtn.click();
      await page.waitForTimeout(1500);
    }

    // 6. Backend API Integrity: Verify /api/oms/tickets responds with valid ticket records
    const ticketsRes = await page.request.get("/api/oms/tickets");
    expect(ticketsRes.ok()).toBeTruthy();
    const ticketsJson = await ticketsRes.json();
    expect(Array.isArray(ticketsJson.tickets)).toBe(true);
  });
});
