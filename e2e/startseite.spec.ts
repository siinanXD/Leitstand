import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Startseite lädt und hat keine axe-Fehler", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});
