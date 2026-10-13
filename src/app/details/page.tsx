"use client";

import Link from "next/link";
import { useState } from "react";
import type { Pause } from "@/lib/aktionen-client";
import { pauseSatz } from "@/lib/pause";
import { nurProjekt } from "@/lib/projekte";
import { heuteSatz, kontingente, type Quelle } from "@/lib/uebersicht";
import { aktivitaetKacheln, aufgabenFuerDich, belegChips, inArbeitZeilen, kennzahlen, pipelineSchiene, type Aufgabe } from "@/lib/uebersicht-b1";
import { ProjektFilter, Rahmen, projekteIn, type Wartende } from "../rahmen";
import { GedaechtnisKachel } from "../gedaechtnis-kachel";
import { WerbungKachel } from "../werbung-kachel";
import "../freigabe.css";
import "../uebersicht.css";
import "../projekte/projekte.css";
import "../bunt.css";

const KEINE_DATEN = <p className="leer">Keine Daten</p>;
const SEGMENTE = 20;

const euro = (v: number) => `≈${v.toFixed(2).replace(".", ",")} €`;
const dauer = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Linear-Kennungen führen zu Linear, PRs des Leitstand-Repos zu GitHub; sonst kein Link (nichts raten). */
function linkFuer(a: Aufgabe, projekt: string | undefined): string | null {
  if (/^SIN-\d+$/.test(a.ref)) return `https://linear.app/sinan-kahraman/issue/${a.ref}`;
  if (/^#\d+$/.test(a.ref) && projekt === "leitstand") return `https://github.com/siinanXD/Leitstand/pull/${a.ref.slice(1)}`;
  return null;
}

export function Bento({ quelle, jetzt, pause }: { quelle: Quelle; jetzt: Date; pause?: Pause }) {
  const satz = heuteSatz(quelle, jetzt);
  const chips = belegChips(quelle.events, jetzt);
  const { stufen, grund } = pipelineSchiene(quelle.events, jetzt);
  const laeuft = inArbeitZeilen(quelle, jetzt);
  const zahlen = kennzahlen(quelle, jetzt);
  const aufgaben = aufgabenFuerDich(quelle.snapshot);
  const quoten = kontingente(quelle.snapshot);
  const kacheln = aktivitaetKacheln(quelle.events, jetzt);
  const ereignisse = kacheln.reduce((n, k) => n + k.anzahl, 0);
  const projektVon = (a: Aufgabe) => quelle.snapshot.find((s) => a.key.startsWith(`${s.project}|`))?.project;

  return (
    <main className="bento-b1">
      <section className="tile b1-satz" aria-labelledby="heute" style={{ gridColumn: "1 / -1" }}>
        <div>
          <h1 id="heute" className="mono-label">
            Heute in einem Satz
          </h1>
          {pause?.stand?.pausiert && (
            <p className="satz-text satz-pause" role="status">
              {pauseSatz(pause.stand.seit)}
            </p>
          )}
          {satz ? <p className="satz-text">{satz.satz}</p> : KEINE_DATEN}
        </div>
        {chips.length > 0 && (
          <ul className="chips" aria-label="Belege">
            {chips.map((c) => (
              <li key={c} className="chip mono">
                {c}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="b1-spalte">
        <section className="tile b1-kachel" aria-labelledby="pipeline">
          <h2 id="pipeline" className="mono-label">
            Pipeline · jetzt
          </h2>
          {stufen.length === 0 ? (
            KEINE_DATEN
          ) : (
            <>
              <ol className="stufen">
                {stufen.map((s) => (
                  <li key={s.stage} className={s.zustand === "leer" ? undefined : s.zustand}>
                    {s.stage}
                    {s.anzahl > 1 ? `×${s.anzahl}` : ""}
                    {s.zustand === "rot" && <span className="sr-only"> rot</span>}
                  </li>
                ))}
              </ol>
              {grund && <p className="grund">{grund}</p>}
            </>
          )}
        </section>

        <section className="tile b1-kachel" aria-labelledby="arbeit">
          <h2 id="arbeit" className="mono-label">
            In Arbeit · {laeuft.length}
          </h2>
          {laeuft.length === 0 ? (
            KEINE_DATEN
          ) : (
            <ul className="arbeit">
              {laeuft.map((z) => (
                <li key={z.key}>
                  <span className="mono">{z.issue ?? ""}</span>
                  <span className="titel">{z.titel ?? z.project}</span>
                  <span className="mono">{z.dauerMin !== null ? dauer(z.dauerMin) : ""}</span>
                  <span className="mono">{z.kosten !== null ? euro(z.kosten) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="b1-spalte">
        {zahlen.length === 0 ? (
          <section className="tile b1-kachel" aria-label="Zahlen">
            {KEINE_DATEN}
          </section>
        ) : (
          <dl className="kennzahlen" aria-label="Zahlen">
            {zahlen.map((z) => (
              <div key={z.label} className={z.hervor ? "kennzahl hervor" : "kennzahl"}>
                <dd>{z.wert}</dd>
                <dt className="mono-label">{z.label}</dt>
              </div>
            ))}
          </dl>
        )}

        <div className="b1-reihe">
          <section className="tile b1-kachel b1-braucht" aria-labelledby="braucht">
            <h2 id="braucht" className="mono-label">
              Braucht dich
            </h2>
            {aufgaben.length === 0 ? (
              KEINE_DATEN
            ) : (
              <ul className="aufgaben">
                {aufgaben.map((a) => {
                  const href = linkFuer(a, projektVon(a));
                  return (
                    <li key={a.key}>
                      <span>{a.titel}</span>
                      {a.minuten !== null && <span className="mono">{a.minuten} MIN</span>}
                      {href && (
                        <a className="mono" href={href} target="_blank" rel="noreferrer" aria-label={`${a.titel} öffnen`}>
                          ÖFFNEN →
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="tile b1-kachel" aria-labelledby="kontingente">
            <h2 id="kontingente" className="mono-label">
              Kontingente
            </h2>
            {quoten.length === 0 ? (
              KEINE_DATEN
            ) : (
              quoten.map((q) => {
                const anteil = q.used / q.limit;
                const gefuellt = Math.min(SEGMENTE, Math.round(anteil * SEGMENTE));
                return (
                  <div key={q.name} className={anteil >= 1 ? "quote rot" : anteil >= 0.8 ? "quote warn" : "quote"}>
                    <div className="quote-kopf mono">
                      <span>{q.schaetzung ? `${q.name} ≈` : q.name}</span>
                      <span>{q.schaetzung ? "Schätzung" : `${q.used}/${q.limit}`}</span>
                    </div>
                    <div
                      className="segmente"
                      role="img"
                      aria-label={`${q.name}${q.schaetzung ? " (Schätzung)" : ""}: ${q.used} von ${q.limit}`}
                    >
                      {Array.from({ length: SEGMENTE }, (_, i) => (
                        <div key={i} className={i < gefuellt ? "voll" : undefined} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>

        <section className="tile b1-kachel" aria-labelledby="aktivitaet">
          <h2 id="aktivitaet" className="mono-label">
            Aktivität · 24 h · rot = Stillstand
          </h2>
          {ereignisse === 0 ? (
            KEINE_DATEN
          ) : (
            <div
              className="kacheln"
              role="img"
              aria-label={`${ereignisse} Ereignisse in 24 Stunden, stündlich: ${kacheln.map((k) => (k.rot ? `${k.anzahl} rot` : k.anzahl)).join(", ")}`}
            >
              {kacheln.map((k, i) => (
                <div key={i} className={k.rot ? "rot" : k.stufe > 0 ? `s${k.stufe}` : undefined} />
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="einfach bunt" style={{ gridColumn: "1 / -1", padding: 0 }}>
        <WerbungKachel angemeldet />
        <GedaechtnisKachel angemeldet />
      </div>
    </main>
  );
}

/** Ganz oben (SIN-517): PRs, die auf Freigabe warten, mit einem Tipp auf „Freigeben“. Ohne wartende PRs keine Leiste. */
function WartendeLeiste({ wartend }: { wartend: Wartende }) {
  const { wartende, fehler, freigeben } = wartend;
  if (wartende.length === 0) return null;
  return (
    <section className="tile wartende" aria-labelledby="wartende">
      <h2 id="wartende" className="mono-label">
        {wartende.length} {wartende.length === 1 ? "wartet" : "warten"} auf dich
      </h2>
      <ul className="aufgaben">
        {wartende.map((p) => (
          <li key={p.key} className="wartend-zeile">
            <div className="wartend-text">
              <span className="wartend-titel">{p.titel}</span>
              <span className="grund">{p.grund}</span>
              <span className="mono">
                {p.repo} · #{p.nummer}
              </span>
              {fehler[p.key] && (
                <span className="wartend-fehler" role="alert">
                  {fehler[p.key]}
                </span>
              )}
            </div>
            {p.url && (
              <a className="mono" href={p.url} target="_blank" rel="noreferrer" aria-label={`${p.titel} auf GitHub öffnen`}>
                PR →
              </a>
            )}
            <button type="button" className="knopf aktiv" aria-label={`${p.titel} freigeben`} onClick={() => void freigeben(p)}>
              Freigeben
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Details() {
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <Rahmen aktiv="uebersicht">
      {(quelle, jetzt, wartend, pause) => {
        const gefiltert: Quelle = { events: nurProjekt(quelle.events, filter), snapshot: nurProjekt(quelle.snapshot, filter) };
        return (
          <>
            <div className="werkzeuge">
              <Link href="/" className="knopf">
                ← Zurück zur einfachen Übersicht
              </Link>
            </div>
            <WartendeLeiste wartend={wartend} />
            <div className="werkzeuge">
              <ProjektFilter projekte={projekteIn(quelle)} wert={filter} onChange={setFilter} />
            </div>
            <nav aria-label="Projektseiten">
              <ul className="projekt-liste">
                {projekteIn(quelle).map((p) => (
                  <li key={p.id}>
                    <Link href={`/projekt/${p.id}`} className="projekt-name">
                      <span className="marke-projekt" style={{ background: p.farbe }} aria-hidden="true" /> {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Bento quelle={gefiltert} jetzt={jetzt} pause={pause} />
          </>
        );
      }}
    </Rahmen>
  );
}
