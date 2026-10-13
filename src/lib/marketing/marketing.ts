// Marketing-Agent (SIN-550): reine Logik. Prompt bauen, Modellantwort prüfen, Zeilen für `werbemittel` bilden. Kein Netz.
// `scripts/marketing/marketing.ts` holt die Eingaben und schreibt. Jede Ausgabe startet als `wartet_auf_freigabe`; gepostet oder geschaltet wird nichts.

export const SCHRITT = "marketing";
export const PLATTFORMEN = ["google", "meta", "linkedin"] as const;
export type Plattform = (typeof PLATTFORMEN)[number];

export type Kennzahlen = { besuche: number; demoAnfragen: number; abbrueche: number };
export type Eingabe = { produkt: string; beschreibung: string; kennzahlen: Kennzahlen | null; vorherige: string[]; konkurrenz: string[] };

export type Anzeige = { plattform: Plattform; ueberschrift: string; text: string; zielgruppe: string; budgetEurProWoche: number };
export type Ausgaben = {
  landingPage: { titel: string; text: string };
  anzeigen: Anzeige[];
  leadMagnet: { titel: string; text: string };
  clipAuftrag: { prompt: string; dauerSekunden: number };
  metricoolEntwurf: { text: string };
};

const MAX_TEXT = 4000;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 && v.length <= MAX_TEXT ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Zahlen kommen nur in den Prompt, wenn sie gemessen sind (kein Raten bei fehlenden Kennzahlen). */
export function promptFuer(e: Eingabe): string {
  const k = e.kennzahlen ? `Besuche ${e.kennzahlen.besuche}, Demo-Anfragen ${e.kennzahlen.demoAnfragen}, Abbrüche ${e.kennzahlen.abbrueche}` : "keine Kennzahlen verfügbar, nenne keine Zahlen";
  return [
    `Du bist der Marketing-Agent für „${e.produkt}“ (Bildungsträger, IHK-Ausbildung, Mittelstand). Antworte nur mit JSON.`,
    `Produkt: ${e.beschreibung}`,
    `Kennzahlen letzte 7 Tage: ${k}`,
    `Bisherige Werbemittel (nicht wiederholen): ${e.vorherige.join(" | ") || "keine"}`,
    `Konkurrenz: ${e.konkurrenz.join(" | ") || "keine bekannt"}`,
    "Liefere: landingPage{titel,text}, anzeigen[3 Stück: je google, meta, linkedin; ueberschrift,text,zielgruppe,budgetEurProWoche], leadMagnet{titel,text}, clipAuftrag{prompt,dauerSekunden}, metricoolEntwurf{text}.",
    "Erfinde keine Belege, Preise oder Kundenzahlen. Kennzeichne Behauptungen, die Sinan prüfen muss, mit „[prüfen]“.",
  ].join("\n");
}

/** Prüft die Modellantwort (Vertrauensgrenze). Null, wenn irgendetwas fehlt: dann wird nichts geschrieben. */
export function leseAusgaben(roh: unknown): Ausgaben | null {
  const o = obj(roh);
  const lp = obj(o.landingPage);
  const lm = obj(o.leadMagnet);
  const clip = obj(o.clipAuftrag);
  const [lpTitel, lpText, lmTitel, lmText] = [text(lp.titel), text(lp.text), text(lm.titel), text(lm.text)];
  const [prompt, dauer, entwurf] = [text(clip.prompt), Number(clip.dauerSekunden), text(obj(o.metricoolEntwurf).text)];
  const liste = Array.isArray(o.anzeigen) ? o.anzeigen : [];
  const anzeigen: Anzeige[] = [];
  for (const plattform of PLATTFORMEN) {
    const a = obj(liste.find((x) => obj(x).plattform === plattform));
    const budget = Number(a.budgetEurProWoche);
    const [ueberschrift, t, zielgruppe] = [text(a.ueberschrift), text(a.text), text(a.zielgruppe)];
    if (!ueberschrift || !t || !zielgruppe || !Number.isFinite(budget) || budget <= 0) return null;
    anzeigen.push({ plattform, ueberschrift, text: t, zielgruppe, budgetEurProWoche: budget });
  }
  if (!lpTitel || !lpText || !lmTitel || !lmText || !prompt || !entwurf) return null;
  if (!Number.isFinite(dauer) || dauer <= 0 || dauer > 60) return null;
  return { landingPage: { titel: lpTitel, text: lpText }, anzeigen, leadMagnet: { titel: lmTitel, text: lmText }, clipAuftrag: { prompt, dauerSekunden: dauer }, metricoolEntwurf: { text: entwurf } };
}

export type WerbemittelZeile = {
  produkt: string;
  art: "landing_page" | "anzeige" | "lead_magnet" | "clip_auftrag" | "metricool_entwurf";
  status: "wartet_auf_freigabe";
  text_inhalt: string;
  modell: string | null;
  mit_ki: true;
  ki_kennzeichnung: string;
  run_url: string | null;
};

const PLATTFORM_NAME: Record<Plattform, string> = { google: "Google", meta: "Meta", linkedin: "LinkedIn" };

/** 7 Zeilen: Landing-Page, 3 Anzeigen, Lead-Magnet, Clip-Auftrag, Metricool-Entwurf. Immer `wartet_auf_freigabe`. */
export function werbemittelZeilen(produkt: string, a: Ausgaben, kontext: { modell?: string | null; runUrl?: string | null } = {}): WerbemittelZeile[] {
  const z = (art: WerbemittelZeile["art"], text_inhalt: string): WerbemittelZeile => ({ produkt, art, status: "wartet_auf_freigabe", text_inhalt, modell: kontext.modell ?? null, mit_ki: true, ki_kennzeichnung: "mit KI erstellt", run_url: kontext.runUrl ?? null });
  return [
    z("landing_page", `${a.landingPage.titel}\n\n${a.landingPage.text}`),
    ...a.anzeigen.map((x) => z("anzeige", `${PLATTFORM_NAME[x.plattform]}\n${x.ueberschrift}\n\n${x.text}\n\nZielgruppe: ${x.zielgruppe}\nBudgetvorschlag: ${x.budgetEurProWoche} € pro Woche`)),
    z("lead_magnet", `${a.leadMagnet.titel}\n\n${a.leadMagnet.text}`),
    z("clip_auftrag", `Clip-Auftrag für werbeclip.yml (${a.clipAuftrag.dauerSekunden} s)\n\n${a.clipAuftrag.prompt}`),
    z("metricool_entwurf", `Entwurf für Metricool (createScheduledPostForReview)\n\n${a.metricoolEntwurf.text}`),
  ];
}

/** Zeile für `loop_events`. */
export const ereignisZeile = (produkt: string, ok: boolean, n: number) => ({ project: "leitstand", step: SCHRITT, status: ok ? "ok" : "fehler", issue: null, pr: null, payload: { produkt, ausgaben: n } });

/** Text der Kachel „Werbung“. */
export const wartenSatz = (n: number): string => (n === 0 ? "Nichts wartet" : n === 1 ? "1 Entwurf wartet" : `${n} Entwürfe warten`);
