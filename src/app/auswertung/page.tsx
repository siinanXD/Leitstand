"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auswertungSatz, bereicheSumme, merges, zahlen } from "@/lib/auswertung";
import type { BereichZeile } from "@/lib/bereiche";
import { browserClient } from "@/lib/browser-client";
import { REPOS } from "@/lib/freigabe";
import { projektInfo } from "@/lib/projekte";
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

  const anzahl = new Map<string, number>();
  for (const m of heuteMerges) anzahl.set(m.project, (anzahl.get(m.project) ?? 0) + 1);
  return { projekte: [...anzahl.keys()], anzahl, je: ergebnis?.schluessel === schluessel ? ergebnis.je : null };
}

function Inhalt({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const satz = auswertungSatz(quelle, jetzt);
  const z = zahlen(quelle, jetzt);
  const { projekte, anzahl, je } = useBereiche(quelle, jetzt);
  const feld = (name: string, wert: string | number, akzent = false) => (
    <div key={name}>
      <dt className="mono-label">{name}</dt>
      <dd className={`mono${akzent ? " akzent" : ""}`}>{wert}</dd>
    </div>
  );

  return (
    <main className="seite auswertung">
      <header>
        <p className="augenbraue">Tages-Auswertung</p>
        <h1>Auswertung heute</h1>
      </header>

      <section className="satzfeld" aria-labelledby="heute">
        <h2 id="heute" className="mono-label">
          Heute in einem Satz
        </h2>
        {satz ? (
          <>
            <p className="satz">{satz.satz}</p>
            {satz.belege.length > 0 && (
              <ul className="merkmale" aria-label="Belege">
                {satz.belege.map((b) => (
                  <li key={`${b.project}#${b.pr}`} className="mono">
                    #{b.pr}
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

      <section aria-labelledby="zahlen">
        <h2 id="zahlen" className="sr-only">
          Zahlen
        </h2>
        {!satz ? (
          KEINE_DATEN
        ) : (
          <dl className="zahlenfeld">
            {feld("Gemergt", z.gemergt)}
            {feld("Selbst behoben", z.selbstBehoben)}
            {feld("Braucht dich", z.brauchtDich, z.brauchtDich > 0)}
            {z.claude.length > 0 ? z.claude.map((k) => feld(`${k.name} · Schätzung`, `${k.used} / ${k.limit}`)) : feld("Claude · Schätzung", "Keine Daten")}
          </dl>
        )}
      </section>

      <section aria-labelledby="bereiche">
        <h2 id="bereiche" className="mono-label bereiche-kopf">
          Pro Projekt
        </h2>
        {projekte.length === 0 ? (
          KEINE_DATEN
        ) : (
          <ul className="projektzeilen">
            {projekte.map((p) => {
              const info = projektInfo(p);
              const bereiche = je?.[p]?.map((b) => `${b.bereich} ${b.dateien}`).join(" · ");
              return (
                <li key={p} style={{ borderLeftColor: info.farbe }}>
                  <strong>{info.name}</strong>
                  <p className="leer">
                    {anzahl.get(p)} gemergt{bereiche ? ` · ${bereiche}` : ` · ${je ? "Keine Daten zu Bereichen" : "Bereiche werden geladen …"}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link className="knopf aktiv voll" href="/">
        Freigabe ansehen
      </Link>
      <p className="leer fuss">Zahlen aus loop_events. Das Claude-Kontingent ist eine Schätzung.</p>
    </main>
  );
}

export default function Auswertung() {
  return <Rahmen aktiv="auswertung">{(quelle, jetzt) => <Inhalt quelle={quelle} jetzt={jetzt} />}</Rahmen>;
}
