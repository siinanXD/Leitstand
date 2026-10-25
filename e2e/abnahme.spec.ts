import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Abnahme nach dem Bauen (SIN-580): funktioniert, was gebaut wurde? Gegen Fixture-Daten, Handy und Desktop.
// Supabase wird wie in e2e/startseite.spec.ts gemockt (Build mit NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321).
const SUPABASE = "http://127.0.0.1:54321";
const SPEICHER = "sb-127-auth-token";
const GROESSEN = [
  ["Handy", { width: 390, height: 844 }],
  ["Desktop", { width: 1280, height: 800 }],
] as const;
// Reiter wie in src/app/kopf.tsx (Name, Adresse, Überschrift h1).
const REITER = [
  ["Start", "/", /./],
  ["Team", "/team", /Mein Team/],
  ["Werkzeuge", "/werkzeuge", /Werkzeuge/],
  ["Produkt", "/projekte", /Meine Produkte/],
  ["Kosten", "/kosten", /Was kostet das\?/],
] as const;
const MENUE_SEITEN = [...REITER.map(([, pfad]) => pfad), "/aufgabe/SIN-456"];

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
    created_at: vor(60 - i * 5),
    project: "leitstand",
    step: "rolle",
    status: "ok",
    issue: "SIN-456",
    payload: { rolle, issue: "SIN-456", zeitpunkt: vor(60 - i * 5), status: i === 5 ? "running" : "ok", zusammenfassung: `Beispiel ${rolle}`, werkzeuge: ["Read", "Edit"], kosten_eur: 0.25 },
  }));
  const events = [
    { id: "1", created_at: vor(30), project: "leitstand", step: "pr", status: "failure", issue: "SIN-13", pr: 117 },
    { id: "2", created_at: vor(5), project: "leitstand", step: "merge", status: "ok", issue: "SIN-14", pr: 118 },
  ];
  await page.route(`${SUPABASE}/rest/v1/loop_events**`, (route) => route.fulfill({ json: [...events, ...meldungen] }));
  await page.route(`${SUPABASE}/rest/v1/loop_snapshot**`, (route) =>
    route.fulfill({
      json: [
        { project: "lernapp", issue: "SIN-12", stage: "work", status: "running", title: "Richter wird besser", labels: ["sinan"] },
        { project: "leitstand", issue: "SIN-456", stage: "work", status: "running", title: "Beispiel-Aufgabe" },
      ],
    }),
  );
  await page.route(`${SUPABASE}/rest/v1/ceo_entscheidungen**`, (route) => route.fulfill({ json: [] }));
  // Startseite = Fließband (SIN-815): Daten-Route im Browser abfangen.
  const karte = (issue: string, station: string, farbe: string, grund: string | null) => ({ issue, titel: `Beispiel ${issue}`, produkt: "leitstand", station, farbe, grund, seit: vor(90), haken: null, links: { linear: "https://linear.app", pr: null, run: null } });
  await page.route("**/api/fliessband", (route) =>
    route.fulfill({
      json: {
        erzeugt: new Date(jetzt).toISOString(),
        produkte: [{ id: "leitstand", karten: [karte("SIN-456", "baut", "gruen", null), karte("SIN-13", "pruefung", "rot", "Eine Prüfung ist rot.")] }, { id: "lernapp", karten: [] }],
        brauchtDich: [{ text: "SIN-12 Richter wird besser", url: "https://linear.app" }],
        brauchtDichText: null,
      },
    }),
  );
}

async function oeffne(page: Page, pfad: string) {
  await anmelden(page);
  await page.goto(pfad);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

for (const [groesse, viewport] of GROESSEN) {
  test.describe(groesse, () => {
    test.use({ viewport });

    test("Reiter: jeder führt auf die richtige Adresse, h1 passt, aktiver Reiter hat aria-current", async ({ page }) => {
      await oeffne(page, "/");
      const reiter = page.getByRole("navigation", { name: "Reiter" });
      for (const [name, pfad, ueberschrift] of REITER) {
        await reiter.getByRole("link", { name, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${pfad === "/" ? "/$" : `${pfad}$`}`));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(ueberschrift);
        await expect(reiter.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
        await expect(reiter.locator("[aria-current=page]")).toHaveCount(1);
      }
    });

    test("Fließband: Karte führt zur Aufgabe, Stations-Pille sichtbar (SIN-815)", async ({ page }) => {
      await oeffne(page, "/");
      const link = page.getByRole("link", { name: /Beispiel SIN-456/ }).filter({ visible: true }).first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/aufgabe\/SIN-456$/);
    });

    test("Kosten: Produktfilter wählt ein Produkt, axe ohne Fehler (SIN-1049)", async ({ page }) => {
      await oeffne(page, "/kosten");
      const filter = page.getByRole("group", { name: "Projekt filtern" });
      await expect(filter).toBeVisible();
      const zweiter = filter.getByRole("button").nth(1);
      await zweiter.click();
      await expect(zweiter).toHaveAttribute("aria-pressed", "true");
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    });

    test("Test: axe ohne Fehler auf `/kosten`.", async ({ page }) => {
      await oeffne(page, "/kosten");
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    });

    test("Aufgabe: Weg zurück zum Start, Details eingeklappt und Kennung erst danach sichtbar", async ({ page }) => {
      await oeffne(page, "/aufgabe/SIN-456");
      await expect(page.getByText("SIN-456", { exact: true })).toBeHidden();
      await page.getByText("Details", { exact: true }).click();
      await expect(page.getByText("SIN-456", { exact: true })).toBeVisible();
      await page.getByRole("main").getByRole("link", { name: "Start", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test.describe(`${groesse} (Bedienung)`, () => {
    test.use({ viewport });

    test("Tastatur: Tab erreicht Reiter der Reihe nach, Fokus sichtbar, Enter öffnet eine Karte", async ({ page }) => {
      await oeffne(page, "/");
      const reihenfolge: string[] = [];
      for (let i = 0; i < 40 && reihenfolge.filter((t) => REITER.some(([n]) => n === t)).length < REITER.length; i++) {
        await page.keyboard.press("Tab");
        const stelle = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const stil = getComputedStyle(el);
          const kanal = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const hell = (c: number[]) => c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
          const [a, b] = [hell(kanal(stil.outlineColor)), hell(kanal(getComputedStyle(document.body).backgroundColor))];
          return { text: el.textContent?.trim() ?? "", breite: parseFloat(stil.outlineWidth), art: stil.outlineStyle, kontrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
        // Fokus-Ring: mindestens 2 px, Kontrast zum Hintergrund mindestens 3:1.
        expect(stelle.art, `Fokus ohne Rahmen bei „${stelle.text}“`).not.toBe("none");
        expect(stelle.breite, `Fokus-Rahmen bei „${stelle.text}“`).toBeGreaterThanOrEqual(2);
        expect(stelle.kontrast, `Fokus-Kontrast bei „${stelle.text}“`).toBeGreaterThanOrEqual(3);
        reihenfolge.push(stelle.text);
      }
      const reiterNamen = reihenfolge.filter((t) => REITER.some(([n]) => n === t));
      expect(reiterNamen).toEqual(REITER.map(([n]) => n));

      // Fließband (SIN-815): eine Karte ist ein Link, Enter öffnet die Aufgabe.
      await page.getByRole("link", { name: /Beispiel SIN-456/ }).filter({ visible: true }).first().focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/aufgabe\/SIN-456$/);
    });

    test("Ziele: jedes klickbare Element ist mindestens 44×44 px groß", async ({ page }) => {
      for (const pfad of MENUE_SEITEN) {
        await page.goto("about:blank");
        await oeffne(page, pfad);
        const zuKlein = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("button, a[href], summary, input, select, [role=button]")]
            .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
            // Links mitten im Satz sind nach WCAG 2.5.8 ausgenommen.
            .filter((el) => !(el.tagName === "A" && getComputedStyle(el).display === "inline"))
            // Ein Kästchen mit Beschriftung zählt mit seiner Beschriftung als Ziel (das Label ist klickbar).
            .map((el) => ({ el, ziel: el.closest("label") ?? el }))
            .map(({ el, ziel }) => ({ el: `${el.tagName.toLowerCase()} „${(ziel.textContent ?? "").trim().slice(0, 30)}“`, ...ziel.getBoundingClientRect().toJSON() }))
            .filter((r) => r.width < 43.5 || r.height < 43.5)
            .map((r) => `${r.el} ${Math.round(r.width)}×${Math.round(r.height)}`),
        );
        expect(zuKlein, `zu kleine Ziele auf ${pfad}`).toEqual([]);
      }
    });

    test("axe-core: alle Menü-Seiten ohne Verstöße (WCAG 2.2 AA)", async ({ page }) => {
      for (const pfad of MENUE_SEITEN) {
        await page.goto("about:blank");
        await oeffne(page, pfad);
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), `axe auf ${pfad}`).toEqual([]);
      }
    });
  });
}

for (const [groesse, viewport] of GROESSEN) {
  test.describe(`Datenbank ${groesse}`, () => {
    test.use({ viewport });

    test("Test: axe ohne Fehler auf `/datenbank`, Handy und Desktop (SIN-1037)", async ({ page }) => {
      const tabelle = (name: string, rls: boolean) => ({ name, rls, realtime: rls, policies: rls ? ["lesen"] : [], spalten: [{ name: "id", typ: "uuid", nullable: false, schluessel: true, verweis: null }] });
      await page.route("**/api/datenbank", (route) => route.fulfill({ json: { tabellen: [tabelle("loop_events", true), tabelle("offen", false)] } }));
      await oeffne(page, "/datenbank");
      await expect(page.getByRole("heading", { level: 2, name: "offen" })).toBeVisible();
      const offen = page.getByRole("region", { name: "offen" });
      await expect(offen.getByText("RLS aus")).toBeVisible();
      await expect(offen.locator(".signal.error")).toHaveCount(1);
      await expect(page.getByRole("region", { name: "loop_events" }).locator(".signal.error")).toHaveCount(0);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    });
  });
}

test.describe("Entscheidungen", () => {
  const block = { frage: "Welche Farbe?", art: "design", optionen: [{ titel: "Blau", folge: "Ruhig." }, { titel: "Rot", folge: "Laut." }], empfehlung: "Blau", recherche: ["https://example.org/vergleich"] };
  const eintrag = { identifier: "SIN-9001", titel: "Farbe wählen", url: "https://linear.app/x", block };

  for (const [groesse, viewport] of GROESSEN) {
    test(`Test: axe-core ohne Fehler auf /entscheidungen, Ziele ≥ 44 px, Tastatur bedienbar (${groesse})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      let gesendet: unknown = null;
      await page.route("**/api/entscheidungen", (route) => {
        if (route.request().method() === "POST") {
          gesendet = route.request().postDataJSON();
          return route.fulfill({ json: { kennung: "SIN-9001", wahl: "Blau", protokolliert: true } });
        }
        return route.fulfill({ json: { entscheidungen: [eintrag] } });
      });
      await oeffne(page, "/entscheidungen");
      await expect(page.getByRole("heading", { level: 2, name: "Welche Farbe?" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Blau (Empfehlung)" })).toBeVisible();

      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

      const zuKlein = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main button, main a[href], main input")]
          .filter((el) => el.getClientRects().length > 0 && !(el.tagName === "A" && getComputedStyle(el).display === "inline"))
          .map((el) => ({ el: (el.textContent ?? "").trim().slice(0, 30), ...el.getBoundingClientRect().toJSON() }))
          .filter((b) => b.width < 43.5 || b.height < 43.5)
          .map((b) => `${b.el} ${Math.round(b.width)}×${Math.round(b.height)}`),
      );
      expect(zuKlein).toEqual([]);

      // Tastatur: Fokus auf die Option, Enter sendet.
      await page.getByRole("button", { name: "Blau (Empfehlung)" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: "Gespeichert: Blau" })).toBeVisible();
      expect(gesendet).toEqual({ issue: "SIN-9001", option: "Blau" });
    });
  }

  test("Fehler steht als Satz da, Leerzustand heißt „Nichts zu entscheiden“", async ({ page }) => {
    await page.route("**/api/entscheidungen", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 502, json: { fehler: "linear" } }) : route.fulfill({ json: { entscheidungen: [eintrag] } })));
    await oeffne(page, "/entscheidungen");
    await page.getByRole("button", { name: "Rot" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Linear hat die Antwort nicht angenommen." })).toBeVisible();
    await page.unroute("**/api/entscheidungen");
    await page.route("**/api/entscheidungen", (route) => route.fulfill({ json: { entscheidungen: [] } }));
    await page.reload();
    await expect(page.getByText("Nichts zu entscheiden")).toBeVisible();
  });
});

test.describe("Skalierbarkeit", () => {
  // 200 % Zoom auf dem Handy entspricht etwa 195×422 CSS-Pixeln (Ersatz für Browser-Zoom).
  test("200 % Zoom: kein waagerechtes Scrollen, kein abgeschnittener Text", async ({ page }) => {
    await page.setViewportSize({ width: 195, height: 422 });
    for (const pfad of MENUE_SEITEN) {
      await page.goto("about:blank");
      await oeffne(page, pfad);
      const probleme = await page.evaluate(() => {
        const breite = document.documentElement.clientWidth;
        const abgeschnitten = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => el.children.length === 0 && el.textContent?.trim() && el.getClientRects().length > 0 && !el.closest(".sr-only"))
          .filter((el) => {
            const stil = getComputedStyle(el);
            return (stil.overflow !== "visible" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) || el.getBoundingClientRect().right > breite + 1;
          })
          .map((el) => (el.textContent ?? "").trim().slice(0, 30));
        return { seite: document.documentElement.scrollWidth - breite, abgeschnitten };
      });
      expect(probleme.seite, `Seite scrollt waagerecht auf ${pfad}`).toBeLessThanOrEqual(0);
      expect(probleme.abgeschnitten, `abgeschnittener Text auf ${pfad}`).toEqual([]);
    }
  });

  test("Schriftgröße 20 px per Browser-Einstellung bricht nichts", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Wie „Schriftgröße: sehr groß“: Grundschrift der Wurzel auf 20 px (rem/em-Maße wachsen mit).
    await page.addInitScript(() => {
      const stil = document.createElement("style");
      stil.textContent = "html { font-size: 20px !important; }";
      new MutationObserver((_, o) => document.head && (document.head.append(stil), o.disconnect())).observe(document, { childList: true, subtree: true });
    });
    for (const pfad of MENUE_SEITEN) {
      await page.goto("about:blank");
      await oeffne(page, pfad);
      const seite = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(seite, `Seite scrollt waagerecht auf ${pfad}`).toBeLessThanOrEqual(0);
    }
  });
});

test("Bewegung: mit prefers-reduced-motion läuft keine Animation (Puls steht)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await oeffne(page, "/");
  await expect(page.getByRole("heading", { name: /Braucht dich/ })).toBeVisible();
  const laufend = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length);
  expect(laufend).toBe(0);
});

test("Sechsjährigen-Test: keine Kennung außerhalb von „Details“ (siehe tests/einfach.spec.ts)", async ({ page }) => {
  await oeffne(page, "/aufgabe/SIN-456");
  const sichtbar = await page.locator("body").innerText();
  expect(sichtbar).not.toMatch(/SIN-\d+/);
});
