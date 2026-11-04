import { Page, expect } from "@playwright/test";

export async function loginAsOperator(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // If already on the operations desk, return
  const opDeskBtn = page.locator('button:has-text("Operations Desk")').first();
  if (await opDeskBtn.isVisible().catch(() => false)) {
    return;
  }

  // If redirected to login page, fill and submit
  if (page.url().includes("/login")) {
    await page.fill('input[type="text"]', "operator");
    await page.fill('input[type="password"]', "gridsense123");
    await page.locator('button[type="submit"]').first().click({ force: true });
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});
  } else if (!(await opDeskBtn.isVisible().catch(() => false))) {
    await page.goto("/login");
    await page.fill('input[type="text"]', "operator");
    await page.fill('input[type="password"]', "gridsense123");
    await page.locator('button[type="submit"]').first().click({ force: true });
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});
  }

  // Await dashboard mounted
  await expect(opDeskBtn).toBeVisible({ timeout: 20000 });
}
