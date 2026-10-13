/**
 * Ergebnis einer Abfrage `ttlMs` lang merken (SIN-544: Langfuse antwortete mit HTTP 429).
 * Schlägt der Abruf fehl (null), gilt weiter der letzte gute Wert, solange er nicht älter als `maxAlterMs` ist.
 * shortcut: Speicher je Serverinstanz, nicht geteilt; bei vielen Instanzen in Supabase ablegen.
 */
export function mitCache<T>(abruf: () => Promise<T | null>, ttlMs: number, maxAlterMs: number, jetzt: () => number = Date.now): () => Promise<T | null> {
  let letzter: { wert: T; um: number } | null = null;
  let letzterVersuch = -Infinity;
  let laufend: Promise<T | null> | null = null;
  return () => {
    if (laufend) return laufend;
    const t = jetzt();
    if (letzter && t - letzter.um < ttlMs) return Promise.resolve(letzter.wert);
    // Nach einem Fehlschlag nicht sofort erneut fragen: sonst verlängert jeder Seitenaufruf die Sperre des Dienstes.
    if (t - letzterVersuch < ttlMs) return Promise.resolve(letzter && t - letzter.um < maxAlterMs ? letzter.wert : null);
    letzterVersuch = t;
    laufend ??= abruf()
      .catch(() => null)
      .then((wert) => {
        if (wert !== null) letzter = { wert, um: jetzt() };
        laufend = null;
        return wert ?? (letzter && jetzt() - letzter.um < maxAlterMs ? letzter.wert : null);
      });
    return laufend;
  };
}
