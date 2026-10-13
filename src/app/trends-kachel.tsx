"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { SCHRITT, empfehlungName, leseKachel } from "@/lib/trend/trend";

/** Kachel „Trends“ (SIN-575): die drei besten Funde des Trend-Radars mit Empfehlung, nie mehr. Die Zeilen kommen aus dem letzten Wochenlauf in `loop_events`. */
export function TrendsKachel({ angemeldet }: { angemeldet: boolean }) {
  const [funde, setFunde] = useState<ReturnType<typeof leseKachel> | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("loop_events").select("payload").eq("step", SCHRITT).order("created_at", { ascending: false }).limit(1)).then(({ data, error }) => {
      if (offen) setFunde(error ? [] : leseKachel((data?.[0] as { payload?: unknown } | undefined)?.payload));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return (
    <section className="tile einfach-block" aria-labelledby="trends">
      <div className="kopf-block">
        <h2 id="trends" className="mono-label">
          Trends
        </h2>
        <p className="leer">Was gerade durch die Decke geht, geprüft auf Nutzen für deine Produkte. Bewertung ist eine Schätzung.</p>
      </div>
      {funde === undefined ? (
        <p className="summe">
          <span className="mono">Wird geladen …</span>
        </p>
      ) : funde.length === 0 ? (
        <p className="summe">
          <span className="mono">Noch kein Lauf</span>
        </p>
      ) : (
        funde.map((f) => (
          <p key={f.url} className="summe">
            <a className="mono" href={f.url} target="_blank" rel="noreferrer">
              {f.was}
            </a>{" "}
            <span className="mono">
              · {empfehlungName(f.empfehlung)} · {f.betrifft}
            </span>
          </p>
        ))
      )}
    </section>
  );
}
