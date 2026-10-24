// Messwerte für /kosten (SIN-1047): Vercel je Team, API-Guthaben, Abo-Schätzung. Rein; Netz in scripts/kontingent/sammler.ts.
import type { Quota } from "../uebersicht";
import type { Guthaben } from "../kosten/guthaben";

export const VERCEL_KEY = "vercel_deployments_tag";
/** Hobby-Plan: 100 Deployments pro Tag für das ganze Konto (Team), nicht je Projekt. */
export const VERCEL_LIMIT_TAG = 100;
const TAG = 24 * 3_600_000;

export type Deployment = { uid: string; name?: string; projectId?: string; created?: number };

/** Deployments der letzten 24 h über alle Projekte des Teams; jede `uid` zählt einmal. */
export function vercelTeam(deployments: Deployment[], jetzt: Date): Quota {
  const ids = new Set(deployments.filter((d) => d.created === undefined || d.created >= jetzt.getTime() - TAG).map((d) => d.uid));
  return { key: VERCEL_KEY, name: "Vercel: Deployments pro Tag (Team)", used: ids.size, limit: VERCEL_LIMIT_TAG, schaetzung: false, quelle: "team" };
}

export type NichtMessbar = { dienst: string; grund: string };
export type GuthabenZeile = ({ art: "wert" } & Guthaben) | ({ art: "nicht-messbar" } & NichtMessbar);

/**
 * API-Guthaben = eingetragene Einzahlung − Verbrauch seit der Einzahlung (`gerechnet`). Ohne Admin-Key, Einzahlung
 * oder Verbrauch kein Wert, sondern „nicht messbar“ mit Grund. Einheit wie vom Dienst abgerechnet (OpenAI: USD).
 */
export function apiGuthaben(dienst: string, einzahlung: number, verbrauch: number | null, adminKeyDa: boolean, jetzt: Date, link: string | null = null, einheit = "$"): GuthabenZeile {
  if (!adminKeyDa) return { art: "nicht-messbar", dienst, grund: "Admin-Key fehlt" };
  if (einzahlung <= 0) return { art: "nicht-messbar", dienst, grund: "Einzahlung nicht eingetragen" };
  if (verbrauch === null) return { art: "nicht-messbar", dienst, grund: "Verbrauch unbekannt" };
  return { art: "wert", dienst, wert: Math.max(0, einzahlung - verbrauch), gesamt: einzahlung, einheit, quelle: "gerechnet", aktualisiert: jetzt.toISOString(), link };
}

export const nichtMessbarText = (n: NichtMessbar) => `${n.dienst}: nicht messbar: ${n.grund}`;

/** Beschriftung einer Kontingent-Zeile auf /kosten: Schätzungen sind als solche erkennbar. */
export function quotaText(q: Quota): string {
  const anteil = Math.round((q.used / q.limit) * 100);
  return q.quelle === "schaetzung" || q.schaetzung ? `etwa ${anteil} % benutzt (Schätzung)` : `${q.used.toLocaleString("de-DE")} von ${q.limit.toLocaleString("de-DE")} benutzt${q.quelle === "team" ? " (ganzes Team)" : ""}`;
}
