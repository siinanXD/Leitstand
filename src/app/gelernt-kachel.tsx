"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { SCHRITT, leseKachel, wertName, wertText } from "@/lib/lernen/schleife";

const ERGEBNIS = { behalten: "behalten", verworfen: "verworfen", offen: "noch nicht messbar" } as const;

/** Kachel „Gelernt diese Woche“ (SIN-576): Messwert, Änderung und Ergebnis der Vorwoche aus dem letzten Lauf der Selbstlern-Schleife in `loop_events`. */
export function GelerntKachel({ angemeldet }: { angemeldet: boolean }) {
  const [k, setK] = useState<ReturnType<typeof leseKachel> | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("loop_events").select("payload").eq("step", SCHRITT).order("created_at", { ascending: false }).limit(1)).then(({ data, error }) => {
      if (offen) setK(error ? null : leseKachel((data?.[0] as { payload?: unknown } | undefined)?.payload));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return (
    <section className="tile einfach-block" aria-labelledby="gelernt">
      <div className="kopf-block">
        <h2 id="gelernt" className="mono-label">
          Gelernt diese Woche
        </h2>
        <p className="leer">Der Loop misst sich montags, ändert höchstens eine Regel und prüft in der Woche darauf, ob es half.</p>
      </div>
      {k === undefined ? (
        <p className="summe">
          <span className="mono">Wird geladen …</span>
        </p>
      ) : k === null ? (
        <p className="summe">
          <span className="mono">Noch kein Lauf</span>
        </p>
      ) : (
        <>
          <p className="summe">
            <span className="mono">{k.kw}</span> · {k.messwert ? `${wertName(k.messwert.wert)} (${k.messwert.produkt}): ${wertText(k.messwert.wert, k.messwert.jetzt)}` : "kein Wert unter dem Ziel"}
          </p>
          <p className="summe">{k.aenderung ? `Änderung: ${k.aenderung}` : "Keine Änderung diese Woche"}</p>
          <p className="summe">{k.vorwoche ? `Vorwoche (${wertName(k.vorwoche.wert)}): ${ERGEBNIS[k.vorwoche.ergebnis]}` : "Vorwoche: nichts zu prüfen"}</p>
        </>
      )}
    </section>
  );
}
