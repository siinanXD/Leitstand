/**
 * Testnutzer-Regel (SIN-915): Projekte mit Login bekommen einen Agent-Testnutzer nach Vorlage SIN-913.
 * Rein, kein Netz. Das Skript scripts/waechter/waechter.ts liefert Dateipfade und Code-Treffer aus GitHub.
 */

export const TESTNUTZER_TITEL = "Agent-Testnutzer einrichten";
/** Code-Stellen, die einen Login verraten; das Skript sucht sie per GitHub-Codesuche. */
export const LOGIN_MUSTER = ["signInWithOtp", "signInWithPassword", "auth.getUser"];

export type RepoDatei = { pfad: string; inhalt?: string };
export type TestnutzerStatus = "kein Login" | "Testnutzer vorhanden" | "issue vorhanden" | "anlegen";

const LOGIN_ROUTE = /(^|\/)app\/(?:\([^/]+\)\/)*(anmelden|login)\//;

/** Das Repo hat einen Login: Route `/anmelden` oder `/login` oder eins der LOGIN_MUSTER im Code. */
export function hatLogin(dateien: RepoDatei[]): boolean {
  return dateien.some((d) => LOGIN_ROUTE.test(d.pfad) || LOGIN_MUSTER.some((m) => d.inhalt?.includes(m)));
}

/** Marker für einen vorhandenen Agent-Testnutzer: Ordner `src/lib/agent-testnutzer/` oder Entscheidung `docs/decisions/*agent-testnutzer*`. */
export function hatTestnutzer(pfade: string[]): boolean {
  return pfade.some((p) => p.startsWith("src/lib/agent-testnutzer/") || /^docs\/decisions\/[^/]*agent-testnutzer[^/]*$/.test(p));
}

/** Entscheidet je Projekt, ob der Wächter das Issue anlegt. `titel`: alle Issue-Titel des Projekts (jeder Status), damit es nie doppelt entsteht. */
export function pruefeTestnutzer(projekt: string, dateien: RepoDatei[], titel: string[]): { status: TestnutzerStatus; issue: { titel: string; beschreibung: string } | null } {
  if (!hatLogin(dateien)) return { status: "kein Login", issue: null };
  if (hatTestnutzer(dateien.map((d) => d.pfad))) return { status: "Testnutzer vorhanden", issue: null };
  if (titel.some((t) => t.trim() === TESTNUTZER_TITEL)) return { status: "issue vorhanden", issue: null };
  return { status: "anlegen", issue: { titel: TESTNUTZER_TITEL, beschreibung: testnutzerBeschreibung(projekt) } };
}

const testnutzerBeschreibung = (projekt: string) =>
  [
    `Projekt „${projekt}“ hat einen Login, aber keinen Agent-Testnutzer (Regel SIN-915). Vorlage: SIN-913 im Leitstand.`,
    "",
    "## Umsetzung",
    "",
    "1. Testkonto per Admin-API anlegen (`auth.admin.createUser`, `email_confirm: true`), idempotent im Workflow; Adresse als Repo-Variable.",
    "2. Sitzung ohne Passwort: `auth.admin.generateLink` → `verifyOtp` → Playwright-`storageState`, nur im Job, nie als Artefakt. Kein neues Secret.",
    "3. Nur lesend: jede Aktion lehnt der Server für das Konto mit 403 ab. Kein Admin-Konto.",
    "4. Testdaten des Kontos aus Kennzahlen filtern.",
    "5. Entscheidung in `docs/decisions/agent-testnutzer-<projekt>.md` und Helfer unter `src/lib/agent-testnutzer/`.",
    "",
    "## Fertig, wenn",
    "",
    "- [ ] Test: Aktions-Prüfung lehnt das Agent-Konto ab (403), erlaubt Lesen",
    "- [ ] Test: Sitzungs-Helfer baut `storageState` aus gemocktem generateLink/verifyOtp",
    "- [ ] Probe in `docs/abnahme.yml`: Datei-Check auf den Sitzungs-Helfer",
    "- [ ] [nach Aktivierung] Playwright-Smoke öffnet die Startseite eingeloggt",
  ].join("\n");
