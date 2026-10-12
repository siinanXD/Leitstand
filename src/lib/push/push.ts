/** Ein Push-Abo des Browsers (PushSubscription.toJSON). */
export type Abo = { endpoint: string; p256dh: string; auth: string };

export type Nachricht = { titel: string; text: string; url: string };

export type Speicher = {
  speichern(abo: Abo): Promise<void>;
  loeschen(endpoint: string): Promise<void>;
  alle(): Promise<Abo[]>;
};

/** Sendet eine Nachricht an ein Abo und gibt den HTTP-Status des Push-Dienstes zurück. */
export type Sender = (abo: Abo, nachricht: Nachricht) => Promise<number>;

export type Ergebnis = { gesendet: number; entfernt: number; fehler: number };

const text = (wert: unknown, max: number): string | null => (typeof wert === "string" && wert.length > 0 && wert.length <= max ? wert : null);

/** Prüft ein Abo aus dem Request: HTTPS-Endpunkt und beide Schlüssel müssen da sein. */
export function parseAbo(roh: unknown): Abo | null {
  if (!roh || typeof roh !== "object") return null;
  const r = roh as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };
  const endpoint = text(r.endpoint, 2048);
  const p256dh = text(r.keys?.p256dh, 256);
  const auth = text(r.keys?.auth, 64);
  if (!endpoint || !p256dh || !auth) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

/** Nur Pfade der eigenen Seite; alles andere fällt auf die Übersicht zurück (Tippen öffnet nie fremde Adressen). */
export function sichereUrl(url: unknown): string {
  return typeof url === "string" && /^\/(?![/\\])/.test(url) ? url : "/";
}

/** Der Push-Dienst meldet 404 oder 410, wenn das Abo nicht mehr gilt. */
export const istAbgelaufen = (status: number): boolean => status === 404 || status === 410;

export async function speichereAbo(speicher: Speicher, roh: unknown): Promise<boolean> {
  const abo = parseAbo(roh);
  if (!abo) return false;
  await speicher.speichern(abo);
  return true;
}

/** An alle Abos senden. Abgelaufene Abos werden gelöscht, andere Fehler gezählt (das Abo bleibt). */
export async function sendeAnAlle(speicher: Speicher, sender: Sender, nachricht: Nachricht): Promise<Ergebnis> {
  const ergebnis: Ergebnis = { gesendet: 0, entfernt: 0, fehler: 0 };
  const sicher = { ...nachricht, url: sichereUrl(nachricht.url) };
  for (const abo of await speicher.alle()) {
    let status: number;
    try {
      status = await sender(abo, sicher);
    } catch {
      ergebnis.fehler++;
      continue;
    }
    if (istAbgelaufen(status)) {
      await speicher.loeschen(abo.endpoint);
      ergebnis.entfernt++;
    } else if (status >= 200 && status < 300) ergebnis.gesendet++;
    else ergebnis.fehler++;
  }
  return ergebnis;
}

export const TESTNACHRICHT: Nachricht = { titel: "Leitstand", text: "Testmitteilung: Mitteilungen funktionieren.", url: "/" };
