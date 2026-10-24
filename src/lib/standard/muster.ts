// Verbotene Muster aus docs/STANDARD.md (SIN-641). Prüfer und Testnutzer suchen damit maschinell.
export type Muster = { id: string; regex: RegExp; grund: string };

export const MUSTER: Muster[] = [
  { id: "platzhalter", regex: /lorem ipsum|\bplatzhalter\b|\bTODO\b|\bTBD\b/i, grund: "Platzhaltertext" },
  { id: "coming-soon", regex: /coming soon|demnächst verfügbar|bald verfügbar/i, grund: "Leeres Versprechen" },
  { id: "ki-floskel", regex: /nahtlos|revolutionär|entdecke\b|tauche ein/i, grund: "KI-Floskel" },
  { id: "emoji-ueberschrift", regex: /^#{1,6}\s*\p{Extended_Pictographic}/mu, grund: "Emoji in Überschrift" },
  { id: "lila-verlauf", regex: /(linear|radial)-gradient\([^)]*(purple|violet|indigo)/i, grund: "Lila-Verlauf" },
  { id: "shadcn-standard", regex: /ui\.shadcn\.com|shadcn\/ui default/i, grund: "Standard-shadcn-Look" },
  { id: "kuerzel-name", regex: /\b(?:const|let|var|function)\s+(?:tmp|temp|foo|bar|baz|data\d|res\d|val\d)\b/, grund: "Namenskürzel statt sprechendem Namen" },
];

export function findeMuster(text: string): { id: string; grund: string }[] {
  return MUSTER.filter((m) => m.regex.test(text)).map(({ id, grund }) => ({ id, grund }));
}
