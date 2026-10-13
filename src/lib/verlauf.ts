// Verlauf einer Aufgabe in Worten aus loop_events (Sinan 13.10.: „Ich weiß gar nicht, worum es geht“). Rein.
// Rollen-Meldungen (payload) gibt es in loop_events nicht; diese Schritte schreiben die Workflows aber zuverlässig.

export type VerlaufSchritt = { satz: string; zeit: string; rot: boolean; anzahl: number };

const ROT = /fehler|fail|error|abort|rot/i;

/** Ein Ereignis in einen Satz übersetzen; unbekannte Schritte fallen weg. */
export function satzFuer(step: string | null, status: string | null): string | null {
  const s = (step ?? "").toLowerCase();
  const rot = !!status && ROT.test(status);
  if (s === "dispatch") return "Eingeplant";
  if (s === "worker") return rot ? "Versuch ohne Ergebnis" : status === "start" ? "Ein Helfer hat angefangen" : "Helfer fertig, ein Vorschlag liegt vor";
  if (s === "pr-gate" || s === "gate") return rot ? "Prüfung hat etwas gefunden" : status === "start" ? "Wird geprüft" : "Prüfung bestanden";
  if (s === "repair") return "Wird repariert";
  if (s === "merge") return rot ? "Übernehmen ging schief" : "Fertig und übernommen";
  if (s === "worker_pause") return "Pause, das Kontingent ist leer";
  return null;
}

/** Älteste zuerst; gleiche Sätze direkt hintereinander werden zusammengefasst (mit Anzahl). */
export function verlauf(roh: unknown, issue: string): VerlaufSchritt[] {
  if (!Array.isArray(roh)) return [];
  const zeilen = roh
    .flatMap((r) => {
      const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
      if (!o || o.issue !== issue || typeof o.created_at !== "string") return [];
      const satz = satzFuer(typeof o.step === "string" ? o.step : null, typeof o.status === "string" ? o.status : null);
      return satz ? [{ satz, zeit: o.created_at, rot: typeof o.status === "string" && ROT.test(o.status) }] : [];
    })
    .sort((a, b) => Date.parse(a.zeit) - Date.parse(b.zeit));
  const aus: VerlaufSchritt[] = [];
  for (const z of zeilen) {
    const vorher = aus.at(-1);
    if (vorher && vorher.satz === z.satz) {
      vorher.anzahl += 1;
      vorher.zeit = z.zeit;
    } else aus.push({ ...z, anzahl: 1 });
  }
  return aus;
}
