import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Der Build läuft mit NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (siehe playwright.config.ts); Supabase wird hier gemockt.
const SUPABASE = "http://127.0.0.1:54321";
const SPEICHER = "sb-127-auth-token";

// Aufgabentitel aus Linear (leitstand_aufgaben): in diesen Tests leer, die Seiten fallen auf die Snapshot-Titel zurück.
test.beforeEach(async ({ page }) => {
  await page.route(`${SUPABASE}/rest/v1/leitstand_aufgaben**`, (route) => route.fulfill({ json: [] }));
});

const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();

test("Anmelden lädt und hat keine axe-Fehler", async ({ page }) => {
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("Einstellungen mit Mitteilungen haben keine axe-Fehler", async ({ page, context }) => {
  // Headless-Chromium meldet „denied“ oder hat keinen PushManager; dann zeigt die Seite nur den Hinweis und keinen Schalter.
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    if (!("PushManager" in window)) Object.defineProperty(window, "PushManager", { value: class PushManager {}, configurable: true });
    if (!("Notification" in window)) Object.defineProperty(window, "Notification", { value: class Notification {}, configurable: true });
    if (Notification.permission === "denied") Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true });
  });
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
  await page.goto("/einstellungen");
  await expect(page.getByRole("heading", { name: "Mitteilungen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mitteilungen" })).toBeVisible();
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
  await page.goto("/details");
  await expect(page.getByRole("heading", { name: "Heute in einem Satz" })).toBeVisible();
  await expect(page.getByText("Beispiel-Aufgabe")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("Start bei 390×844: drei Karten, eingeklappt keine Scrollhöhe über 844 px, nur eine Karte offen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.route(`${SUPABASE}/rest/v1/loop_events**`, (route) => route.fulfill({ json: [{ id: "1", created_at: new Date(jetzt - 600_000).toISOString(), project: "beispiel", step: "pr", status: "ok", issue: "SIN-1", pr: 1 }] }));
  await page.route(`${SUPABASE}/rest/v1/loop_snapshot**`, (route) => route.fulfill({ json: [{ project: "beispiel", stage: "work", status: "running", title: "Beispiel-Aufgabe" }] }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("details.aufklapp")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  expect((await axe(page)).violations).toEqual([]);
  await page.locator("details.aufklapp summary").nth(0).click();
  await page.locator("details.aufklapp summary").nth(1).click();
  await expect(page.locator("details.aufklapp[open]")).toHaveCount(1);
});

test("Aufgabe · Ablauf mit 6 Ereignissen hat keine axe-Fehler", async ({ page }) => {
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
  const rollen = ["ceo", "vorarbeiter", "forscher", "bauer", "pruefer", "anwalt"];
  const zeilen = rollen.map((rolle, i) => {
    const zeitpunkt = new Date(jetzt - (6 - i) * 600_000).toISOString();
    return {
      id: String(i),
      created_at: zeitpunkt,
      project: "leitstand",
      step: "rolle",
      status: "ok",
      issue: "SIN-456",
      payload: { rolle, issue: "SIN-456", zeitpunkt, status: i === 5 ? "running" : "ok", zusammenfassung: `Beispiel ${rolle}`, werkzeuge: ["Read", "Edit"], kosten_eur: 0.25 },
    };
  });
  await page.route(`${SUPABASE}/rest/v1/loop_events**`, (route) => route.fulfill({ json: zeilen }));
  await page.route(`${SUPABASE}/rest/v1/loop_snapshot**`, (route) => route.fulfill({ json: [{ project: "leitstand", issue: "SIN-456", title: "Beispiel-Aufgabe", stage: "work", status: "running" }] }));
  await page.goto("/aufgabe/SIN-456");
  await expect(page.getByRole("heading", { name: "Beispiel-Aufgabe" })).toBeVisible();
  // Kennung, Werkzeuge und Einzelmeldungen stehen nur eingeklappt unter „Details“ (SIN-578).
  await page.getByText("Details", { exact: true }).click();
  await expect(page.getByText("SIN-456", { exact: true })).toBeVisible();
  await expect(page.getByText("Beispiel pruefer", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Werkzeuge Anwalt" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});
