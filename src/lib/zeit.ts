// Zeit und Text in Worten für die einfachen Seiten (SIN-578). Rein; nie Minuten, nie Zeitstempel, nie Kennungen.
import { berlinerTag } from "./berlin";

const tag = (d: Date) => berlinerTag(d);
const TAG_MS = 86_400_000;
/** Kalendertage zwischen zwei Berliner Tagen (positiv = `b` liegt später). */
const tageZwischen = (a: Date, b: Date) => Math.round((Date.parse(tag(b)) - Date.parse(tag(a))) / TAG_MS);

/** „gerade eben“, „vor 2 Stunden“, „heute“, „gestern“, „morgen“, „diese Woche“. Unlesbare Zeit: null. */
export function zeitInWorten(iso: string, jetzt: Date): string | null {
  const zeit = new Date(iso);
  if (Number.isNaN(zeit.getTime())) return null;
  const diff = jetzt.getTime() - zeit.getTime();
  const tage = tageZwischen(zeit, jetzt);
  if (diff < 0) return tage === 0 ? "heute" : tage === -1 ? "morgen" : tage > -7 ? "diese Woche" : "später";
  const stunden = Math.floor(diff / 3_600_000);
  if (diff < 5 * 60_000) return "gerade eben";
  if (stunden < 1) return diff < 20 * 60_000 ? "vor ein paar Minuten" : "vor einer halben Stunde";
  if (stunden < 6) return stunden === 1 ? "vor einer Stunde" : `vor ${stunden} Stunden`;
  if (tage === 0) return "heute";
  if (tage === 1) return "gestern";
  return tage < 7 ? "diese Woche" : "vor über einer Woche";
}

/** Entfernt, was auf den einfachen Seiten nichts zu suchen hat: Kennungen, PR-Nummern, Minuten, Millisekunden, Zeitstempel, UUIDs. */
export function ohneKennungen(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\(?\bSIN-\d+\b\)?/g, "")
    .replace(/\bPR ?#?\d+\b|#\d+/g, "")
    .replace(/\b\d+ ?(?:min|ms)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,:;!?])/g, "$1")
    .trim();
}
