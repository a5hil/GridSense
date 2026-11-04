import { test, expect } from "@playwright/test";
import { serialController } from "../fixtures/serial-controller";
import { loginAsOperator } from "../fixtures/auth-fixture";

test.describe("Scenario 09: Central Gateway Disconnection & Telemetry Loss Fail-Safe Validation", () => {
  test.beforeAll(async () => {
    console.log("[Test 09] Initializing clean state and normal grid operation...");
    await serialController.resetAllToNormal();
  });

  test.afterAll(async () => {
    console.log("[Test 09] Restoring Gateway connection on COM8 @ 115200 baud...");
    // Fail-safe restoration
    try {
      const res = await fetch("http://localhost:3000/api/telemetry/ports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send cookie if needed or rely on unauth bypass if any, or rely on test-level reconnection
        },
        body: JSON.stringify({ action: "connect", port: "COM8", baudRate: 115200 }),
      });
    } catch {}
    await serialController.resetAllToNormal();
  });

  test("should validate comprehensive SCADA fail-safe state when Central Gateway is disconnected", async ({ page }) => {
    await loginAsOperator(page);

    // 1. Establish initial connected baseline
    await expect(page.locator("text=/FEEDER HEALTHY|BALANCED & NORMAL|CONDUCTORS INTACT/i").first()).toBeVisible({ timeout: 15000 });

    // 2. Navigate to Communications & RTU View to trigger Gateway Disconnect
    await page.locator('button:has-text("Communications & RTU")').first().click();
    await expect(page.locator("text=/RTU Serial Communications Interface/i").first()).toBeVisible({ timeout: 10000 });

    // Click Disconnect Serial Port button
    const disconnectBtn = page.locator('button:has-text("DISCONNECT SERIAL PORT")').first();
    if (await disconnectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await disconnectBtn.click();
    } else {
      // Direct authenticated API fallback if button was already disconnected
      await page.request.post("/api/telemetry/ports", {
        data: { action: "disconnect" },
      });
    }

    // Verify Communications panel confirms offline state
    await expect(page.locator('button:has-text("CONNECT SERIAL PORT")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/Serial Closed|Awaiting Gateway Link/i").first()).toBeVisible({ timeout: 10000 });

    // 3. Navigate back to Operations Desk to validate comprehensive fail-safe UI
    await page.locator('button:has-text("Operations Desk")').first().click();

    // 4. Assert Top Card & Primary Protection Header Fail-Safe
    await expect(page.locator("text=GATEWAY OFFLINE").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=TELEMETRY OFFLINE").first()).toBeVisible({ timeout: 10000 });

    // 5. Assert LV Bus & Transformer Demand Cards in Offline Fallback
    await expect(page.locator("text=/BUS TELEMETRY OFFLINE/i").first()).toBeVisible({ timeout: 10000 });

    // 6. Assert Differential Current and Integrity Fallback (displays '--- A' or '---')
    await expect(page.locator("text=--- A").first()).toBeVisible({ timeout: 10000 });

    // 7. Assert Breaker Single-Line Diagram / Status Fallback
    await expect(page.locator("text=/OFFLINE \\/\\/ UNKNOWN|OFFLINE/i").first()).toBeVisible({ timeout: 10000 });

    // 8. Assert Field Bus Link reflects Gateway Offline
    await expect(page.locator("text=GATEWAY OFFLINE").nth(1)).toBeVisible({ timeout: 10000 });

    // 9. Reconnect the Gateway via UI to restore SCADA operations
    await page.locator('button:has-text("Communications & RTU")').first().click();
    await expect(page.locator('button:has-text("CONNECT SERIAL PORT")').first()).toBeVisible({ timeout: 10000 });

    // Ensure COM8 is selected if ports dropdown is present
    const portSelect = page.locator("select").first();
    if (await portSelect.isVisible().catch(() => false)) {
      const options = await portSelect.locator("option").allTextContents();
      const com8Option = options.find((opt) => opt.toUpperCase().includes("COM8"));
      if (com8Option) {
        await portSelect.selectOption({ label: com8Option });
      }
    }

    // Click Connect button
    await page.locator('button:has-text("CONNECT SERIAL PORT")').first().click();

    // Verify button switches back to Disconnect
    await expect(page.locator('button:has-text("DISCONNECT SERIAL PORT")').first()).toBeVisible({ timeout: 12000 });

    // 10. Return to Operations Desk and verify recovery to healthy telemetry
    await page.locator('button:has-text("Operations Desk")').first().click();

    // Reset EdgeNodes and Gateway latch to normal
    await serialController.resetAllToNormal();

    // Verify recovery
    await expect(page.locator("text=/FEEDER HEALTHY|BALANCED/i").first()).toBeVisible({ timeout: 15000 });
    console.log("[Test 09] Successfully verified Gateway Offline fail-safe state and full recovery.");
  });
});
