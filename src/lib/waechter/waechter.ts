/**
 * Projekt-Wächter (SIN-419): reine Funktionen, kein Netz.
 * Das Skript scripts/waechter/waechter.ts holt Daten aus Linear und GitHub und führt die geplanten Aktionen aus.
 */
import { istRepo, type RepoName } from "../freigabe";
import { HAENGER_STUNDEN, LABEL, linearId, MAX_REPARATUR, reparatur, startbare, type LinearIssue } from "../loop/auswahl";

export const EINRICHTEN_TITEL = "Projekt einrichten";
export { HAENGER_STUNDEN };
export const CI_WARTE_MINUTEN = 30;
export const NEU_TAGE = 7;
export const LINK_TITEL = ["github", "github repo"];
/** Marker in einem Linear-Kommentar: Der Hänger wurde schon einmal auf Todo zurückgesetzt. */
export const MARKER_ZURUECK = "<!-- waechter:zurueck -->";

const STUNDE = 3_600_000;
const MINUTE = 60_000;

export type Projekt = {
  id: string;
  name: string;
  /** Linear-Statustyp: backlog | planned | started | paused | completed | canceled */
  statusTyp: string;
  /** Kurze Zusammenfassung (Linear „description“). */
  zusammenfassung: string | null;
  /** Lange Beschreibung (Linear „content“). */
  beschreibung: string | null;
  leadId: string | null;
  /** 0 = keine, 1 dringend … 4 niedrig. */
  prioritaet: number;
  createdAt: string;
  links: { label: string; url: string }[];
};

export type WaechterIssue = LinearIssue & {
  startedAt: string | null;
  /** Name des Linear-Status, z. B. „In Review“ (SIN-941). */
  statusName?: string | null;
  completedAt?: string | null;
  /** Kommentartexte in Linear. */
  kommentare: string[];
};

export type PrInfo = {
  number: number;
  titel: string;
  branch: string;
  labels: string[];
  ciRot: boolean;
  /** `build` ist bei GitHub erfolgreich durchgelaufen (SIN-635). */
  ciGruen?: boolean;
  entwurf?: boolean;
  /** Merge-Zeitpunkt laut GitHub; gesetzt heißt: nicht mehr offen (SIN-699). */
  gemergtAt?: string | null;
  /** Der PR ändert `supabase/migrations/`. */
  migration?: boolean;
  runUrl: string | null;
  letzterCommitAt: string;
  /** Zeitpunkt des letzten Reparatur-Kommentars (`@claude` mit „Runde“) im PR. */
  letzteReparaturAt: string | null;
};

const ms = (iso: string) => new Date(iso).getTime();

/** GitHub-Repo „owner/name“ aus dem Projekt-Link mit Titel „GitHub“ oder „GitHub Repo“. */
export function repoAusLinks(links: { label: string; url: string }[]): string | null {
  for (const l of links) {
    if (!LINK_TITEL.includes(l.label.trim().toLowerCase())) continue;
    const m = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:[?#].*)?$/i.exec(l.url.trim());
    if (m) return `${m[1]}/${m[2]}`;
  }
  return null;
}

/** Pausiert heißt: Die Zusammenfassung enthält „pausiert“. */
export const istPausiert = (p: Projekt) => /pausiert/i.test(p.zusammenfassung ?? "");
/** Aktiv heißt: Linear-Status „In Progress“. */
export const istAktiv = (p: Projekt) => p.statusTyp === "started";

// SIN-941: Die Schlange füllt nur der Planer (Nachrücken, Planungs-Issues); der Wächter repariert Hänger und schreibt das Tages-Update.
const offen = (i: LinearIssue) => i.stateType !== "completed" && i.stateType !== "canceled";
const hatLabel = (i: LinearIssue, name: string) => i.labels.some((l) => l.toLowerCase() === name);

// ------------------------------------------------------------------ Hänger

export type HaengerAktion = { art: "zuruecksetzen" | "needs-human"; issue: WaechterIssue; kontingent?: true };

const prGehoertZu = (pr: PrInfo, i: LinearIssue) =>
  pr.titel.includes(i.identifier) || pr.branch.toLowerCase().includes(i.identifier.toLowerCase());

/**
 * Issue „In Progress“ seit mehr als 6 Stunden ohne offenen PR: einmal zurück auf Todo, danach needs-human.
 * Nur Loop-Issues (Label `claude`). Epics und Handarbeit (z. B. SIN-242) bleiben „In Progress“.
 */
export function erkenneIssueHaenger(issues: WaechterIssue[], offenePrs: PrInfo[], jetzt: Date, claudePausen: string[] = []): HaengerAktion[] {
  const r: HaengerAktion[] = [];
  for (const i of issues) {
    if (i.stateType !== "started" || !i.startedAt) continue;
    // SIN-941: „In Review“ hat seinen PR schon (auch gemergt); nur „In Progress“ ohne PR ist ein Hänger.
    if (i.statusName && i.statusName !== "In Progress") continue;
    if (!hatLabel(i, LABEL)) continue;
    if (hatLabel(i, "needs-human")) continue;
    if (offenePrs.some((pr) => prGehoertZu(pr, i))) continue;
    // Kontingent (SIN-581): Wurde nach dem Start eine Claude-Pause gemeldet, scheiterte der Lauf am Limit: sofort zurück auf Todo, nie needs-human.
    if (claudePausen.some((at) => ms(at) >= ms(i.startedAt!))) {
      r.push({ art: "zuruecksetzen", issue: i, kontingent: true });
      continue;
    }
    if (jetzt.getTime() - ms(i.startedAt) <= HAENGER_STUNDEN * STUNDE) continue;
    const schonZurueck = i.kommentare.some((k) => k.includes(MARKER_ZURUECK));
    r.push({ art: schonZurueck ? "needs-human" : "zuruecksetzen", issue: i });
  }
  return r;
}

export type PrAktion = { art: "reparatur"; pr: PrInfo; runde: number } | { art: "stopp"; pr: PrInfo };

/**
 * Offener PR mit roter CI und seit 30 Minuten ohne neuen Commit: @claude bitten (höchstens MAX_REPARATUR Runden), danach needs-human.
 * `issueweit`: dauerhaft gezählte Runden je Linear-Issue (SIN-832), damit ein neuer PR oder Provider nicht bei null beginnt.
 */
export function erkennePrHaenger(prs: PrInfo[], jetzt: Date, issueweit: Map<string, number> = new Map()): PrAktion[] {
  const r: PrAktion[] = [];
  for (const pr of prs) {
    if (!pr.ciRot || pr.labels.includes("needs-human")) continue;
    if (jetzt.getTime() - ms(pr.letzterCommitAt) < CI_WARTE_MINUTEN * MINUTE) continue;
    // Gerade erst gebeten: Wartezeit abwarten.
    if (pr.letzteReparaturAt && jetzt.getTime() - ms(pr.letzteReparaturAt) < CI_WARTE_MINUTEN * MINUTE) continue;
    const schritt = reparatur(pr.labels, issueweit.get(linearId(pr.titel) ?? "") ?? 0);
    if ("stopp" in schritt) {
      // Die letzte Runde bekommt Zeit: Wurde danach gepusht, entscheidet erst der nächste rote Lauf.
      if (pr.letzteReparaturAt && ms(pr.letzterCommitAt) > ms(pr.letzteReparaturAt)) continue;
      r.push({ art: "stopp", pr });
    } else {
      r.push({ art: "reparatur", pr, runde: schritt.runde });
    }
  }
  return r;
}

/** Bitte an `@claude`, einen roten `build` zu reparieren, mit Runde. */
export const reparaturText =(pr: PrInfo, runde: number) =>
  `@claude Der Check build ist rot${pr.runUrl ? ` (${pr.runUrl})` : ""} und seit ${CI_WARTE_MINUTEN} Minuten kam kein Commit. Ursache im Log suchen, beheben, npm run typecheck, npm run lint und npm test lokal grün, dann auf diesen Branch pushen. Runde ${runde} von ${MAX_REPARATUR}.`;

// ------------------------------------------------------------ Neue Projekte

export type ProjektAenderung = { leadSinan?: true; prioritaet?: 3; zusammenfassung?: string };

/** Ein Satz (höchstens 255 Zeichen, Linear-Grenze) aus der Beschreibung. */
export function kurzfassung(text: string | null): string | null {
  const roh = String(text ?? "")
    .replace(/[#*_`>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!roh) return null;
  const satz = /^.+?[.!?](?=\s|$)/.exec(roh)?.[0] ?? roh;
  return satz.length <= 255 ? satz : `${satz.slice(0, 252).trimEnd()}…`;
}

/** Neu heißt: jünger als NEU_TAGE. */
const istNeu = (p: Projekt, jetzt: Date) => jetzt.getTime() - ms(p.createdAt) <= NEU_TAGE * 24 * STUNDE;

/** Nur neue, nicht pausierte Projekte in Backlog, Planned oder In Progress. Vor dem Laden der Issues prüfen (spart Linear-Abfragen). */
export const kommtAlsNeuInFrage = (p: Projekt, jetzt: Date) =>
  ["backlog", "planned", "started"].includes(p.statusTyp) && istNeu(p, jetzt) && !istPausiert(p);

/** Ab wann erledigte Issues noch geladen werden: 48 h reichen für Tagesstand (24 h) und Hänger. */
export const ERLEDIGT_SEIT_STUNDEN = 48;
/** ISO-Zeitpunkt, ab dem erledigte Issues geladen werden. */
export const erledigtSeit = (jetzt: Date) => new Date(jetzt.getTime() - ERLEDIGT_SEIT_STUNDEN * STUNDE).toISOString();

export type EinrichtenPlan = {
  titel: string;
  beschreibung: string;
  /** Aufgaben, die nur Sinan erledigen kann (Label `sinan`). */
  sinanAufgaben: { titel: string; beschreibung: string }[];
};

/** Neues Projekt (Backlog, Planned oder In Progress, jünger als 7 Tage), nicht pausiert. */
export function pruefeNeuesProjekt(
  p: Projekt,
  issues: { title: string; stateType: string }[],
  jetzt: Date,
): { aenderung: ProjektAenderung; einrichten: EinrichtenPlan | null } | null {
  if (!kommtAlsNeuInFrage(p, jetzt)) return null;
  const aenderung: ProjektAenderung = {};
  if (!p.zusammenfassung?.trim()) {
    const kurz = kurzfassung(p.beschreibung);
    if (kurz) aenderung.zusammenfassung = kurz;
  }
  if (!p.leadId) aenderung.leadSinan = true;
  if (!p.prioritaet) aenderung.prioritaet = 3;
  const hatEinrichten = issues.some((i) => i.title.trim() === EINRICHTEN_TITEL && i.stateType !== "canceled");
  const einrichten = !repoAusLinks(p.links) && !hatEinrichten ? einrichtenPlan(p.name) : null;
  return { aenderung, einrichten };
}

/** Plan des Projekt-Starters (SIN-202). */
export function einrichtenPlan(projekt: string): EinrichtenPlan {
  return {
    titel: EINRICHTEN_TITEL,
    beschreibung: [
      `Projekt „${projekt}“ hat keinen GitHub-Link (Projekt-Link mit Titel „GitHub“ oder „GitHub Repo“). Einrichtung nach dem Plan des Projekt-Starters (SIN-202):`,
      "",
      "1. GitHub-Repo anlegen, Projekt-Link „GitHub“ in Linear setzen",
      "2. AGENTS.md und Loop-Workflows aus dem Leitstand-Repo übernehmen",
      "3. Infisical-Projekt und Secrets (nur Namen in `.env.example`)",
      "4. Vercel-Projekt verbinden",
      "5. Sentry-Projekt anlegen",
      "6. Linear-Labels `claude`, `design`, `sinan`, `needs-human` im Team prüfen",
      "7. Supabase-Schema (`loop_events`, `loop_snapshot`) bei Bedarf",
      "8. Figma-Datei verknüpfen",
      "9. Hat das Projekt einen Login: Agent-Testnutzer nach Vorlage SIN-913 (Regel SIN-915)",
      "",
      "Schritte, die nur Sinan kann, stehen als eigene `sinan`-Aufgaben im Projekt.",
    ].join("\n"),
    sinanAufgaben: [
      { titel: "GitHub-Repo anlegen und in Linear verlinken", beschreibung: "Repo anlegen, Token `AGENT_WORKFLOW_TOKEN` um das Repo erweitern, Projekt-Link „GitHub“ setzen." },
      { titel: "Infisical, Vercel und Sentry freigeben", beschreibung: "Konten und Zugänge für das neue Projekt anlegen; Zugangsdaten nie ins Repo." },
      { titel: "Figma-Datei bereitstellen", beschreibung: "Figma-Datei anlegen oder verknüpfen und im Projekt verlinken." },
    ],
  };
}

// ------------------------------------------------------------ Tagesupdate

export type Gesundheit = "onTrack" | "atRisk" | "offTrack";

export type Tagesstand = {
  erledigt24h: string[];
  inArbeit: string[];
  wartetAufSinan: string[];
  haenger: string[];
};

/** Tagesstand eines Projekts: erledigt in 24 h, in Arbeit, wartet auf Sinan, Hänger. */
export function tagesstand(issues: WaechterIssue[], haenger: HaengerAktion[], jetzt: Date): Tagesstand {
  const hIds = new Set(haenger.map((h) => h.issue.identifier));
  const eintrag = (i: LinearIssue) => `${i.identifier} ${i.title}`;
  return {
    erledigt24h: issues
      .filter((i) => i.stateType === "completed" && i.completedAt && jetzt.getTime() - ms(i.completedAt) <= 24 * STUNDE)
      .map(eintrag),
    inArbeit: issues.filter((i) => i.stateType === "started" && !hIds.has(i.identifier)).map(eintrag),
    wartetAufSinan: issues.filter((i) => offen(i) && (hatLabel(i, "sinan") || hatLabel(i, "needs-human"))).map(eintrag),
    haenger: issues.filter((i) => hIds.has(i.identifier)).map(eintrag),
  };
}

/** Linear-Gesundheit aus Hängern und offenen Sinan-Aufgaben. */
export function gesundheit(s: Tagesstand): Gesundheit {
  if (s.haenger.length >= 2) return "offTrack";
  if (s.haenger.length === 1 || s.wartetAufSinan.length > 0) return "atRisk";
  return "onTrack";
}

/** Text des Tages-Updates als Markdown-Listen. */
export function updateText(s: Tagesstand): string {
  const liste = (t: string[]) => (t.length ? t.map((x) => `- ${x}`).join("\n") : "- keine");
  return [
    "Automatisches Tages-Update des Projekt-Wächters (SIN-419).",
    "",
    "**Erledigt in 24 h**",
    liste(s.erledigt24h),
    "",
    "**In Arbeit**",
    liste(s.inArbeit),
    "",
    "**Wartet auf Sinan**",
    liste(s.wartetAufSinan),
    "",
    "**Hänger**",
    liste(s.haenger),
  ].join("\n");
}

/** Update fällig, wenn das letzte älter als 24 Stunden ist (oder fehlt). */
export const updateFaellig = (letztesUpdateAt: string | null, jetzt: Date) =>
  !letztesUpdateAt || jetzt.getTime() - ms(letztesUpdateAt) >= 24 * STUNDE;

// ------------------------------------------------------------ Entscheidungen aus Linear (SIN-651)

export type Entscheidung = { repo: RepoName; nummer: number; antwort: string };

/**
 * Linear-Kommentare, die mit `Entscheidung:` beginnen und `owner/repo#nr` nennen (auch als Markdown-Link-Text).
 * Nur Repos aus `REPOS` (der Wächter-Token fasst nichts anderes an). Je PR zählt der jüngste Kommentar, `kommentare` jüngster zuerst.
 */
export function entscheidungenAusKommentaren(kommentare: string[]): Entscheidung[] {
  const r = new Map<string, Entscheidung>();
  for (const body of kommentare) {
    const text = body.trim();
    if (!/^Entscheidung:/i.test(text)) continue;
    const antwort = text.replace(/^Entscheidung:\s*/i, "");
    for (const m of text.matchAll(/([\w.-]+\/[\w.-]+)#(\d+)/g)) {
      const repo = m[1];
      if (!istRepo(repo)) continue;
      const key = `${repo}#${m[2]}`;
      if (!r.has(key)) r.set(key, { repo, nummer: Number(m[2]), antwort });
    }
  }
  return [...r.values()];
}

/** PR-Kommentar mit der übernommenen Entscheidung. */
export const entscheidungsText =(e: Entscheidung) => `Entscheidung aus Linear (übernommen vom Wächter, SIN-651): ${e.antwort}`;

// ------------------------------------------------------------ Snapshot (SIN-572)

/** Der Leitstand schreibt keine Zeile je Issue, sondern eine Zusammenfassung: Schlange, offene PRs, Haken aus `docs/FERTIG.md`. */
export function leitstandSnapshot(issues: LinearIssue[], prs: PrInfo[], repo: string, haken: { fertig: number; gesamt: number } | null, gespiegelt: Set<string>) {
  const claude = issues.filter((i) => hatLabel(i, LABEL));
  const todo = claude.filter((i) => i.stateType === "unstarted");
  return {
    project: "leitstand",
    queue: { todo: todo.length, startable: startbare(issues, gespiegelt).length, in_progress: claude.filter((i) => i.stateType === "started").length },
    // shortcut: nur claude/-PRs. CI-Status und Entwurf kommen aus GitHub (SIN-635); Migrations-PRs tragen zusätzlich das Label `migration`.
    open_prs: prs.filter((p) => !p.gemergtAt).map((p) => ({ repo, nummer: p.number, titel: p.titel, url: `https://github.com/${repo}/pull/${p.number}`, labels: p.migration ? [...p.labels, "migration"] : p.labels, entwurf: p.entwurf ?? false, ciGruen: p.ciGruen ?? false, grund: null })),
    // Spalten wie beim Status-Lauf der Lern-App (loop_snapshot hat kein `progress`).
    fertig_v1: haken?.fertig ?? null,
    gesamt_v1: haken?.gesamt ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * SIN-788: Warum der Leitstand-Snapshot in diesem Lauf nicht geschrieben wird, sonst null.
 * Reihenfolge wie in `main` des Wächters; `ziel` ist Repo und Linear-Projektname des Leitstands aus PROJEKTE.
 */
export function snapshotGrundOhneProjekt(namen: string[], ziel: { linearProjekt: string }): string | null {
  return namen.includes(ziel.linearProjekt) ? null : `Linear-Projekt „${ziel.linearProjekt}“ nicht unter den ${namen.length} geladenen Projekten`;
}

/** Grund, warum der Snapshot für dieses Projekt ausfällt, sonst null. */
export function snapshotUebersprungenGrund(p: Projekt, repo: string | null, ziel: { repo: string; linearProjekt: string }): string | null {
  if (p.name !== ziel.linearProjekt) return null;
  if (istPausiert(p)) return "Projekt pausiert (Zusammenfassung enthält „pausiert“)";
  if (!istAktiv(p)) return `Linear-Projekt nicht „In Progress“ (Status ${p.statusTyp})`;
  if (!repo) return "kein GitHub-Link am Linear-Projekt";
  if (repo.toLowerCase() !== ziel.repo.toLowerCase()) return `GitHub-Link zeigt auf ${repo}, erwartet ${ziel.repo}`;
  return null;
}
