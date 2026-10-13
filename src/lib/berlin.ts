// Berliner Kalendertag (JJJJ-MM-TT). Ein Formatierer für alle: toLocaleDateString je Aufruf war bei 1.500 Ereignissen pro Render zu langsam (Befund 13.10.).
const FORMAT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
export const berlinerTag = (d: Date): string => FORMAT.format(d);
