import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Der Build läuft mit NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (siehe playwright.config.ts); Supabase wird hier gemockt.
const SUPABASE = "http://127.0.0.1:54321";
const SPEICHER = "sb-127-auth-token";

const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();

test("Anmelden lädt und hat keine axe-Fehler", async ({ page }) => {
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("ohne Sitzung geht es auf /anmelden", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/anmelden$/);
});

test("Übersicht mit Beispiel-Daten hat keine axe-Fehler", async ({ page }) => {
  const jetzt = Date.now();
  const sitzung = {
    access_token: "test",
    refresh_token: "test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(jetzt / 1000) + 3600,
    user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email: "test@example.org", app_metadata: {}, user_metadata: {}, created_at: new Date(jetzt).toISOString() },
  };
  await page.addInitScript(([schluessel, wert]) => localStorage.setItem(schluessel, wert), [SPEICHER, JSON.stringify(sitzung)]);
  await page.route(`${SUPABASE}/rest/v1/loop_events**`, (route) =>
    route.fulfill({
      json: [
        { id: "1", created_at: new Date(jetzt - 600_000).toISOString(), project: "beispiel", step: "pr", status: "ok", issue: "SIN-1", pr: 1 },
        { id: "2", created_at: new Date(jetzt - 7_200_000).toISOString(), project: "beispiel", step: "gate", status: "start", issue: "SIN-2", pr: null },
      ],
    }),
  );
  await page.route(`${SUPABASE}/rest/v1/loop_snapshot**`, (route) =>
    route.fulfill({
      json: [
        { project: "beispiel", stage: "work", status: "running", title: "Beispiel-Aufgabe", quota_name: "Claude", quota_used: 3, quota_limit: 10 },
        { project: "beispiel-2", stage: "gate", status: "waiting", title: "Beispiel-Freigabe" },
      ],
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Heute in einem Satz" })).toBeVisible();
  await expect(page.getByText("Beispiel-Aufgabe")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});
