// Ableitungen für „Alle Projekte“ (Figma D1/D3) und die Projektseite (C1/C4), SIN-531. Rein; nur echte Zeilen, sonst null.
import { LINK_ARTEN, type LinkArt, type Projekt } from "./projekte";
import { aufgabenFuerDich, inArbeitZeilen, pipelineSchiene, type Aufgabe, type SchienenStufe } from "./uebersicht-b1";
import { kontingente, letzte24h, type LoopEvent, type Quelle, type Quota, type SnapshotRow } from "./uebersicht";

export const LINK_NAMEN: Record<LinkArt, string> = { app: "App", vorschau: "Vorschau", github: "GitHub", linear: "Linear", vercel: "Vercel", supabase: "Supabase", langfuse: "Langfuse", sentry: "Sentry", posthog: "PostHog", figma: "Figma" };

export type ProjektLink = { art: LinkArt; name: string; href: string | null };

/** Linkleiste in fester Reihenfolge; ohne bekannte Adresse bleibt `href` null (nichts raten). GitHub folgt aus dem Repo. */
export function projektLinks(p: Projekt): ProjektLink[] {
  return LINK_ARTEN.map((art) => ({ art, name: LINK_NAMEN[art], href: p.links?.[art] ?? (art === "github" && p.repo ? `https://github.com/${p.repo}` : null) }));
}

export const projektQuelle = (q: Quelle, id: string): Quelle => ({ events: q.events.filter((e) => e.project === id), snapshot: q.snapshot.filter((s) => s.project === id) });

const ERLEDIGT = /^(done|merged|closed)$/i;
const LAEUFT = /^(running|in_progress|active)$/i;

/** Linear-Link nur für echte Kennungen. */
export const linearLink = (ref: string) => (/^SIN-\d+$/.test(ref) ? `https://linear.app/sinan-kahraman/issue/${ref}` : null);

export type DeineAufgabe = Aufgabe & { href: string | null };

/** Aufgaben mit Label `sinan` (C4): offen, mit Kennung, Minuten und Linear-Link. */
export function projektAufgaben(snapshot: SnapshotRow[], id: string): DeineAufgabe[] {
  return aufgabenFuerDich(snapshot.filter((s) => s.project === id)).map((a) => ({ ...a, href: linearLink(a.ref) }));
}

/** „Als Nächstes“: offene, nicht blockierte Zeilen, die noch nicht laufen. */
export function alsNaechstes(snapshot: SnapshotRow[], id: string, max = 3): string[] {
  return snapshot
    .filter((s) => s.project === id && !(s.status && (ERLEDIGT.test(s.status) || LAEUFT.test(s.status))) && s.blocked_by.length === 0 && (s.title || s.issue))
    .slice(0, max)
    .map((s) => s.title ?? s.issue ?? "");
}

/** „Wo die Zeit hingeht“: Ereignisse der 24 h je Stufe, größte zuerst. */
export function zeitVerteilung(events: LoopEvent[], jetzt: Date): { stufe: string; anzahl: number; anteil: number }[] {
  const ev = letzte24h(events, jetzt).filter((e) => e.step);
  const je = new Map<string, number>();
  for (const e of ev) je.set(e.step!.toUpperCase(), (je.get(e.step!.toUpperCase()) ?? 0) + 1);
  return [...je].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([stufe, anzahl]) => ({ stufe, anzahl, anteil: anzahl / ev.length }));
}

export type Betrieb = { stufen: SchienenStufe[]; grund: string | null; kostenUsd: number | null; ereignisse24h: number };

/** Betrieb: Kette der Stufen, Grund bei Rot, Modellkosten der 24 h (nur wenn Ereignisse Kosten tragen). */
export function projektBetrieb(q: Quelle, id: string, jetzt: Date): Betrieb {
  const ev = letzte24h(projektQuelle(q, id).events, jetzt);
  const mitKosten = ev.filter((e) => e.cost !== null);
  const { stufen, grund } = pipelineSchiene(ev, jetzt);
  return { stufen, grund, kostenUsd: mitKosten.length ? mitKosten.reduce((s, e) => s + (e.cost ?? 0), 0) : null, ereignisse24h: ev.length };
}

export type ProjektZeile = {
  projekt: Projekt;
  /** Phase: Bauphase laut Konfiguration, sonst Betrieb; ohne Daten null. */
  phase: string | null;
  worker: number;
  prs: number;
  brauchtDich: number;
  kette: SchienenStufe[];
  kontingente: Quota[];
};

/** Zeile je Projekt der Tabelle „Alle Projekte“. Reife und Prognose gibt es ohne Datenquelle nicht und fehlen deshalb. */
export function projektZeile(q: Quelle, p: Projekt, jetzt: Date): ProjektZeile {
  const mein = projektQuelle(q, p.id);
  const hatDaten = mein.events.length > 0 || mein.snapshot.length > 0;
  return {
    projekt: p,
    phase: hatDaten ? (p.bauphase ? "Bauphase" : "Betrieb") : null,
    worker: inArbeitZeilen(mein, jetzt).length,
    prs: mein.snapshot.reduce((n, s) => n + s.open_prs.length, 0),
    brauchtDich: aufgabenFuerDich(mein.snapshot).length,
    kette: pipelineSchiene(mein.events, jetzt).stufen,
    kontingente: kontingente(mein.snapshot),
  };
}

export const alleZeilen = (q: Quelle, projekte: Projekt[], jetzt: Date): ProjektZeile[] => projekte.map((p) => projektZeile(q, p, jetzt));

/** Ein Satz über alle Projekte aus den Zeilen; ohne Projekte null. */
export function projekteSatz(zeilen: ProjektZeile[]): string | null {
  if (zeilen.length === 0) return null;
  const worker = zeilen.reduce((n, z) => n + z.worker, 0);
  const wartet = zeilen.reduce((n, z) => n + z.brauchtDich, 0);
  const teile = [`${zeilen.length} ${zeilen.length === 1 ? "Projekt" : "Projekte"}`, `${worker} ${worker === 1 ? "Worker arbeitet" : "Worker arbeiten"}`];
  if (wartet > 0) teile.push(`${wartet} ${wartet === 1 ? "Aufgabe wartet" : "Aufgaben warten"} auf dich`);
  return `${teile.join(", ")}.`;
}
