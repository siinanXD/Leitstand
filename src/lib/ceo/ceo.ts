// CEO-Agent (SIN-542): reine Entscheidung je Produkt. Kein Netz, kein KI-Aufruf.
// `scripts/ceo/ceo.ts` sammelt die Daten und schreibt. Der CEO legt nur fest und priorisiert: kein Geld, keine DB-Änderung, keine Freigabe.
import type { SnapshotRow } from "../uebersicht";

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
export const ohneDaten = (id: string, name: string): Entscheidung => ({ produkt: id, art: "warten", grund: `${name}: Keine Daten, ich kann noch nichts entscheiden.`, auffuellen: 0, dringend: false, metaErlaubt: true, ideenErlaubt: false });

/** Genau eine Entscheidung je Produkt. Reihenfolge: reparieren, fertig, Vorrat reicht, warten, weiterbauen. */
export function entscheide(p: ProduktLage): Entscheidung {
  const v1Fertig = p.gesamt !== null && p.gesamt > 0 && p.fertig !== null && p.fertig >= p.gesamt;
  const basis = { produkt: p.id, metaErlaubt: p.metaPrsHeute < 1, ideenErlaubt: v1Fertig && p.ideenDieseWoche < 1 };
  if (p.rot) return { ...basis, art: "reparieren", grund: `${p.name}: Ich repariere zuerst ${p.rot}, weil echte Nutzer sonst Fehler sehen.`, auffuellen: 1, dringend: true };
  if (v1Fertig) return { ...basis, art: "fertig", grund: `${p.name}: Das Grundgerüst steht, es gibt nichts Dringendes mehr zu bauen.`, auffuellen: 0, dringend: false };
  if (p.startbar >= MIN_STARTBAR) return { ...basis, art: "weiterbauen", grund: `${p.name}: Genug Arbeit liegt bereit, ich plane nichts Neues.`, auffuellen: 0, dringend: false };
  if (p.startbar === 0 && p.wartetAufSinan.length > 0) return { ...basis, art: "warten", grund: `${p.name}: Ich warte auf dich bei ${nenne(p.wartetAufSinan)}, sonst kann nichts weitergehen.`, auffuellen: 0, dringend: false };
  const luecke = p.fertig !== null && p.gesamt !== null ? `die nächste Lücke (${p.fertig} von ${p.gesamt} fertig)` : "die nächste Lücke";
  return { ...basis, art: "weiterbauen", grund: `${p.name}: Es liegt zu wenig bereit, ich plane ${luecke}.`, auffuellen: MAX_STARTBAR - p.startbar, dringend: false };
}

/** Zeile für `loop_events`, damit der Leitstand zeigt, dass und wann der CEO lief. */
export const ereignisZeile = (projekt: string, runId: string | null, runUrl: string | null) => ({ project: projekt, agent: SCHRITT, step: SCHRITT, status: "ok", grund: EREIGNIS, issue: null, pr: null, run_id: runId, run_url: runUrl });

/** Zeile für `ceo_entscheidungen` (nur hinzufügen). */
export const entscheidungsZeile = (e: Entscheidung, ausloeser: Ausloeser, issueUrl: string | null) => ({ produkt: e.produkt, entscheidung: e.art, grund: e.grund, ausloeser, dringend: e.dringend, issue_url: issueUrl });

/** Eine Zeile fürs Gedächtnis. */
export const gedaechtnisZeile = (e: Entscheidung, tag: string) => `- ${tag} CEO ${e.art}: ${e.grund.replace(/\s+/g, " ")}`;

export type Zeile = { produkt: string; entscheidung: Art; grund: string; created_at: string };

/** Letzte Entscheidung je Produkt aus Zeilen von `ceo_entscheidungen`; Unlesbares fällt weg. */
export function letzteJeProdukt(raw: unknown): Zeile[] {
  if (!Array.isArray(raw)) return [];
  const je = new Map<string, Zeile>();
  for (const r of raw as Record<string, unknown>[]) {
    const art = ARTEN.find((a) => a === r?.entscheidung);
    if (!art || typeof r.produkt !== "string" || typeof r.grund !== "string" || typeof r.created_at !== "string" || Number.isNaN(Date.parse(r.created_at))) continue;
    const alt = je.get(r.produkt);
    if (!alt || Date.parse(r.created_at) > Date.parse(alt.created_at)) je.set(r.produkt, { produkt: r.produkt, entscheidung: art, grund: r.grund, created_at: r.created_at });
  }
  return [...je.values()].sort((a, b) => a.produkt.localeCompare(b.produkt));
}
