// Freigabe von Werbemitteln (SIN-487). Rein: Speicher kommt als Parameter herein, damit Statuswechsel testbar bleiben.

export const ARTEN = ["tutorial_video", "werbeclip", "text_linkedin", "text_website", "text_email"] as const;
export type Art = (typeof ARTEN)[number];
export const istArt = (v: unknown): v is Art => typeof v === "string" && (ARTEN as readonly string[]).includes(v);

export const ARTEN_NAME: Record<Art, string> = {
  tutorial_video: "Tutorial-Video",
  werbeclip: "Werbeclip",
  text_linkedin: "Text · LinkedIn",
  text_website: "Text · Website",
  text_email: "Text · E-Mail",
};

export const istVideo = (art: Art): boolean => art === "tutorial_video" || art === "werbeclip";

export type Werbemittel = {
  id: string;
  produkt: string;
  art: Art;
  textInhalt: string | null;
  /** Signierte URL, nur serverseitig erzeugt. */
  videoUrl: string | null;
  dauerSekunden: number | null;
  kostenEur: number | null;
  modell: string | null;
  mitKi: boolean;
  mitTon: boolean;
  kiKennzeichnung: string | null;
  quelleUrl: string | null;
  runUrl: string | null;
  erstelltAm: string;
};

export const MAX_GRUND = 1000;

export type Aktion = { aktion: "freigeben" } | { aktion: "ablehnen"; grund: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Prüft die Eingabe der API. Ablehnen braucht einen nicht leeren Grund. */
export function leseEingabe(body: unknown): { id: string; aktion: Aktion } | null {
  const e = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!istId(e.id)) return null;
  if (e.aktion === "freigeben") return { id: e.id, aktion: { aktion: "freigeben" } };
  if (e.aktion === "ablehnen" && typeof e.grund === "string") {
    const grund = e.grund.trim();
    if (grund.length > 0 && grund.length <= MAX_GRUND) return { id: e.id, aktion: { aktion: "ablehnen", grund } };
  }
  return null;
}

export type Aenderung = { status: "freigegeben"; freigegeben_at: string } | { status: "abgelehnt"; ablehnungsgrund: string };

/** Speicher: setzt nur, wenn der Status noch `von` ist (atomar). Gibt zurück, ob eine Zeile geändert wurde. */
export type Speicher = {
  setze(id: string, von: "wartet_auf_freigabe", aenderung: Aenderung): Promise<boolean>;
};

export type Ergebnis = { ok: true; status: "freigegeben" | "abgelehnt" } | { ok: false; grund: "nicht-wartend" | "speicher" };

/** Erlaubter Wechsel nur aus `wartet_auf_freigabe`. Veröffentlichen ist ein eigener späterer Schritt. */
export async function entscheide(speicher: Speicher, id: string, a: Aktion, jetzt: Date = new Date()): Promise<Ergebnis> {
  try {
    const aenderung: Aenderung = a.aktion === "freigeben" ? { status: "freigegeben", freigegeben_at: jetzt.toISOString() } : { status: "abgelehnt", ablehnungsgrund: a.grund };
    const geaendert = await speicher.setze(id, "wartet_auf_freigabe", aenderung);
    return geaendert ? { ok: true, status: aenderung.status } : { ok: false, grund: "nicht-wartend" };
  } catch {
    return { ok: false, grund: "speicher" };
  }
}

/** Zeile für `loop_events`; Schlüssel wie bei der PR-Freigabe. */
export function protokollZeile(ergebnis: Ergebnis) {
  const step = ergebnis.ok && ergebnis.status === "abgelehnt" ? "werbemittel-ablehnung" : "werbemittel-freigabe";
  return { project: "leitstand", step, status: ergebnis.ok ? "ok" : "fehler", issue: null, pr: null };
}
