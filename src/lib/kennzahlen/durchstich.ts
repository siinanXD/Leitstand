// Kennzahl „Durchstich“ (SIN-897). Rein, ohne Netz. Ein Issue zählt, wenn es am Tag auf Done ging, Sinan nicht eingegriffen hat
// und jeder Schritt von worker start bis abnahme ok in loop_events belegt ist. Fehlt ein Beleg, zählt es nie als Durchstich.
import { berlinerTag } from "../berlin";

export const HAENGT_NACH_MS = 2 * 3_600_000;
/** Labels im Verlauf, die einen Eingriff bedeuten. */
export const EINGRIFF_LABELS = ["freigegeben", "sinan", "needs-human"] as const;
/** Merge durch `automerge.yml`: erkannt am Vermerk im Squash-Commit (Bot und Sinan teilen sich das GitHub-Konto). */
export const AUTO_MERGE = "automerge";
export const AUTO_MERGE_VERMERK = "Auto-Merge: automerge.yml";

export type Ereignis = { created_at: string; step: string | null; status: string | null; issue: string | null; pr: number | null; grund?: string | null };
/** Ein Linear-Issue mit Verlauf: alle Labels, die es je trug, und die Kommentare (Autor, Zeit). */
export type VerlaufIssue = {
  kennung: string;
  status: "done" | "started" | "other";
  gestartetAm: string | null;
  doneAm: string | null;
  labelsImVerlauf: readonly string[];
  kommentare: readonly { autor: string; am: string }[];
  /** GitHub-Login, der den PR gemergt hat; null, wenn unbekannt (kein PR-Anhang, kein Token, GitHub-Fehler). Bei Done ohne Autor nie Durchstich. */
  mergeVon: string | null;
  /** false, wenn Verlauf oder Kommentare nicht vollständig gelesen wurden; dann gilt das Issue nie als Durchstich. */
  verlaufVollstaendig?: boolean;
};
export type Eingriff = { kennung: string; eingriffe: string[] };
export type Haengt = { kennung: string; seitMin: number; grund: string | null };
export type Durchstich = { tag: string; durchstich: string[]; mit_eingriff: Eingriff[]; haengt: Haengt[]; ohne_beleg: { kennung: string; fehlt: string[] }[]; quote: number | null };

const ms = (iso: string) => Date.parse(iso);
const ok = (e: Ereignis) => e.status === "ok";

/** Welche Eingriffe von Sinan gab es? Leer heißt: keiner. `sinan` sind Linear-Name und GitHub-Login (Groß-/Kleinschreibung egal). */
export function eingriffe(i: VerlaufIssue, sinan: readonly string[]): string[] {
  const namen = sinan.map((s) => s.toLowerCase());
  const r = EINGRIFF_LABELS.filter((l) => i.labelsImVerlauf.includes(l)).map((l) => `Label ${l}`);
  if (i.verlaufVollstaendig === false) r.push("Verlauf unvollständig gelesen");
  // Nur der Auto-Merge ist kein Eingriff; jeder andere bekannte Merge-Autor ist einer (Sinan oder fremd).
  if (i.mergeVon && i.mergeVon !== AUTO_MERGE) r.push(namen.includes(i.mergeVon.toLowerCase()) ? "Merge durch Sinan" : `Merge durch ${i.mergeVon}`);
  const start = i.gestartetAm ? ms(i.gestartetAm) : -Infinity;
  if (i.kommentare.some((k) => namen.includes(k.autor.toLowerCase()) && ms(k.am) > start)) r.push("Kommentar von Sinan");
  return r;
}

/** Fehlende Schritte der Kette; alle Nachweise müssen zeitlich aufeinander folgen und zum selben PR gehören. */
export function fehlendeBelege(kennung: string, ereignisse: readonly Ereignis[]): string[] {
  const eigene = ereignisse.filter((e) => e.issue === kennung);
  const start = eigene.filter((e) => e.step === "worker" && e.status === "start").sort((a, b) => ms(a.created_at) - ms(b.created_at))[0];
  if (!start) return ["worker start"];
  const workerOk = eigene.filter((e) => e.step === "worker" && ok(e) && e.pr != null && ms(e.created_at) > ms(start.created_at)).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  if (workerOk.length === 0) return ["worker ok (PR)"];
  // Prüfe jeden PR-Kandidaten vollständig. Ereignisse vor dem vorherigen Schritt zählen nicht.
  const genau = new RegExp("(^|[^\\w-])" + kennung + "(?![\\w])");
  const kandidaten = workerOk.map((worker) => {
    const nach = (step: string, ab: Ereignis) => ereignisse.filter((e) => e.step === step && ok(e) && e.pr === worker.pr && ms(e.created_at) > ms(ab.created_at)).sort((a, b) => ms(a.created_at) - ms(b.created_at))[0];
    const pruefer = nach("pruefer", worker);
    if (!pruefer) return ["pruefer ok"];
    const merge = nach("merge", pruefer);
    if (!merge) return ["merge"];
    const deploy = nach("deploy", merge);
    if (!deploy) return ["deploy"];
    const abnahme = ereignisse.filter((e) => e.step === "abnahme" && ok(e) && !!e.issue && genau.test(e.issue) && ms(e.created_at) > ms(deploy.created_at)).sort((a, b) => ms(a.created_at) - ms(b.created_at))[0];
    if (!abnahme) return ["abnahme ok"];
    return [];
  });
  if (kandidaten.some((fehlt) => fehlt.length === 0)) return [];
  // Berichte den PR, der am weitesten durch die Kette gekommen ist.
  return kandidaten.sort((a, b) => a.length - b.length)[0];
}

export function durchstich(issues: readonly VerlaufIssue[], ereignisse: readonly Ereignis[], sinan: readonly string[], jetzt: Date): Durchstich {
  const tag = berlinerTag(jetzt);
  const heuteFertig = issues.filter((i) => i.status === "done" && i.doneAm && berlinerTag(new Date(i.doneAm)) === tag);
  const out: Durchstich = { tag, durchstich: [], mit_eingriff: [], haengt: [], ohne_beleg: [], quote: null };
  for (const i of heuteFertig) {
    const e = eingriffe(i, sinan);
    if (e.length) {
      out.mit_eingriff.push({ kennung: i.kennung, eingriffe: e });
      continue;
    }
    // Unbekannter Merge-Autor: nicht geprüft, ob Sinan gemergt hat → kein Durchstich, sondern „ohne Beleg“.
    const fehlt = [...(i.mergeVon ? [] : ["merge-autor"]), ...fehlendeBelege(i.kennung, ereignisse)];
    if (fehlt.length) out.ohne_beleg.push({ kennung: i.kennung, fehlt });
    else out.durchstich.push(i.kennung);
  }
  for (const i of issues) {
    const seit = i.status === "started" && i.gestartetAm ? jetzt.getTime() - ms(i.gestartetAm) : 0;
    if (seit <= HAENGT_NACH_MS) continue;
    const letzter = ereignisse.filter((e) => e.issue === i.kennung && e.grund).sort((a, b) => ms(b.created_at) - ms(a.created_at))[0];
    out.haengt.push({ kennung: i.kennung, seitMin: Math.floor(seit / 60_000), grund: letzter?.grund ?? null });
  }
  out.quote = heuteFertig.length ? out.durchstich.length / heuteFertig.length : null;
  return out;
}
