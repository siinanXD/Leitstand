/** SIN-911: Öffentliche GitHub-Texte (PR-Beschreibung) bleiben knapp. Rein, ohne Netz; Warnung, kein Abbruch. */

const VERBOTEN: { name: string; muster: RegExp }[] = [
  { name: "Geldbetrag (€)", muster: /€|\bEUR\b/ },
  { name: "Geldbetrag ($)", muster: /\$\d|\d\$|\$ / },
  { name: "Wunsch einer Person", muster: /\bWunsch\b/i },
  { name: "Sinan-Zitat", muster: /\bSinan:/ },
  { name: "Supabase-Projekt-ID", muster: /\b[a-z]{20}\.supabase\.co\b/i },
];

/** Namen der Treffer aus der Verbotsliste; leer = sauber. */
export const pruefePrText = (text: string | null | undefined): string[] => {
  const t = String(text ?? "");
  return VERBOTEN.filter((v) => v.muster.test(t)).map((v) => v.name);
};
