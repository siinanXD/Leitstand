"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { topGruende, type FehlerEintrag, type GrundZahl } from "@/lib/loop/fehlergrund";

/** Kachel „Häufigste Fehlergründe“ (SIN-617): Top 3 der roten Einträge in `loop_events` der letzten 24 h. */
export function FehlergruendeKachel({ angemeldet }: { angemeldet: boolean }) {
  const [zeilen, setZeilen] = useState<GrundZahl[] | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    const jetzt = new Date();
    const ab = new Date(jetzt.getTime() - 24 * 3_600_000).toISOString();
    void Promise.resolve(client.from("loop_events").select("status,grund,created_at").eq("status", "fehler").gte("created_at", ab).limit(1000)).then(({ data, error }) => {
      if (offen) setZeilen(error ? null : topGruende((data ?? []) as FehlerEintrag[], jetzt));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return (
    <section className="tile einfach-block" aria-labelledby="fehlergruende">
      <div className="kopf-block">
        <h2 id="fehlergruende" className="mono-label">
          Häufigste Fehlergründe (24 h)
        </h2>
      </div>
      {zeilen === undefined ? (
        <p className="summe">
          <span className="mono">Wird geladen …</span>
        </p>
      ) : zeilen === null ? (
        <p className="summe">
          <span className="mono">Nicht lesbar</span>
        </p>
      ) : zeilen.length === 0 ? (
        <p className="summe">
          <span className="mono">Keine Fehler</span>
        </p>
      ) : (
        zeilen.map((z) => (
          <p key={z.kategorie} className="summe">
            <span className="mono">{z.anzahl}×</span> {z.kategorie}
          </p>
        ))
      )}
    </section>
  );
}
