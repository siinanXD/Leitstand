"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { STATION_NAME, zeile, type E2eKennzahl } from "@/lib/e2e/strecke";

type Zeile = { e2e: (E2eKennzahl & { stand?: string }) | null };

/** Eine Zeile „Ende-zu-Ende: 9 von 12 live …“ (SIN-1054) mit den hängenden Issues zum Aufklappen. Nur die Zeile `leitstand` aus loop_snapshot. */
export function E2eKachel({ angemeldet }: { angemeldet: boolean }) {
  const [daten, setDaten] = useState<Zeile | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("loop_snapshot").select("e2e").eq("project", "leitstand").maybeSingle()).then(({ data, error }) => {
      if (offen) setDaten(error ? null : ((data as Zeile | null) ?? null));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  const k = daten?.e2e ?? null;
  return (
    <details className="tile einfach-block">
      <summary>
        <span className="mono-label">{daten === undefined ? "Ende-zu-Ende …" : daten === null ? "Ende-zu-Ende: nicht lesbar" : k ? zeile(k) : "Ende-zu-Ende: noch keine Zahl"}</span>
      </summary>
      {k && (k.haengt.length > 0 ? <p className="leer">Hängt: {k.haengt.map((h) => `${h.kennung} bei ${STATION_NAME[h.station]}`).join("; ")}</p> : <p>Kein Issue hängt.</p>)}
    </details>
  );
}
