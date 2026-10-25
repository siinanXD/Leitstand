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
  await page.route(`${SUPABASE}/rest/v1/ceo_entscheidungen**`, (route) => route.fulfill({ json: [] }));
  await page.goto("/details");
  await expect(page.getByRole("heading", { name: "Heute in einem Satz" })).toBeVisible();
  await expect(page.getByText("Beispiel-Aufgabe")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

// Fließband-Startseite (SIN-815): /api/fliessband wird im Browser abgefangen, Supabase wie oben gemockt.
const ANMELDUNG = (jetzt: number) => ({
  access_token: "test",
  refresh_token: "test",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(jetzt / 1000) + 3600,
  user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email: "test@example.org", app_metadata: {}, user_metadata: {}, created_at: new Date(jetzt).toISOString() },
});
const fbKarte = (issue: string, produkt: string, station: string, farbe: string, grund: string | null, jetzt: number) => ({
  issue, titel: `Beispiel ${issue}`, produkt, station, farbe, grund, seit: new Date(jetzt - 7_200_000).toISOString(), haken: null,
  links: { linear: `https://linear.app/x/${issue}`, pr: null, run: null },
});
const fbDaten = (jetzt: number, brauchtDich: { text: string; url: string }[]) => ({
  erzeugt: new Date(jetzt).toISOString(),
  produkte: [
    { id: "lernapp", karten: [fbKarte("SIN-11", "lernapp", "baut", "blau", "Repariert sich: SIN-12 läuft.", jetzt), fbKarte("SIN-13", "lernapp", "pruefung", "rot", "Bewertungen fehlen", jetzt), fbKarte("SIN-14", "lernapp", "fertig", "gruen", null, jetzt)] },
    { id: "sjcode-website", karten: [] },
    { id: "stromlauf-ai", karten: [fbKarte("SIN-15", "stromlauf-ai", "geplant", "gelb", "Blockiert durch SIN-16.", jetzt)] },
    { id: "leitstand", karten: [] },
  ],
  brauchtDich,
  brauchtDichText: brauchtDich.length ? null : "Nichts – alles läuft",
});
async function fliessbandSeite(page: Page, brauchtDich: { text: string; url: string }[]) {
  const jetzt = Date.now();
  await page.addInitScript(([schluessel, wert]) => localStorage.setItem(schluessel, wert), [SPEICHER, JSON.stringify(ANMELDUNG(jetzt))]);
  await page.route(`${SUPABASE}/rest/v1/loop_events**`, (route) =>
    route.fulfill({ json: [{ id: "1", created_at: new Date(jetzt - 600_000).toISOString(), project: "lernapp", step: "merge", status: "ok", issue: "SIN-14", pr: 14 }] }),
  );
  await page.route(`${SUPABASE}/rest/v1/loop_snapshot**`, (route) => route.fulfill({ json: [{ project: "lernapp", stage: "work", status: "running", title: "Beispiel", progress: { done: 4, total: 7, ideas: 0 } }] }));
  await page.route(`${SUPABASE}/rest/v1/ceo_entscheidungen**`, (route) => route.fulfill({ json: [] }));
  let anfragen = 0;
  await page.route("**/api/fliessband", (route) => {
    anfragen += 1;
    return route.fulfill({ json: fbDaten(jetzt, brauchtDich) });
  });
  return () => anfragen;
}

test("Test: Startseite zeigt oben „Braucht dich“ mit höchstens 3 Punkten und Los-Link, ohne Punkte den Text „Nichts – alles läuft“", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const punkte = [1, 2, 3].map((n) => ({ text: `Freigabe ${n}`, url: `https://github.com/x/pull/${n}` }));
  await fliessbandSeite(page, punkte);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Braucht dich/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Los:/ })).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Los: Freigabe 1" })).toHaveAttribute("href", "https://github.com/x/pull/1");
  // Handy-Bahn: 8 Stationen, Karte mit SIN-Nummer, Grund, „seit …“ und Stations-Pille.
  await expect(page.getByRole("list", { name: "Stationen Lern-App" }).getByRole("listitem")).toHaveCount(8);
  const karte13 = page.getByRole("link", { name: /^SIN-13 · Beispiel SIN-13/ }).filter({ visible: true });
  await expect(karte13).toBeVisible();
  await expect(karte13).toContainText("Prüfung");
  await expect(page.getByText("Bewertungen fehlen · seit 2 Stunden")).toBeVisible();
  await expect(page.getByText("Fertig-Liste 4/7").first()).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("start-handy.png"), fullPage: true });
});

test("Braucht dich ohne Punkte zeigt „Nichts – alles läuft“", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fliessbandSeite(page, []);
  await page.goto("/");
  await expect(page.getByText("Nichts – alles läuft")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Los:/ })).toHaveCount(0);
});

test("Test: Desktop-Ansicht zeigt Produkte als Zeilen, 8 Stations-Spalten und Zeitleiste der letzten 12 h", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 954 });
  await fliessbandSeite(page, [{ text: "Freigabe 1", url: "https://github.com/x/pull/1" }]);
  await page.goto("/");
  const tabelle = page.getByRole("table", { name: "Fließband: Produkte und Stationen" });
  await expect(tabelle).toBeVisible();
  await expect(tabelle.getByRole("columnheader")).toHaveCount(9);
  await expect(tabelle.getByRole("rowheader")).toHaveCount(4);
  await expect(tabelle.getByRole("rowheader", { name: /Lern-App/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Letzte 12 Stunden" })).toBeVisible();
  await expect(page.getByText("Lern-App: Beispiel SIN-14 gemergt")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("start-desktop.png"), fullPage: true });
});

test("Test: Startseite lädt /api/fliessband alle 60 s neu, ohne Seiten-Neuladen", async ({ page }) => {
  await page.clock.install();
  const anfragen = await fliessbandSeite(page, []);
  await page.goto("/");
  await expect(page.getByText("Nichts – alles läuft")).toBeVisible();
  const vorher = anfragen();
  await page.evaluate(() => ((window as unknown as { __fb: number }).__fb = 1));
  await page.clock.runFor(60_000);
  await expect.poll(anfragen).toBe(vorher + 1);
  // Gleiche Seite: die Markierung im window ist noch da.
  expect(await page.evaluate(() => (window as unknown as { __fb?: number }).__fb)).toBe(1);
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
  await page.route(`${SUPABASE}/rest/v1/ceo_entscheidungen**`, (route) => route.fulfill({ json: [] }));
  await page.goto("/aufgabe/SIN-456");
  await expect(page.getByRole("heading", { name: "Beispiel-Aufgabe" })).toBeVisible();
  // Kennung, Werkzeuge und Einzelmeldungen stehen nur eingeklappt unter „Details“ (SIN-578).
  await page.getByText("Details", { exact: true }).click();
  await expect(page.getByText("SIN-456", { exact: true })).toBeVisible();
  await expect(page.getByText("Beispiel pruefer", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Werkzeuge Anwalt" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("Test: axe-Prüfung der Bubble ist grün (geschlossen und offen, Handy)", async ({ page }) => {
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
  await page.route(`${SUPABASE}/rest/v1/ceo_entscheidungen**`, (route) => route.fulfill({ json: [] }));
  await page.route(`${SUPABASE}/rest/v1/chat_nachrichten**`, (route) => route.fulfill({ json: [{ id: "n1", rolle: "sinan", text: "Wie steht SIN-1?" }, { id: "n2", rolle: "leitstand", text: "SIN-1: nicht bekannt." }] }));
  await page.goto("/details");
  const knopf = page.getByRole("button", { name: "Chat", exact: true });
  await expect(knopf).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await knopf.click();
  await expect(page.getByText("SIN-1: nicht bekannt.")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});
