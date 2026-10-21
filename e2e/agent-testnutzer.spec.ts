import { expect, test } from "@playwright/test";

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
