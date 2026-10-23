// Nachweis je Frontend-PR (SIN-561). Rein; Eingabe sind Zeilen aus loop_events mit `payload.art = "nachweis"`.
// Nichts wird erfunden: fehlt ein Bild oder Clip, steht es nicht da. Nur https-Adressen werden übernommen.

const FRONTEND = [/^src\/app\//, /^src\/components\//, /(^|\/)globals\.css$/];

/** Nachweis gibt es nur, wenn der PR Frontend berührt; Docs und Skripte zählen nicht. */
export const brauchtNachweis = (dateien: string[]): boolean => dateien.some((d) => FRONTEND.some((r) => r.test(d)));

/** `src/app/aufgabe/[id]/page.tsx` → `/aufgabe/[id]`; Dateien ohne eigene Seite → null. */
export function routeVonDatei(datei: string): string | null {
  const m = /^src\/app\/(.*?)\/?page\.tsx$/.exec(datei);
  if (!m) return null;
  return "/" + m[1].split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");
}

/** Clip nur, wenn der PR eine Interaktion ändert oder mehr als eine Route in einem Ablauf. Reine Text-/Farb-/Abstandsänderungen: nur Bilder. */
export const clipSinnvoll = (a: { interaktion: boolean; routenImAblauf: number }): boolean => a.interaktion || a.routenImAblauf > 1;

export type Ansicht = { handy: string | null; desktop: string | null };
export type NachweisRoute = { route: string; vorher: Ansicht; nachher: Ansicht };
export type Nachweis = { zeitpunkt: string; routen: NachweisRoute[]; clip: string | null; dateien: { datei: string; was: string | null }[]; diff: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const https = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\//i.test(s) ? s : null;
};
const ansicht = (v: unknown): Ansicht => ({ handy: https(obj(v)?.handy), desktop: https(obj(v)?.desktop) });

/** Jüngster Nachweis dieser Aufgabe (oder null). Routen ohne ein einziges Bild fallen weg. */
export function parseNachweis(raw: unknown, issue: string): Nachweis | null {
  if (!Array.isArray(raw)) return null;
  const alle = raw.flatMap((r): Nachweis[] => {
    const zeile = obj(r);
    let p: unknown = zeile?.payload;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        return [];
      }
    }
    const roh = obj(p);
    const zeitpunkt = str(roh?.zeitpunkt) ?? str(zeile?.created_at);
    if (!roh || roh.art !== "nachweis" || !zeitpunkt || Number.isNaN(Date.parse(zeitpunkt))) return [];
    if ((str(roh.issue) ?? str(zeile?.issue)) !== issue) return [];
    const routen = (Array.isArray(roh.routen) ? roh.routen : []).flatMap((x): NachweisRoute[] => {
      const o = obj(x);
      const route = str(o?.route);
      if (!o || !route) return [];
      const n: NachweisRoute = { route, vorher: ansicht(o.vorher), nachher: ansicht(o.nachher) };
      return [n.vorher, n.nachher].some((a) => a.handy || a.desktop) ? [n] : [];
    });
    const dateien = (Array.isArray(roh.dateien) ? roh.dateien : []).flatMap((x) => {
      const datei = str(obj(x)?.datei);
      return datei ? [{ datei, was: str(obj(x)?.was) }] : [];
    });
    return [{ zeitpunkt, routen, clip: https(roh.clip), dateien, diff: str(roh.diff) }];
  });
  return alle.sort((a, b) => Date.parse(a.zeitpunkt) - Date.parse(b.zeitpunkt)).at(-1) ?? null;
}
