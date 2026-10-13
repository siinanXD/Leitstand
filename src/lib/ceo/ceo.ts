// CEO-Agent (SIN-542): reine Entscheidung je Produkt. Kein Netz, kein KI-Aufruf.
// `scripts/ceo/ceo.ts` sammelt die Daten und schreibt. Der CEO legt nur fest und priorisiert: kein Geld, keine DB-Änderung, keine Freigabe.
import type { SnapshotRow } from "../uebersicht";
import { ohneKennungen } from "../zeit";

export const ARTEN = ["weiterbauen", "reparieren", "warten", "fertig"] as const;
export type Art = (typeof ARTEN)[number];
export const AUSLOESER = ["vorrat", "bereitschaft", "rot", "taeglich"] as const;
export type Ausloeser = (typeof AUSLOESER)[number];

/** Vorrat: unter MIN startbaren Issues füllt der CEO auf MAX auf. */
export const MIN_STARTBAR = 3;
export const MAX_STARTBAR = 8;
/** Schritt und Status in `loop_events`: der Leitstand zeigt daran, dass der CEO lief. Der Grund steht in `ceo_entscheidungen`. */
export const SCHRITT = "ceo";
// `loop_events.status` erlaubt nur start|ok|fehler|uebersprungen (Check-Constraint). Der Rollen-Start steht in `grund`.
export const EREIGNIS = "rolle_gestartet";

export type ProduktLage = {
  id: string;
  name: string;
  startbar: number;
  fertig: number | null;
  gesamt: number | null;
  /** Live-Check oder Sentry rot, mit kurzem Grund. */
  rot: string | null;
  /** Wofür Sinan etwas tun muss (Freigabe, `sinan`-Issue). */
  wartetAufSinan: string[];
  /** Loop-/Meta-PRs, die heute schon gemergt wurden. */
  metaPrsHeute: number;
  ideenDieseWoche: number;
  /** Stand der Version (SIN-573): `go` = Sinan hat eine Version freigegeben. */
  version?: "pause" | "vorschlag" | "go" | "fertig" | null;
  /** Anderes Produkt mit freigegebener Version (Fokus-Regel): dieses bekommt nur Reparaturen. */
  fokusBei?: string | null;
  /** Linear-Kennung der Aufgabe, auf die sich der Satz bezieht (SIN-579). */
  bezug?: string | null;
};

export type Entscheidung = {
  produkt: string;
  art: Art;
  /** Ein Satz, Kindersprache. */
  grund: string;
  /** Wie viele startbare Issues neu geplant werden (0 = Vorrat reicht oder nichts zu planen). */
  auffuellen: number;
  dringend: boolean;
  /** Regeln: Meta-Arbeit erlaubt (höchstens 1 pro Tag), Ideen erlaubt (v1 fertig, höchstens 1 pro Woche). */
  metaErlaubt: boolean;
  ideenErlaubt: boolean;
  /** `fertig` ohne Version in Arbeit: Dispatcher stoppen und den Visionär rufen (SIN-573). */
  visionaer?: boolean;
  /** Aufgabe, auf die sich der Satz bezieht (SIN-579); der Leitstand zeigt den Satz nur, solange sie nicht fertig ist. */
  bezug: string | null;
};

const ZURUECKGEHALTEN = ["sinan", "needs-human", "design"];

/** Wie viele Issues eines Produkts sofort startbar sind: Todo, Label `claude`, nicht blockiert, nicht zurückgehalten.
 *  Schreibt ein Produkt nur eine Zusammenfassungszeile (Leitstand, SIN-572), zählt deren `queue.startable`. */
export function startbar(snapshot: SnapshotRow[], projekt: string): number {
  const queue = snapshot.find((s) => s.project === projekt && s.queue)?.queue;
  if (queue) return queue.startable;
  return snapshot.filter((s) => s.project === projekt && s.issue && /^(todo|unstarted)$/i.test(s.status ?? "") && s.labels.includes("claude") && s.blocked_by.length === 0 && !s.labels.some((l) => ZURUECKGEHALTEN.includes(l))).length;
}

const nenne = (liste: string[]) => liste.slice(0, 2).join(" und ") + (liste.length > 2 ? ` und ${liste.length - 2} weiteres` : "");

/** Fehlt die Snapshot-Zeile eines Produkts, wartet der CEO ehrlich, statt zu raten. */
export const ohneDaten = (id: string, name: string): Entscheidung => ({ produkt: id, art: "warten", grund: `${name}: Ich weiß noch zu wenig, um zu entscheiden.`, auffuellen: 0, dringend: false, metaErlaubt: true, ideenErlaubt: false, bezug: null });

/** Genau eine Entscheidung je Produkt. Reihenfolge: reparieren, fertig, Fokus, Vorrat reicht, warten, weiterbauen. */
export function entscheide(p: ProduktLage): Entscheidung {
  const v1Fertig = p.gesamt !== null && p.gesamt > 0 && p.fertig !== null && p.fertig >= p.gesamt;
  const basis = { produkt: p.id, bezug: p.bezug ?? null, metaErlaubt: p.metaPrsHeute < 1, ideenErlaubt: v1Fertig && p.ideenDieseWoche < 1 };
  // Mit freigegebener Version (Sinans „go“) baut das Produkt weiter, auch wenn die alte Liste voll ist.
  const fertig = v1Fertig && p.version !== "go";
  const wartetAufVersion = p.version === "pause" || p.version === "vorschlag";
  if (p.rot) return { ...basis, art: "reparieren", grund: `${p.name}: Ich repariere zuerst ${p.rot}, weil echte Nutzer sonst Fehler sehen.`, auffuellen: 1, dringend: true };
  if (fertig) return { ...basis, art: "fertig", grund: wartetAufVersion ? `${p.name}: Das Grundgerüst steht, ich baue erst mit deinem Go für die nächste Version weiter.` : `${p.name}: Das Grundgerüst steht, ich stoppe und plane die nächste Version.`, auffuellen: 0, dringend: false, visionaer: !wartetAufVersion };
  if (p.fokusBei) return { ...basis, art: "warten", grund: `${p.name}: Der Fokus liegt auf einer Version von ${p.fokusBei}, ich repariere nur.`, auffuellen: 0, dringend: false };
  if (p.startbar >= MIN_STARTBAR) return { ...basis, art: "weiterbauen", grund: `${p.name}: Es ist genug zu tun, die Helfer bauen weiter.`, auffuellen: 0, dringend: false };
  if (p.startbar === 0 && p.wartetAufSinan.length > 0) return { ...basis, art: "warten", grund: `${p.name}: Ich warte auf dich bei ${nenne(p.wartetAufSinan)}, sonst kann nichts weitergehen.`, auffuellen: 0, dringend: false };
  const luecke = p.fertig !== null && p.gesamt !== null ? ` (${p.fertig} von ${p.gesamt} Punkten fertig)` : "";
  return { ...basis, art: "weiterbauen", grund: `${p.name}: Bald ist nichts mehr zu tun, ich suche die nächsten Aufgaben aus${luecke}.`, auffuellen: MAX_STARTBAR - p.startbar, dringend: false };
}

/** Zeile für `loop_events`, damit der Leitstand zeigt, dass und wann der CEO lief. */
export const ereignisZeile = (projekt: string, runId: string | null, runUrl: string | null) => ({ project: projekt, agent: SCHRITT, step: SCHRITT, status: "ok", grund: EREIGNIS, issue: null, pr: null, run_id: runId, run_url: runUrl });

/** Zeile für `ceo_entscheidungen` (nur hinzufügen). */
export const entscheidungsZeile = (e: Entscheidung, ausloeser: Ausloeser, issueUrl: string | null) => ({ produkt: e.produkt, entscheidung: e.art, grund: e.grund, ausloeser, dringend: e.dringend, issue_url: issueUrl, bezug: e.bezug });

/** Eine Zeile fürs Gedächtnis. */
export const gedaechtnisZeile = (e: Entscheidung, tag: string) => `- ${tag} CEO ${e.art}: ${e.grund.replace(/\s+/g, " ")}`;

export type Zeile = { produkt: string; entscheidung: Art; grund: string; created_at: string; bezug: string | null };

/** Letzte Entscheidung je Produkt aus Zeilen von `ceo_entscheidungen`; Unlesbares fällt weg. */
export function letzteJeProdukt(raw: unknown): Zeile[] {
  if (!Array.isArray(raw)) return [];
  const je = new Map<string, Zeile>();
  for (const r of raw as Record<string, unknown>[]) {
    const art = ARTEN.find((a) => a === r?.entscheidung);
    if (!art || typeof r.produkt !== "string" || typeof r.grund !== "string" || typeof r.created_at !== "string" || Number.isNaN(Date.parse(r.created_at))) continue;
    const alt = je.get(r.produkt);
    if (!alt || Date.parse(r.created_at) > Date.parse(alt.created_at)) je.set(r.produkt, { produkt: r.produkt, entscheidung: art, grund: r.grund, created_at: r.created_at, bezug: typeof r.bezug === "string" && r.bezug !== "" ? r.bezug : null });
  }
  return [...je.values()].sort((a, b) => a.produkt.localeCompare(b.produkt));
}

const FERTIG = /^(done|completed)$/i;
const LAEUFT = /^(in.?progress|started|running)$/i;

/** Aufgabe, auf die sich die Entscheidung bezieht: was gerade läuft, sonst die erste, die bereitliegt. */
export function bezugVon(snapshot: SnapshotRow[], projekt: string): string | null {
  const offen = snapshot.filter((s) => s.project === projekt && s.issue && !FERTIG.test(s.status ?? ""));
  return (offen.find((s) => LAEUFT.test(s.status ?? "")) ?? offen[0])?.issue ?? null;
}

/** Ist die Aufgabe fertig? Ja bei Status done/completed, oder wenn das Produkt Zeilen je Aufgabe liefert und diese nicht mehr dabei ist.
 *  shortcut: Produkte mit nur einer Zusammenfassungszeile (Leitstand) gelten nie als fertig, bei Bedarf `queue` um erledigte Kennungen erweitern. */
export function bezugErledigt(bezug: string | null, snapshot: SnapshotRow[], projekt: string): boolean {
  if (!bezug) return false;
  const zeilen = snapshot.filter((s) => s.project === projekt && s.issue);
  const meine = zeilen.find((s) => s.issue === bezug);
  return meine ? FERTIG.test(meine.status ?? "") : zeilen.length > 0;
}

/** Der Satz für die Seite (SIN-579): ist der Bezug erledigt, heißt es „… ist fertig. Nächstes kommt gleich.“; ohne Bezug bleibt die Entscheidung, wie sie ist. */
export function chefSatz(z: Zeile, name: string, snapshot: SnapshotRow[]): string {
  if (bezugErledigt(z.bezug, snapshot, z.produkt)) {
    const titel = ohneKennungen(snapshot.find((s) => s.project === z.produkt && s.issue === z.bezug)?.title ?? "") || "Die Aufgabe";
    return `${name}: ${titel} ist fertig. Nächstes kommt gleich.`;
  }
  return z.grund.startsWith(`${name}:`) ? z.grund : `${name}: ${z.grund}`;
}
