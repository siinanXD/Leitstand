// Vorarbeiter-Agent (SIN-553): reine Planung der Reihenfolge und der Spuren. Kein Netz, kein KI-Aufruf.
// `scripts/vorarbeiter/vorarbeiter.ts` holt die Linear-Issues, schreibt den Plan und baut Spur C. Der CEO entscheidet was, der Vorarbeiter wann und womit.
import { NIE_AUTOMATISCH, type LinearIssue } from "../loop/auswahl";

export const SPUREN = ["A", "B", "C"] as const;
export type SpurId = (typeof SPUREN)[number];
/** A und B laufen auf dem Claude-Max-Konto, C per API mit Haiku. */
export const SPUR_NAMEN: Record<SpurId, string> = { A: "Spur A · Claude Max", B: "Spur B · Claude Max", C: "Spur C · API mit Haiku" };
export const SPUR_C_DECKEL_EUR = 2;
export const SPUR_C_MODELL = "claude-haiku-5-5";
/** Freigabe des CEOs für Loop-Infrastruktur (Label am Linear-Issue). */
export const CEO_FREIGABE = "ceo-freigabe";

export type PlanEintrag = { issue: string; titel: string; grund: string };
export type Plan = { spuren: { id: SpurId; eintraege: PlanEintrag[] }[]; wartet: PlanEintrag[]; erstellt: string };

const ERLEDIGT = new Set(["completed", "canceled"]);
const hat = (i: LinearIssue, label: string) => i.labels.some((l) => l.toLowerCase() === label);

/** Pfade aus dem Issue-Text (`src/…`, `scripts/…`, `docs/…` …), ohne Satzzeichen am Ende. */
export function pfade(text: string | null): string[] {
  const treffer = String(text ?? "").matchAll(/(?:^|[\s`'"(])((?:src|scripts|docs|supabase|e2e|public|\.github)\/[\w.\-/[\]]*[\w\]/])/g);
  return [...new Set([...treffer].map((m) => m[1].replace(/\/$/, "")))];
}

/** Bereich aus dem Label `bereich:<name>`. */
const bereich = (i: LinearIssue) => i.labels.map((l) => /^bereich:(.+)$/i.exec(l)?.[1].toLowerCase()).find(Boolean) ?? null;

/**
 * Berührte Stellen eines Issues. Ohne genannte Pfade steht der Bereich stellvertretend, ohne beides bleibt die Liste leer.
 * shortcut: Pfade nur aus dem Text und Bereich nur aus dem Label, bei häufigen Fehlplanungen aus dem Diff vergangener PRs lernen.
 */
export const stellen = (i: LinearIssue): string[] => {
  const p = pfade(i.description);
  const b = bereich(i);
  return p.length ? p : b ? [`bereich:${b}`] : [];
};

const ueberlappt = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
export const gemeinsam = (a: string[], b: string[]) => a.some((x) => b.some((y) => ueberlappt(x, y)));

const LOOP_INFRA = [".github", "scripts/loop", "scripts/waechter", "scripts/vorarbeiter", "src/lib/loop", "src/lib/waechter"];
const istLoopInfra = (i: LinearIssue) => hat(i, "loop") || gemeinsam(pfade(i.description), LOOP_INFRA);

/** Klein im Sinn von Spur C: Label `groesse:klein` und nur Dateien unter `docs/` (Docs, Texte, Skills). `groessen.md` gibt es noch nicht. */
export function spurCTauglich(i: LinearIssue): boolean {
  const p = pfade(i.description);
  return hat(i, "groesse:klein") && p.length > 0 && p.every((x) => x.startsWith("docs/"));
}

const rang = (i: LinearIssue) => (i.priority > 0 ? i.priority : 5);
/** Fertig-Liste zuerst (Label `readiness`), dann `dringend` (Priorität 1 oder Label), dann der Rest nach Priorität und Alter. */
const reihenfolge = (a: LinearIssue, b: LinearIssue) => {
  const stufe = (i: LinearIssue) => (hat(i, "readiness") ? 0 : i.priority === 1 || hat(i, "dringend") ? 1 : 2);
  return stufe(a) - stufe(b) || rang(a) - rang(b) || a.createdAt.localeCompare(b.createdAt);
};

const eintrag = (i: LinearIssue, grund: string): PlanEintrag => ({ issue: i.identifier, titel: i.title, grund });

/**
 * Plan aus allen Issues des Projekts. Startbar: Todo, Label `claude`, nichts Zurückgehaltenes. Parallel nur ohne gemeinsame Stellen und ohne Blocker:
 * Ein Issue kommt in die Spur seines Blockers oder der Spur, mit der es Stellen teilt; teilt es welche mit zwei Spuren oder mit einem laufenden Issue, wartet es.
 */
export function plane(issues: LinearIssue[], jetzt = new Date()): Plan {
  const spuren: Plan["spuren"] = SPUREN.map((id) => ({ id, eintraege: [] }));
  const wartet: PlanEintrag[] = [];
  const platziert = new Map<string, SpurId>();
  const stelleVon = new Map<string, string[]>();
  const laufend = issues.filter((i) => i.stateType === "started" && hat(i, "claude"));

  const offen = (i: LinearIssue) => i.blockiertVon.filter((b) => !ERLEDIGT.has(b.stateType));
  const kandidaten: LinearIssue[] = [];
  for (const i of issues.filter((x) => x.stateType === "unstarted" && hat(x, "claude")).sort(reihenfolge)) {
    if (i.labels.some((l) => NIE_AUTOMATISCH.includes(l.toLowerCase()))) continue;
    if (istLoopInfra(i) && !hat(i, CEO_FREIGABE)) wartet.push(eintrag(i, "Loop-Infrastruktur braucht die Freigabe des CEOs"));
    else kandidaten.push(i);
  }

  let rest = kandidaten;
  for (let weiter = true; weiter && rest.length; ) {
    weiter = false;
    for (const i of rest) {
      const blocker = offen(i);
      if (blocker.some((b) => !platziert.has(b.identifier) && kandidaten.some((k) => k.identifier === b.identifier))) continue; // Blocker kommt noch dran
      rest = rest.filter((x) => x !== i);
      weiter = true;
      const fremd = blocker.filter((b) => !platziert.has(b.identifier));
      if (fremd.length) {
        wartet.push(eintrag(i, `wartet auf ${fremd.map((b) => b.identifier).join(", ")}`));
        break;
      }
      const meine = stellen(i);
      const belegt = laufend.find((l) => gemeinsam(meine, stellen(l)));
      if (belegt) {
        wartet.push(eintrag(i, `teilt Dateien mit ${belegt.identifier}, das schon läuft`));
        break;
      }
      const stoesst = new Set<SpurId>([...blocker.map((b) => platziert.get(b.identifier)!), ...spuren.filter((s) => s.eintraege.some((e) => gemeinsam(meine, stelleVon.get(e.issue) ?? []))).map((s) => s.id)]);
      if (stoesst.size > 1) {
        wartet.push(eintrag(i, `berührt dieselben Dateien wie Spur ${[...stoesst].sort().join(" und ")}, kommt nach dem nächsten Merge`));
        break;
      }
      const id: SpurId = [...stoesst][0] ?? (spurCTauglich(i) ? "C" : spuren[0].eintraege.length <= spuren[1].eintraege.length ? "A" : "B");
      const spur = spuren.find((s) => s.id === id)!;
      spur.eintraege.push(eintrag(i, blocker.length ? `nach ${blocker.map((b) => b.identifier).join(", ")}` : stoesst.size ? "gleiche Dateien wie davor, deshalb nacheinander" : "keine gemeinsamen Dateien mit den anderen Spuren"));
      platziert.set(i.identifier, id);
      stelleVon.set(i.identifier, meine);
      break; // nach jedem Platzieren wieder von vorn, damit die Reihenfolge gilt
    }
  }
  for (const i of rest) wartet.push(eintrag(i, `wartet auf ${offen(i).map((b) => b.identifier).join(", ")}`));
  return { spuren, wartet, erstellt: jetzt.toISOString() };
}

/** Plan aus `loop_snapshot.plan` (JSON oder Text). Unlesbares ergibt null. */
export function parsePlan(raw: unknown): Plan | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const o = v as { spuren?: unknown; wartet?: unknown; erstellt?: unknown } | null;
  if (!o || !Array.isArray(o.spuren) || typeof o.erstellt !== "string") return null;
  const liste = (x: unknown): PlanEintrag[] =>
    Array.isArray(x) ? x.flatMap((e) => (e && typeof e.issue === "string" && typeof e.titel === "string" ? [{ issue: e.issue, titel: e.titel, grund: typeof e.grund === "string" ? e.grund : "" }] : [])) : [];
  const spuren = SPUREN.map((id) => ({ id, eintraege: liste((o.spuren as { id?: unknown; eintraege?: unknown }[]).find((s) => s?.id === id)?.eintraege) }));
  return { spuren, wartet: liste(o.wartet), erstellt: o.erstellt };
}

export type SpurAnzeige = { id: SpurId; name: string; laeuft: PlanEintrag | null; naechste: PlanEintrag[] };

/** Drei Bahnen für die Ablauf-Seite: was läuft (Issue in Arbeit laut Snapshot) und was als Nächstes kommt. */
export function spurAnzeige(plan: Plan, inArbeit: Set<string>): SpurAnzeige[] {
  return plan.spuren.map((s) => ({ id: s.id, name: SPUR_NAMEN[s.id], laeuft: s.eintraege.find((e) => inArbeit.has(e.issue)) ?? null, naechste: s.eintraege.filter((e) => !inArbeit.has(e.issue)) }));
}

// --- Spur C: Docs-Issue per API mit Haiku ---

export type Preis = { einProMio: number; ausProMio: number };

/** Kosten eines Aufrufs in Euro (4 Stellen). Preise in USD je Million Token kommen aus der Umgebung, nichts ist fest eingebaut. */
export const aufrufKosten = (ein: number, aus: number, preis: Preis, usdZuEur: number) => Math.round(((ein * preis.einProMio + aus * preis.ausProMio) / 1e6) * usdZuEur * 1e4) / 1e4;

/** Was heute noch ausgegeben werden darf; nie unter 0. */
export const restDeckel = (heuteEur: number, deckel = SPUR_C_DECKEL_EUR) => Math.max(0, Math.round((deckel - heuteEur) * 1e4) / 1e4);

/** Zeile fürs Ledger `pipeline_run_costs` (Annahme wie SIN-527: Spalte `cost_eur`, `created_at` setzt die Datenbank). */
export const ledgerZeile = (eur: number) => ({ cost_eur: eur });

export type Datei = { pfad: string; inhalt: string };
const MAX_DATEIEN = 5;
const MAX_ZEICHEN = 50_000;

/**
 * Vertrauensgrenze: Antwort des Modells `{dateien:[{pfad,inhalt}]}`. Nur Markdown unter `docs/`, nur Pfade, die das Issue nennt, alles oder nichts.
 */
export function leseDateien(raw: unknown, erlaubt: string[]): Datei[] | null {
  const liste = (raw as { dateien?: unknown } | null)?.dateien;
  if (!Array.isArray(liste) || liste.length === 0 || liste.length > MAX_DATEIEN) return null;
  const dateien: Datei[] = [];
  for (const d of liste as Partial<Datei>[]) {
    if (typeof d?.pfad !== "string" || typeof d.inhalt !== "string" || !d.inhalt.trim() || d.inhalt.length > MAX_ZEICHEN) return null;
    if (!/^docs\/[\w.\-/]+\.md$/.test(d.pfad) || d.pfad.includes("..") || !erlaubt.some((e) => ueberlappt(e, d.pfad!))) return null;
    dateien.push({ pfad: d.pfad, inhalt: d.inhalt });
  }
  return dateien;
}

export const promptC = (i: LinearIssue) =>
  [
    "Du schreibst Dokumentation für das Repo Leitstand. Antworte nur mit JSON der Form {\"dateien\":[{\"pfad\":\"docs/….md\",\"inhalt\":\"…\"}]}.",
    `Erlaubt sind nur diese Pfade: ${pfade(i.description).join(", ")}. Deutsch, kurz, keine erfundenen Zahlen, keine Personendaten.`,
    "",
    `${i.identifier}: ${i.title}`,
    (i.description ?? "").trim(),
  ].join("\n");

/** Branch, Titel und Text des PRs für Spur C. */
export const prFuerC = (i: LinearIssue) => ({ branch: `claude/${i.identifier.toLowerCase()}-c`, titel: `docs: ${i.title} (${i.identifier})`, body: `Spur C (Haiku): ${i.title}\n\nPart of ${i.identifier}\n\n## Ausgelassen\nNicht von einem Menschen gelesen, nur Markdown unter \`docs/\`.` });

/** Zeile für `loop_events`: der Plan wurde gemacht. */
export const ereignisZeile = (projekt: string, runId: string | null, runUrl: string | null) => ({ project: projekt, agent: "planer", step: "planer", status: "ok", grund: "rolle_gestartet", issue: null, pr: null, run_id: runId, run_url: runUrl });

// ------------------------------------------------------------------ Lern-App-Planer anstoßen (SIN-700)

/** Schritte in `loop_events` (Projekt `lernapp`): Merker je Anstoß und der Vorfall „Planer liefert keine startbaren Todos“. */
export const ANSTOSS_SCHRITT = "planer-anstoss";
export const OHNE_TODOS_SCHRITT = "planer-ohne-todos";
export const ANSTOSS_COOLDOWN_MS = 2 * 3_600_000;
export const ANSTOSS_FENSTER_MS = 24 * 3_600_000;
/** So viele Anstöße ohne startbare Todos, dann ist es ein Vorfall. */
export const ANSTOSS_VERSUCHE = 2;

/**
 * Ob der Lern-App-Planer jetzt angestoßen wird. Aufgerufen nur bei Lücke in der Schlange.
 * `cooldown`: letzter Anstoß jünger als 2 h. `ohne-todos`: schon 2 Anstöße in 24 h und die Schlange ist immer noch leer,
 * der Planer legt dann nur Backlog-Ideen an. Dann nicht weiter anstoßen, sondern Sinan melden.
 */
export function anstossEntscheidung(anstoesse: readonly number[], jetzt: number): "anstossen" | "cooldown" | "ohne-todos" {
  if (anstoesse.some((t) => jetzt - t < ANSTOSS_COOLDOWN_MS)) return "cooldown";
  if (anstoesse.filter((t) => jetzt - t < ANSTOSS_FENSTER_MS).length >= ANSTOSS_VERSUCHE) return "ohne-todos";
  return "anstossen";
}

/** Zeile für `loop_events`: der Merker eines Anstoßes oder der Vorfall. */
export const anstossZeile = (schritt: typeof ANSTOSS_SCHRITT | typeof OHNE_TODOS_SCHRITT, runId: string | null, runUrl: string | null) => ({
  project: "lernapp",
  agent: "planer",
  step: schritt,
  status: schritt === OHNE_TODOS_SCHRITT ? "fehler" : "ok",
  grund: schritt === OHNE_TODOS_SCHRITT ? "planer_ohne_todos: Lern-App-Planer liefert nur Backlog-Ideen, keine startbaren Todos" : "planer_angestossen",
  issue: null,
  pr: null,
  run_id: runId,
  run_url: runUrl,
});
