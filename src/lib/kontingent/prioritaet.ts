// Kontingent-Prioritäten (SIN-633). Rein: Stufe eines Issues, Knappheit, Verbrauchsschätzung. Netz in scripts/loop/.

/** 1 rote Probe/Bug, 2 Produkt Lern-App, 3 Produkt Leitstand, 4 Loop/Infra, 5 Idee. */
export type Stufe = 1 | 2 | 3 | 4 | 5;

/** Unter diesem geschätzten Rest (Prozent) pausiert der Loop: Puffer für Sinans eigene Sitzungen. */
export const PUFFER_PROZENT = 15;
/** Unter diesem Rest laufen nur noch Stufe 1–2. */
export const KNAPP_PROZENT = 40;

export type Groesse = "klein" | "mittel" | "gross";
/** shortcut: feste Schätzung in Prozentpunkten des Kontingents, bis genug loop_events je Größe vorliegen. */
export const VERBRAUCH_PROZENT: Record<Groesse, number> = { klein: 2, mittel: 5, gross: 10 };

const hat = (labels: string[], ...namen: string[]) => labels.some((l) => namen.includes(l.toLowerCase()));

export function stufe(labels: string[]): Stufe {
  if (hat(labels, "bug", "probe-rot")) return 1;
  if (hat(labels, "lernapp", "produkt-lernapp")) return 2;
  if (hat(labels, "idee")) return 5;
  if (hat(labels, "loop", "infra")) return 4;
  return 3;
}

export function groesse(labels: string[]): Groesse {
  return hat(labels, "klein") ? "klein" : hat(labels, "gross") ? "gross" : "mittel";
}

/** Höchste Stufe, die bei diesem Rest noch startet; 0 = nichts. Unbekannter Rest (null) bremst nicht. */
export function hoechsteStufe(rest: number | null): 0 | 2 | 5 {
  if (rest === null) return 5;
  if (rest < PUFFER_PROZENT) return 0;
  return rest < KNAPP_PROZENT ? 2 : 5;
}

/** Geschätzter Rest in Prozent aus der Claude-Quote des Snapshots; ohne Quote null. */
export function restProzent(quoten: { name: string; used: number; limit: number }[]): number | null {
  const q = quoten.find((x) => /claude/i.test(x.name) && x.limit > 0);
  return q ? Math.max(0, Math.round((1 - q.used / q.limit) * 100)) : null;
}

/** Aus der Reihenfolge nur das, was nach Stufe und Verbrauchsschätzung noch passt (Puffer bleibt frei). */
export function passend<T extends { labels: string[] }>(geordnet: T[], rest: number | null): T[] {
  if (rest === null) return geordnet;
  const grenze = hoechsteStufe(rest);
  let frei = rest - PUFFER_PROZENT;
  const r: T[] = [];
  for (const i of geordnet) {
    const kosten = VERBRAUCH_PROZENT[groesse(i.labels)];
    if (stufe(i.labels) > grenze || kosten > frei) continue;
    frei -= kosten;
    r.push(i);
  }
  return r;
}

/** Satz für den Leitstand; null, wenn das Kontingent reicht. */
export function knappSatz(rest: number | null): string | null {
  const g = hoechsteStufe(rest);
  if (g === 0) return `Kontingent fast leer (≈ ${rest} % Rest, Schätzung), der Loop pausiert und lässt Platz für deine Sitzungen.`;
  if (g === 2) return `Kontingent knapp (≈ ${rest} % Rest, Schätzung), es laufen nur noch Stufe 1–2.`;
  return null;
}
