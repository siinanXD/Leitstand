"use client";

import { useEffect, useState } from "react";
import { auswertungSatz, bereicheSumme, merges, zahlen } from "@/lib/auswertung";
import type { BereichZeile } from "@/lib/bereiche";
import { browserClient } from "@/lib/browser-client";
import { REPOS } from "@/lib/freigabe";
import type { Quelle } from "@/lib/uebersicht";
import { Rahmen } from "../rahmen";

const KEINE_DATEN = <p className="leer">Keine Daten</p>;
const REPO_VON_PROJEKT = Object.fromEntries(Object.entries(REPOS).map(([repo, v]) => [v.projekt, repo]));
const MAX_PRS = 20;

/** Bereiche der heutigen Merges je Projekt; Dateien kommen serverseitig über /api/freigabe. */
function useBereiche(quelle: Quelle, jetzt: Date) {
  const heuteMerges = merges(quelle.events, jetzt).slice(0, MAX_PRS);
  const schluessel = heuteMerges.map((m) => `${m.project}#${m.pr}`).join(",");
  const [ergebnis, setErgebnis] = useState<{ schluessel: string; je: Record<string, BereichZeile[]> } | null>(null);

  useEffect(() => {
    if (!schluessel) return;
    let offen = true;
    void (async () => {
      const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
      const listen = await Promise.all(
        heuteMerges.map(async (m) => {
          const repo = REPO_VON_PROJEKT[m.project];
          if (!repo) return null;
          const res = await fetch(`/api/freigabe?repo=${encodeURIComponent(repo)}&pr=${m.pr}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => null);
          return res?.ok ? { projekt: m.project, bereiche: ((await res.json()) as { bereiche: BereichZeile[] }).bereiche } : null;
        }),
      );
      const je: Record<string, BereichZeile[][]> = {};
      for (const l of listen) if (l) (je[l.projekt] ??= []).push(l.bereiche);
      if (offen) setErgebnis({ schluessel, je: Object.fromEntries(Object.entries(je).map(([p, l]) => [p, bereicheSumme(l)])) });
    })();
    return () => {
      offen = false;
    };
    // heuteMerges ergibt sich vollständig aus `schluessel`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);

  return { projekte: [...new Set(heuteMerges.map((m) => m.project))], je: ergebnis?.schluessel === schluessel ? ergebnis.je : null };
}

function Inhalt({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const satz = auswertungSatz(quelle, jetzt);
  const z = zahlen(quelle, jetzt);
  const { projekte, je } = useBereiche(quelle, jetzt);

  return (
    <main className="bento">
      <section className="tile breit" aria-labelledby="heute">
        <h1 id="heute" className="mono-label">
          Auswertung heute
        </h1>
        {satz ? (
          <>
            <p className="satz">{satz.satz}</p>
            {satz.belege.length > 0 && (
              <ul className="liste" aria-label="Belege">
                {satz.belege.map((b) => (
                  <li key={`${b.project}#${b.pr}`}>
                    <span className="mono">
                      {b.project} #{b.pr}
                    </span>
                    {b.selbstBehoben && " · selbst behoben"}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          KEINE_DATEN
        )}
      </section>

      <section className="tile" aria-labelledby="zahlen">
        <h2 id="zahlen" className="mono-label">
          Zahlen
        </h2>
        {!satz ? (
          KEINE_DATEN
        ) : (
          <dl className="zahlen">
            <div>
              <dt>Gemergt</dt>
              <dd className="mono">{z.gemergt}</dd>
            </div>
            <div>
              <dt>Selbst behoben</dt>
              <dd className="mono">{z.selbstBehoben}</dd>
            </div>
            <div>
              <dt>Braucht dich</dt>
              <dd className="mono">{z.brauchtDich}</dd>
            </div>
            {z.claude.map((k) => (
              <div key={k.name}>
                <dt>{k.name} (Schätzung)</dt>
                <dd className="mono">
                  {k.used} / {k.limit}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="tile" aria-labelledby="bereiche">
        <h2 id="bereiche" className="mono-label">
          Bereiche der Merges
        </h2>
        {projekte.length === 0 ? (
          KEINE_DATEN
        ) : (
          <ul className="liste">
            {projekte.map((p) => (
              <li key={p}>
                <strong className="mono">{p}</strong>
                {!je?.[p]?.length ? (
                  <p className="leer">{je ? "Keine Daten" : "Wird geladen …"}</p>
                ) : (
                  <ul className="liste">
                    {je[p].map((b) => (
                      <li key={b.bereich}>
                        {b.bereich} <span className="mono">{b.dateien}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function Auswertung() {
  return <Rahmen aktiv="auswertung">{(quelle, jetzt) => <Inhalt quelle={quelle} jetzt={jetzt} />}</Rahmen>;
}
