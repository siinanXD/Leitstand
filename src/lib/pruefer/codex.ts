// Native Codex-Prüfung (SIN-1053). Kein Modellaufruf; Quelle und Bindungen werden vor dem Ergebnis geprüft.
import { createHash } from "node:crypto";
import { leseAntwort, type Ergebnis } from "./pruefer";

export type Pruefstand = { head: string; basis: string; auftrag: string };
export type NativeReview = { id: number; body: string | null; commit_id: string | null; submitted_at: string | null; user: { login: string; type: string } | null; state?: string };
export type Anforderung = Pruefstand & { erstellt: string };
type ReviewErgebnis = { status: "wartend"; grund: string } | { status: "fertig"; ergebnis: Ergebnis; review: number };
const warte = (grund: string): ReviewErgebnis => ({ status: "wartend", grund });

/** Genau ein syntaktisch gültiger Marker; widersprüchliche oder abgeschnittene Antworten bleiben unbrauchbar. */
function leseMarker(body: string, name: string): Record<string, unknown> | null {
  const marker = [...body.matchAll(new RegExp(`<!-- ${name} ([\\s\\S]*?) -->`, "g"))];
  if (marker.length !== 1) return null;
  try {
    const wert = JSON.parse(marker[0][1]);
    return wert && typeof wert === "object" && !Array.isArray(wert) ? wert : null;
  } catch { return null; }
}

/** Nur der native GitHub-App-Bot kann einen Codex-Review liefern; PR-Texte und Owner-Kommentare zählen nicht. */
export function istCodexBot(user: NativeReview["user"]): boolean {
  return user?.login === "chatgpt-codex-connector[bot]" && user.type === "Bot";
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return wert !== null && typeof wert === "object" && !Array.isArray(wert);
}

function istKriterienHaken(wert: unknown): boolean {
  if (!istObjekt(wert)) return false;
  return typeof wert.text === "string" && !!wert.text.trim() && typeof wert.belegt === "boolean" && typeof wert.beleg === "string" && (!wert.belegt || !!wert.beleg.trim());
}

function istKriterienFund(wert: unknown): boolean {
  if (!istObjekt(wert)) return false;
  return typeof wert.datei === "string" && !!wert.datei.trim() && Number.isInteger(wert.zeile) && Number(wert.zeile) >= 0 && ["hoch", "mittel", "niedrig"].includes(String(wert.schwere)) && typeof wert.text === "string" && !!wert.text.trim() && ["codefehler", "sicherheit", "nachweis"].includes(String(wert.art)) && (wert.haken === null || typeof wert.haken === "string");
}

function istKriterienErgebnis(wert: unknown): boolean {
  if (!istObjekt(wert) || typeof wert.bestanden !== "boolean" || !Array.isArray(wert.funde) || !Array.isArray(wert.haken)) return false;
  return wert.funde.every(istKriterienFund) && wert.haken.every(istKriterienHaken);
}

function leseKriterien(body: string, stand: Pruefstand): Ergebnis | null {
  const daten = leseMarker(body, "codex-kriterien:v1");
  if (!daten || daten.head !== stand.head || daten.basis !== stand.basis || daten.auftrag !== stand.auftrag || !istKriterienErgebnis(daten.ergebnis)) return null;
  try { return leseAntwort(JSON.stringify(daten.ergebnis)); }
  catch { return null; }
}

/** Neuester authentischer Review nach dem gebundenen Auftrag; fremde oder veraltete Antworten sind kein Freigabebeleg. */
export function leseCodexReview(reviews: NativeReview[], stand: Pruefstand, angefordert: string): ReviewErgebnis {
  const seit = Date.parse(angefordert);
  if (!Number.isFinite(seit)) return warte("Anforderungszeit ungültig");
  const antworten = reviews.filter(r => istCodexBot(r.user) && (r.commit_id === null || r.commit_id === stand.head) && Date.parse(r.submitted_at ?? "") >= seit);
  if (antworten.some(r => r.state === "DISMISSED")) return warte("Nativer Review wurde verworfen");
  const review = antworten.filter(r => r.body?.includes("<!-- codex-review-state:v1 "))
    .sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!) || b.id - a.id)[0];
  if (!review) return warte("Aktueller nativer Codex-Review fehlt");
  const daten = leseMarker(review.body ?? "", "codex-review-state:v1");
  const code = daten?.code_review as Record<string, unknown> | undefined;
  if (!code || code.commit_sha !== stand.head || code.status !== "completed" || typeof code.has_any_findings !== "boolean" || typeof code.has_unresolved_findings !== "boolean") return warte("Nativer Review unvollständig oder nicht abgeschlossen");
  if (code.has_unresolved_findings) return { status: "fertig", review: review.id, ergebnis: { bestanden: false, funde: [{ datei: "(Codex-Review)", zeile: 0, schwere: "hoch", art: "codefehler", text: "Ungelöste native Codex-Funde; Review im PR bearbeiten." }], haken: [] } };
  const kriterien = antworten.filter(r => r.body?.includes("<!-- codex-kriterien:v1 "))
    .sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!) || b.id - a.id)[0];
  const ergebnis = kriterien ? leseKriterien(kriterien.body ?? "", stand) : null;
  return ergebnis ? { status: "fertig", review: review.id, ergebnis } : warte("Aktuelle unabhängige Kriterienbelege fehlen");
}

/** Vertrauensprüfung des Autors erfolgt im Adapter; nur exakt gebundene Requests werden als erledigter Anstoß gelesen. */
export function leseCodexAnforderung(body: string, erstellt: string): Anforderung | null {
  const daten = leseMarker(body, "codex-anforderung:v1");
  if (!daten || !/^[a-f0-9]{40}$/.test(String(daten.head)) || !/^[a-f0-9]{40}$/.test(String(daten.basis)) || !/^[a-f0-9]{16}$/.test(String(daten.auftrag)) || !Number.isFinite(Date.parse(erstellt))) return null;
  return { head: daten.head as string, basis: daten.basis as string, auftrag: daten.auftrag as string, erstellt };
}

/** Höchstens ein nativer Anstoß je Head; Timeout, Limit oder geänderter Auftrag führt niemals zu einem Modell-API-Rückfall. */
export function planeCodexAnstoss(stand: Pruefstand, anforderungen: Anforderung[], heute: number, deckel: number, jetzt: Date): { status: "anfordern" | "wartend" | "blockiert"; grund: string; erstellt?: string } {
  const alt = anforderungen.filter(a => a.head === stand.head).sort((a, b) => Date.parse(b.erstellt) - Date.parse(a.erstellt))[0];
  if (alt) {
    if (alt.basis !== stand.basis || alt.auftrag !== stand.auftrag) return { status: "blockiert", grund: "Basis oder Auftrag nach nativem Review-Anstoß geändert; gezielte neue Prüfung erforderlich" };
    return jetzt.getTime() - Date.parse(alt.erstellt) >= 15 * 60_000
      ? { status: "blockiert", grund: "Nativer Review seit mindestens 15 Minuten offen; kein automatischer Neustart", erstellt: alt.erstellt }
      : { status: "wartend", grund: "Nativer Review angefordert", erstellt: alt.erstellt };
  }
  if (!Number.isSafeInteger(deckel) || deckel < 1 || !Number.isSafeInteger(heute) || heute < 0 || heute >= deckel) return { status: "blockiert", grund: "Tagesdeckel für native Codex-Reviews erreicht oder ungültig" };
  return { status: "anfordern", grund: "Aktuellen nativen Review einmalig anfordern" };
}

/** Öffentliches Anstoßformat enthält nur Bindungen und den technischen Ergebnisvertrag, keinen privaten Linear-Auftrag. */
export function codexAnforderungsText(stand: Pruefstand): string {
  return `@codex review\n\n<!-- codex-anforderung:v1 ${JSON.stringify(stand)} -->\n\nPrüfe den aktuellen PR unabhängig. Code-Review und Fertigkriterien sind getrennte Nachweise. Für Kriterien den aktuellen Auftrag über die verbundene Linear-Anbindung lesen; keine privaten Auftragstexte veröffentlichen. Ein optionaler maschinenlesbarer Kriterienbeleg hat das Format <!-- codex-kriterien:v1 {"head":"${stand.head}","basis":"${stand.basis}","auftrag":"${stand.auftrag}","ergebnis":{"bestanden":true,"funde":[],"haken":[{"text":"exakter Auftragshaken","belegt":true,"beleg":"Datei:Zeile oder Test"}]}} -->. Nur tatsächlich geprüfte Kriterien belegen; fehlender Zugang oder fehlende Kriterien bleiben offen.`;
}

/** Fingerprint der tatsächlich gelesenen authentischen Antworten; Publikationszeiten sind keine konsumierten Antworten. */
export function codexAntwortHash(antworten: NativeReview[]): string {
  const versionen = antworten.filter(a => istCodexBot(a.user)).map(a => JSON.stringify([a.id, a.commit_id, a.submitted_at, a.state ?? null, a.body])).sort();
  return createHash("sha256").update(JSON.stringify(versionen)).digest("hex");
}
