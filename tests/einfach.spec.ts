import { expect, test, type Page } from "@playwright/test";

// Sechsjährigen-Test (SIN-578): auf den sechs Menü-Seiten keine Zahl ohne Wort, keine Kennungen, keine Zeitstempel, keine Tabelle.
// Supabase wird wie in e2e/startseite.spec.ts gemockt (Build mit NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321).
const SUPABASE = "http://127.0.0.1:54321";
const SPEICHER = "sb-127-auth-token";
const SEITEN = [
  ["Start", "/"],
  ["Team", "/team"],
  ["Werkzeuge", "/werkzeuge"],
  ["Produkt", "/projekte"],
  ["Aufgabe", "/aufgabe/SIN-456"],
  ["Kosten", "/kosten"],
] as const;
const GROESSEN = [
  ["Handy", { width: 390, height: 844 }],
  ["Desktop", { width: 1280, height: 800 }],
] as const;

const VERBOTEN: [string, RegExp][] = [
  ["Ziffernfolge ohne Einheit oder Wort", /\b\d{2,}\b(?!\s?[%€\p{L}])/u],
  ["Linear-Kennung", /SIN-\d+/],
  ["PR-Nummer", /#\d+/],
  ["Minuten", /\d+ ?min/i],
  ["Millisekunden", /\d+ ?ms\b/i],
  ["Zeitstempel", /\d{4}-\d{2}-\d{2}/],
  ["Uhrzeit", /\d{1,2}:\d{2}/],
];

async function anmelden(page: Page) {
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
  const vor = (min: number) => new Date(jetzt - min * 60_000).toISOString();
  const rollen = ["ceo", "vorarbeiter", "forscher", "bauer", "pruefer", "anwalt"];
  const meldungen = rollen.map((rolle, i) => ({
    id: `r${i}`,
    created_at: vor(1400 - i * 10),
    project: "leitstand",
    step: "rolle",
    status: "ok",
    issue: "SIN-456",
    payload: { rolle, issue: "SIN-456", zeitpunkt: vor(1400 - i * 10), status: i === 5 ? "running" : "ok", zusammenfassung: `Beispiel ${rolle} (SIN-456)`, werkzeuge: ["Read", "Edit"], kosten_eur: 0.25 },
  }));
  const events = [
    { id: "1", created_at: vor(1400), project: "lernapp", step: "worker", status: "start", issue: "SIN-12", pr: 1400 },
    { id: "2", created_at: vor(30), project: "leitstand", step: "pr", status: "failure", issue: "SIN-13", pr: 117 },
    { id: "3", created_at: vor(5), project: "leitstand", step: "merge", status: "ok", issue: "SIN-14", pr: 118 },
  ];
  await page.route(`${SUPABASE}/rest/v1/loop_events**`, (route) => route.fulfill({ json: [...events, ...meldungen] }));
  await page.route(`${SUPABASE}/rest/v1/loop_snapshot**`, (route) =>
    route.fulfill({
      json: [
        { project: "lernapp", issue: "SIN-12", stage: "work", status: "running", title: "Richter wird besser (SIN-12)", progress: { done: 87, total: 100, ideas: 3 }, labels: ["sinan"], minutes: 1400 },
        { project: "leitstand", issue: "SIN-13", stage: "pr", status: "failure", title: "Beispiel-Aufgabe", guthaben: [{ dienst: "OpenAI", wert: 9, gesamt: 25, einheit: "€", quelle: "api" }] },
        { project: "leitstand", issue: "SIN-456", stage: "work", status: "running", title: "Beispiel-Aufgabe", quota_name: "Deploys", quota_used: 15, quota_limit: 100 },
      ],
    }),
  );
  await page.route(`${SUPABASE}/rest/v1/ceo_entscheidungen**`, (route) => route.fulfill({ json: [{ produkt: "lernapp", entscheidung: "weiter", grund: "Lern-App: Richter wird besser, fertig etwa Montag (SIN-12).", created_at: vor(60) }] }));
}

for (const [seite, pfad] of SEITEN) {
  for (const [groesse, viewport] of GROESSEN) {
    test(`${seite} bei ${groesse}: nichts, was ein Sechsjähriger nicht versteht`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await anmelden(page);
      await page.goto(pfad);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Daten werden geladen")).toBeHidden();
      const text = await page.locator("body").innerText();
      for (const [name, muster] of VERBOTEN) expect(text.match(muster)?.[0] ?? null, `${name} auf ${pfad}`).toBeNull();
      await expect(page.locator("table")).toHaveCount(0);
      await expect(page.locator("details.aufklapp")).toHaveCount(pfad === "/" ? 3 : 0);
    });
  }
}
