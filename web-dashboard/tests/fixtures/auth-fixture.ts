import { Page, expect } from "@playwright/test";

export async function loginAsOperator(page: Page) {
  await page.goto("/");

  // If already on the operations desk, return
  const opDeskBtn = page.locator('button:has-text("Operations Desk")').first();
  if (await opDeskBtn.isVisible().catch(() => false)) {
    return;
  }

  // If redirected to login page, navigate and fill
  if (page.url().includes("/login") || !(await opDeskBtn.isVisible().catch(() => false))) {
    if (!page.url().includes("/login")) {
      await page.goto("/login");
    }
    await page.fill('input[type="text"]', "operator");
    await page.fill('input[type="password"]', "gridsense123");
    await page.locator('button[type="submit"]').first().click({ force: true });
  }

  // Await dashboard mounted
  await expect(opDeskBtn).toBeVisible({ timeout: 15000 });
}
