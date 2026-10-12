import { createHmac, randomInt } from "node:crypto";

export const CODE_GUELTIG_MS = 10 * 60_000;
export const SPERRFENSTER_MS = 10 * 60_000;
export const MAX_FEHLER = 5;

/** Speicher für Kopplungscodes (Service-Role, Tabellen `public.leitstand_kopplung*`); für Tests ersetzbar. */
export type Speicher = {
  /** Legt den Code an; false, wenn der Hash schon belegt ist. */
  anlegen(zeile: { codeHash: string; tokenHash: string; ablauf: Date }): Promise<boolean>;
  /** Löscht den Code und gibt seinen `token_hash` zurück, sofern er existiert und nicht abgelaufen ist (atomar: einmal nutzbar). */
  einloesen(codeHash: string, jetzt: Date): Promise<string | null>;
  /** Zählt einen Versuch mit; `anzahl` umfasst ihn und alle Versuche im Sperrfenster. `zurueck` nimmt ihn nach Erfolg wieder heraus. */
  versuch(jetzt: Date): Promise<{ anzahl: number; zurueck(): Promise<void> }>;
  /** Entfernt abgelaufene Codes und alte Versuche. */
  aufraeumen(jetzt: Date): Promise<void>;
};

/** 6 Ziffern, kryptografisch zufällig. */
export function zufallsCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Gespeichert wird nur dieser Hash (HMAC mit serverseitigem Geheimnis), nie der Code. */
export function codeHash(code: string, geheimnis: string): string {
  return createHmac("sha256", geheimnis).update(code).digest("hex");
}

/** Code aus der Eingabe (Leerzeichen erlaubt); null, wenn es keine 6 Ziffern sind. */
export function normalisiereCode(eingabe: unknown): string | null {
  if (typeof eingabe !== "string") return null;
  const code = eingabe.replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Neuen Kopplungscode zu einem `hashed_token` anlegen. Null, wenn nach mehreren Zufallsversuchen kein freier Code gefunden wurde. */
export async function erzeugeKopplung(
  speicher: Speicher,
  tokenHash: string,
  geheimnis: string,
  jetzt: Date = new Date(),
  zufall: () => string = zufallsCode,
): Promise<{ code: string; gueltigBis: Date } | null> {
  await speicher.aufraeumen(jetzt);
  const ablauf = new Date(jetzt.getTime() + CODE_GUELTIG_MS);
  for (let i = 0; i < 5; i++) {
    const code = zufall();
    if (await speicher.anlegen({ codeHash: codeHash(code, geheimnis), tokenHash, ablauf })) return { code, gueltigBis: ablauf };
  }
  return null;
}

export type Einloesung = { ok: true; tokenHash: string } | { ok: false; grund: "format" | "gesperrt" | "ungueltig" };

/**
 * Code gegen `token_hash` tauschen. Der Versuch wird vor der Prüfung gezählt, damit parallele Anfragen die Sperre nicht umgehen;
 * nach mehr als `MAX_FEHLER` Versuchen im Fenster ist gesperrt (auch ein richtiger Code hilft dann nicht).
 */
export async function loeseKopplungEin(speicher: Speicher, eingabe: unknown, geheimnis: string, jetzt: Date = new Date()): Promise<Einloesung> {
  const code = normalisiereCode(eingabe);
  if (!code) return { ok: false, grund: "format" };
  const versuch = await speicher.versuch(jetzt);
  if (versuch.anzahl > MAX_FEHLER) return { ok: false, grund: "gesperrt" };
  const tokenHash = await speicher.einloesen(codeHash(code, geheimnis), jetzt);
  if (!tokenHash) return { ok: false, grund: "ungueltig" };
  await versuch.zurueck();
  return { ok: true, tokenHash };
}

/** Zeile für `loop_events`; Schlüssel wie in `scripts/loop/loop.ts`. */
export function kopplungsZeile(status: "ok" | "fehler" | "gesperrt") {
  return { project: "leitstand", step: "kopplung", status, issue: null, pr: null };
}
