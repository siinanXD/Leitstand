/**
 * Projekt-Wächter (SIN-419): reine Funktionen, kein Netz.
 * Das Skript scripts/waechter/waechter.ts holt Daten aus Linear und GitHub und führt die geplanten Aktionen aus.
 */
import { MAX_REPARATUR, NIE_AUTOMATISCH, nachruecken, reparatur, type LinearIssue } from "../loop/auswahl";

export const PLANUNG_TITEL = "Nächste Schritte planen";
export const EINRICHTEN_TITEL = "Projekt einrichten";
export const HAENGER_STUNDEN = 6;
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

export const istPausiert = (p: Projekt) => /pausiert/i.test(p.zusammenfassung ?? "");
export const istAktiv = (p: Projekt) => p.statusTyp === "started";

// ---------------------------------------------------------------- Schlange

export type SchlangenAktion = { art: "nachruecken"; issue: LinearIssue } | { art: "planung" } | null;

const offen = (i: LinearIssue) => i.stateType !== "completed" && i.stateType !== "canceled";
const hatLabel = (i: LinearIssue, name: string) => i.labels.some((l) => l.toLowerCase() === name);

/**
 * Schlange füllen: kein startbares Todo → wichtigstes Backlog-Issue nachrücken (Regel SIN-417);
 * auch der Backlog leer → Planungs-Issue, höchstens eins offen je Projekt.
 * `issues` sind alle Issues des Projekts.
 */
export function planeSchlange(issues: LinearIssue[], gespiegelt: Set<string>, max = 1): SchlangenAktion {
  const nachr = nachruecken(issues, gespiegelt, max);
  if (nachr) return { art: "nachruecken", issue: nachr };
  // Es läuft oder wartet schon etwas mit Label `claude` (auch blockiert): kein Planungs-Issue.
  if (issues.some((i) => (i.stateType === "unstarted" || i.stateType === "started") && hatLabel(i, "claude"))) return null;
  // Backlog mit startbaren Issues (nur Platz belegt): nichts tun.
  const backlogStartbar = issues.some(
    (i) => i.stateType === "backlog" && !i.labels.some((l) => NIE_AUTOMATISCH.includes(l.toLowerCase())),
  );
  if (backlogStartbar) return null;
  if (issues.some((i) => offen(i) && i.title.trim() === PLANUNG_TITEL)) return null;
  return { art: "planung" };
}

export function planungsIssue(projekt: string): { title: string; description: string } {
  return {
    title: PLANUNG_TITEL,
    description: [
      `Die Schlange im Projekt „${projekt}“ ist leer: kein Todo, kein Backlog.`,
      "",
      "- Projektbeschreibung, offene Punkte und den Stand im Repo lesen.",
      "- Die nächsten 3 bis 5 Schritte als einzelne Linear-Issues im Backlog anlegen (klarer Titel, Ziel, „Fertig, wenn“).",
      "- Aufgaben, die nur Sinan erledigen kann, mit Label `sinan` versehen.",
      "- Keine Issues löschen.",
    ].join("\n"),
  };
}

// ------------------------------------------------------------------ Hänger

export type HaengerAktion = { art: "zuruecksetzen" | "needs-human"; issue: WaechterIssue };

const prGehoertZu = (pr: PrInfo, i: LinearIssue) =>
  pr.titel.includes(i.identifier) || pr.branch.toLowerCase().includes(i.identifier.toLowerCase());

/** Issue „In Progress“ seit mehr als 6 Stunden ohne offenen PR: einmal zurück auf Todo, danach needs-human. */
export function erkenneIssueHaenger(issues: WaechterIssue[], offenePrs: PrInfo[], jetzt: Date): HaengerAktion[] {
  const r: HaengerAktion[] = [];
  for (const i of issues) {
    if (i.stateType !== "started" || !i.startedAt) continue;
    if (hatLabel(i, "needs-human")) continue;
    if (jetzt.getTime() - ms(i.startedAt) <= HAENGER_STUNDEN * STUNDE) continue;
    if (offenePrs.some((pr) => prGehoertZu(pr, i))) continue;
    const schonZurueck = i.kommentare.some((k) => k.includes(MARKER_ZURUECK));
    r.push({ art: schonZurueck ? "needs-human" : "zuruecksetzen", issue: i });
  }
  return r;
}

export type PrAktion = { art: "reparatur"; pr: PrInfo; runde: number } | { art: "stopp"; pr: PrInfo };

/** Offener PR mit roter CI und seit 30 Minuten ohne neuen Commit: @claude bitten (höchstens 3 Runden), danach needs-human. */
export function erkennePrHaenger(prs: PrInfo[], jetzt: Date): PrAktion[] {
  const r: PrAktion[] = [];
  for (const pr of prs) {
    if (!pr.ciRot || pr.labels.includes("needs-human")) continue;
    if (jetzt.getTime() - ms(pr.letzterCommitAt) < CI_WARTE_MINUTEN * MINUTE) continue;
    // Gerade erst gebeten: Wartezeit abwarten.
    if (pr.letzteReparaturAt && jetzt.getTime() - ms(pr.letzteReparaturAt) < CI_WARTE_MINUTEN * MINUTE) continue;
    const schritt = reparatur(pr.labels);
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

export const reparaturText = (pr: PrInfo, runde: number) =>
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

export const istNeu = (p: Projekt, jetzt: Date) => jetzt.getTime() - ms(p.createdAt) <= NEU_TAGE * 24 * STUNDE;

/** Nur neue, nicht pausierte Projekte in Backlog, Planned oder In Progress. Vor dem Laden der Issues prüfen (spart Linear-Abfragen). */
export const kommtAlsNeuInFrage = (p: Projekt, jetzt: Date) =>
  ["backlog", "planned", "started"].includes(p.statusTyp) && istNeu(p, jetzt) && !istPausiert(p);

/** Ab wann erledigte Issues noch geladen werden: 48 h reichen für Tagesstand (24 h) und Hänger. */
export const ERLEDIGT_SEIT_STUNDEN = 48;
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

export function gesundheit(s: Tagesstand): Gesundheit {
  if (s.haenger.length >= 2) return "offTrack";
  if (s.haenger.length === 1 || s.wartetAufSinan.length > 0) return "atRisk";
  return "onTrack";
}

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
