import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTEN } from "./routes";

// SIN-913: Smoke mit der Sitzung des Agent-Testkontos gegen eine echte Leitstand-Adresse (PLAYWRIGHT_BASE_URL).
// Ohne AGENT_STORAGE_STATE (Datei aus scripts/agent-testnutzer/sitzung.ts) wird übersprungen.
const sitzung = process.env.AGENT_STORAGE_STATE;
test.skip(!sitzung || !process.env.PLAYWRIGHT_BASE_URL, "Kein Testkonto-Sitzung (nur im Workflow agent-testnutzer)");
test.use({ storageState: sitzung });

test("eingeloggt: / zeigt die Übersicht, nicht /anmelden", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).not.toHaveURL(/\/anmelden/);
  await page.screenshot({ path: info.outputPath("uebersicht.png"), fullPage: true });
  await info.attach("uebersicht", { path: info.outputPath("uebersicht.png"), contentType: "image/png" });
});

// SIN-1031: jede Seite aus e2e/routes.ts besuchen (nur lesen).
for (const route of ROUTEN.filter((r) => !r.ausnahme)) {
  test(`eingeloggt: ${route.pfad} lädt ohne Fehler und ohne axe-Verstöße`, async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => m.type() === "error" && fehler.push(m.text()));
    const antwort = await page.goto(route.pfad);
    expect(antwort?.status(), "HTTP-Status").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/anmelden/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Fehler-Grenze von Next.js (das Projekt hat kein eigenes error.tsx).
    await expect(page.getByText(/Application error|This page couldn.t load/)).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(fehler).toEqual([]);
  });
}
