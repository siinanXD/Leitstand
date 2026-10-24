"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { bahnen, FARBE_WORT, kartenZeile, STATION_NAME, zeitleiste, type Bahn } from "@/lib/fliessband/ansicht";
import { STATIONEN, type Farbe, type Fliessband, type Karte } from "@/lib/fliessband/fliessband";
import { projektInfo } from "@/lib/projekte";
import type { Quelle } from "@/lib/uebersicht";
import { fortschritt } from "@/lib/uebersicht-einfach";
import { zeitInWorten } from "@/lib/zeit";
import { useOffeneEntscheidungen } from "../entscheidungen/offene";
import { useWartendeWerbung } from "../werbung-kachel";
import "../bunt.css";
import "./fliessband.css";

/** SIN-815: alle 60 s neu laden, ohne Seiten-Neuladen. */
export const NEU_LADEN_MS = 60_000;

type Laden = { zustand: "laedt" } | { zustand: "fehler" } | { zustand: "ok"; daten: Fliessband };

function useFliessband(angemeldet: boolean): Laden {
  const [laden, setLaden] = useState<Laden>({ zustand: "laedt" });
  useEffect(() => {
    if (!angemeldet) return;
    let offen = true;
    const hole = async () => {
      const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
      const res = await fetch("/api/fliessband", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" }).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as Fliessband | null) : null;
      // Ein Fehler beim Neuladen behält den letzten guten Stand.
      if (offen) setLaden((alt) => (body ? { zustand: "ok", daten: body } : alt.zustand === "ok" ? alt : { zustand: "fehler" }));
    };
    void hole();
    const takt = setInterval(() => void hole(), NEU_LADEN_MS);
    return () => {
      offen = false;
      clearInterval(takt);
    };
  }, [angemeldet]);
  return laden;
}

const datum = (d: Date) =>
  `${d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" })} · ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}`;
const uhr = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const name = (id: string) => projektInfo(id).name;

type Punkt = { text: string; url: string };

function BrauchtDich({ fb, punkte }: { fb: Fliessband; punkte: Punkt[] }) {
  return (
    <section className="fb-braucht" aria-labelledby="fb-braucht-titel">
      <h2 id="fb-braucht-titel" className="fb-braucht-kopf">
        <span>
          Braucht dich<span className="fb-nur-desktop"> ({punkte.length})</span>
        </span>
        <span className="fb-zahl fb-nur-handy" aria-hidden="true">
          {punkte.length}
        </span>
      </h2>
      {punkte.length === 0 ? (
        <p className="fb-leer">{fb.brauchtDichText ?? "Nichts – alles läuft"}</p>
      ) : (
        <ul className="fb-braucht-liste">
          {punkte.map((p) => (
            <li key={p.url + p.text} className="fb-braucht-punkt">
              <span>{p.text}</span>
              <a className="knopf aktiv fb-los" href={p.url} target={p.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" aria-label={`Los: ${p.text}`}>
                Los
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Legende() {
  return (
    <ul className="fb-legende" aria-label="Farben">
      {(Object.keys(FARBE_WORT) as Farbe[]).map((f) => (
        <li key={f}>
          <span className={`fb-punkt ${f}`} aria-hidden="true" /> {FARBE_WORT[f]}
        </li>
      ))}
    </ul>
  );
}

function FertigPille({ bahn }: { bahn: Bahn }) {
  if (!bahn.fertigListe) return null;
  const { fertig, gesamt } = bahn.fertigListe;
  return <span className={gesamt > 0 && fertig >= gesamt ? "fb-pille fertig" : "fb-pille"}>Fertig-Liste {fertig}/{gesamt}</span>;
}

function KarteZeile({ k, jetzt }: { k: Karte; jetzt: Date }) {
  // Die ganze Karte ist der Link (Ziel ≥ 44 px).
  return (
    <li>
      <Link href={`/aufgabe/${k.issue}`} className={`fb-karte ${k.farbe}`}>
        <span className="fb-karte-text">
          <span className="fb-karte-titel">
            {k.issue} · {k.titel}
          </span>
          <span className="fb-karte-zeile">{kartenZeile(k, k.seit ? zeitInWorten(k.seit, jetzt) : null)}</span>
        </span>
        <span className="fb-pille station">{STATION_NAME[k.station]}</span>
      </Link>
    </li>
  );
}

/** Handy (M1): je Produkt eine Bahn mit 8 Punkten, darunter die offenen Karten. */
function BahnHandy({ bahn, jetzt }: { bahn: Bahn; jetzt: Date }) {
  return (
    <section className="fb-bahn" aria-labelledby={`fb-${bahn.id}`}>
      <div className="fb-bahn-kopf">
        <h3 id={`fb-${bahn.id}`}>{name(bahn.id)}</h3>
        <FertigPille bahn={bahn} />
      </div>
      <ol className="fb-stationen" aria-label={`Stationen ${name(bahn.id)}`}>
        {bahn.punkte.map((p) => (
          <li key={p.station} className={p.farbe ? `fb-punkt gross ${p.farbe}` : "fb-punkt gross"}>
            {p.anzahl > 1 && <span className="fb-anzahl" aria-hidden="true">{p.anzahl}</span>}
            <span className="sr-only">{`${p.name}: ${p.anzahl === 0 ? "leer" : `${p.anzahl}, ${FARBE_WORT[p.farbe!]}`}`}</span>
          </li>
        ))}
      </ol>
      {bahn.leerText ? (
        <p className={bahn.leerText.startsWith("Alles") ? "fb-leer ok" : "fb-leer"}>{bahn.leerText}</p>
      ) : (
        <ul className="fb-karten">
          {bahn.offen.map((k) => (
            <KarteZeile key={k.issue} k={k} jetzt={jetzt} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Desktop (D1): Produkte als Zeilen, 8 Stations-Spalten. */
function Tabelle({ liste, jetzt }: { liste: Bahn[]; jetzt: Date }) {
  return (
    <table className="fb-tabelle">
      <caption className="sr-only">Fließband: Produkte und Stationen</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Produkt</span>
          </th>
          {STATIONEN.map((s) => (
            <th key={s} scope="col">
              {STATION_NAME[s]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {liste.map((b) => (
          <tr key={b.id}>
            <th scope="row">
              <span className="fb-produkt">{name(b.id)}</span>
              <FertigPille bahn={b} />
            </th>
            {STATIONEN.map((s) => (
              <td key={s}>
                {b.spalten[s].map((k) => (
                  <Link key={k.issue} href={`/aufgabe/${k.issue}`} className={`fb-kachel ${k.farbe}`}>
                    <span className="fb-kachel-id">{k.issue}</span>
                    <span className="fb-kachel-titel">{k.titel}</span>
                    <span className="fb-kachel-grund">{k.grund ?? (s === "fertig" ? "fertig" : FARBE_WORT[k.farbe])}{k.seit && s !== "fertig" ? ` · ${zeitInWorten(k.seit, jetzt) ?? ""}` : ""}</span>
                  </Link>
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FliessbandStart({ quelle, jetzt, angemeldet }: { quelle: Quelle; jetzt: Date; angemeldet: boolean }) {
  const laden = useFliessband(angemeldet);
  // Wie auf der alten Startseite (SIN-1013): offene Entscheidungen und wartende Werbe-Entwürfe stehen vorn.
  const entscheidungen = useOffeneEntscheidungen(angemeldet)?.length ?? 0;
  const werbung = useWartendeWerbung(angemeldet);
  const fb = laden.zustand === "ok" ? laden.daten : null;
  const liste = fb ? bahnen(fb, fortschritt(quelle)) : [];
  const zeiten = fb ? zeitleiste(quelle.events, fb, name, jetzt) : [];
  return (
    <main className="fliessband">
      <header className="fb-kopf">
        <p className="fb-datum">
          {datum(jetzt)}
          {fb && <span className="fb-nur-desktop"> · alles aktualisiert {zeitInWorten(fb.erzeugt, jetzt)}</span>}
        </p>
        <h1>
          <span className="fb-nur-handy">Hallo Sinan.</span>
          <span className="fb-nur-desktop">Leitstand</span>
        </h1>
      </header>
      {laden.zustand === "laedt" && <p className="fb-leer" role="status">Das Fließband lädt …</p>}
      {laden.zustand === "fehler" && (
        <p className="fb-leer" role="alert">
          Das Fließband konnte nicht geladen werden. Es versucht es in einer Minute erneut.
        </p>
      )}
      {fb && (
        <>
          <BrauchtDich
            fb={fb}
            punkte={[
              ...(entscheidungen ? [{ text: `Entscheidungen: ${entscheidungen}`, url: "/entscheidungen" }] : []),
              ...(werbung ? [{ text: werbung === 1 ? "Ein Werbe-Entwurf wartet auf dein Ja" : `${werbung} Werbe-Entwürfe warten auf dein Ja`, url: "/freigabe/werbemittel" }] : []),
              ...fb.brauchtDich,
            ].slice(0, 3)}
          />
          <section className="fb-band" aria-labelledby="fb-titel">
            <h2 id="fb-titel" className="fb-nur-handy">
              Fließband
            </h2>
            <h2 className="sr-only fb-nur-desktop">Fließband nach Stationen</h2>
            <Legende />
            <div className="fb-nur-handy fb-bahnen">
              {liste.map((b) => (
                <BahnHandy key={b.id} bahn={b} jetzt={jetzt} />
              ))}
            </div>
            <div className="fb-nur-desktop">
              <Tabelle liste={liste} jetzt={jetzt} />
            </div>
          </section>
          <section className="fb-zeitleiste fb-nur-desktop" aria-labelledby="fb-zeit">
            <h2 id="fb-zeit">Letzte 12 Stunden</h2>
            {zeiten.length === 0 ? (
              <p className="fb-leer">In den letzten 12 Stunden wurde nichts gemergt und nichts ist rot geworden.</p>
            ) : (
              <ul>
                {zeiten.map((z) => (
                  <li key={z.key}>
                    <span className={`fb-punkt ${z.farbe}`} aria-hidden="true" />
                    <time dateTime={z.zeit} className="mono-label">
                      {uhr(z.zeit)}
                    </time>
                    <span>{z.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
