// Sofort-Weg der Chatbubble (SIN-865): Statusfragen aus loop_snapshot und leitstand_aufgaben, ohne Modellaufruf. Rein.
import type { Quelle } from "../uebersicht";

export const SPAETER = "Ich schaue nach.";
const KENNUNG = /\bSIN-(\d+)\b/gi;
const STATUSFRAGE = /\b(status|stand|wie weit|was l(ä|ae)uft|l(ä|ae)uft gerade)\b/i;
const ZUSTAND = { offen: "wartet", laeuft: "läuft gerade", fertig: "fertig", abgebrochen: "abgebrochen" } as const;

function zeile(kennung: string, q: Quelle): string {
  const a = q.aufgaben?.find((x) => x.issue.toUpperCase() === kennung);
  const s = q.snapshot.find((x) => x.issue?.toUpperCase() === kennung);
  if (!a && !s) return `${kennung}: nicht bekannt.`;
  const teile = [a ? ZUSTAND[a.status] : (s?.status ?? "Stand unklar")];
  if (a?.status === "laeuft") teile.push(a.labels.includes("claude") ? "Claude arbeitet daran" : "in Arbeit");
  const pr = s?.open_prs[0]?.nummer ?? s?.pr;
  if (pr) teile.push(`offener PR #${pr}`);
  if ([...(a?.labels ?? []), ...(s?.labels ?? [])].some((l) => l === "sinan" || l === "needs-human")) teile.push("braucht Sinan");
  return `${kennung}${a ? ` „${a.titel}“` : ""}: ${teile.join(", ")}.`;
}

/** Antwort aus vorhandenen Daten oder null, wenn die Frage mehr braucht (dann „Ich schaue nach.“ und Übergabe an Chat 3). */
export function sofortAntwort(text: string, q: Quelle): string | null {
  const kennungen = [...new Set([...text.matchAll(KENNUNG)].map((m) => `SIN-${m[1]}`))].slice(0, 5);
  if (kennungen.length > 0) return kennungen.map((k) => zeile(k, q)).join("\n");
  if (!STATUSFRAGE.test(text)) return null;
  const lauf = (q.aufgaben ?? []).filter((a) => a.status === "laeuft" && a.labels.includes("claude")).slice(0, 5);
  return lauf.length === 0 ? "Gerade arbeitet niemand an einer Aufgabe." : `Gerade in Arbeit: ${lauf.map((a) => `${a.issue} „${a.titel}“`).join("; ")}.`;
}
