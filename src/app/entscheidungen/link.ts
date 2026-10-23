/** Nur https-Adressen aus einem Recherche-Eintrag („Name URL · Lizenz …“) werden zum Link; alles andere bleibt Text. */
export function rechercheLink(eintrag: string): string | null {
  return /(?:^|\s)(https:\/\/[^\s·]+)/.exec(eintrag)?.[1] ?? null;
}
