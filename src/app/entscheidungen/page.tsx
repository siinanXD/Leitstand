"use client";

import { useState } from "react";
import type { OffeneEntscheidung } from "@/lib/entscheidung/entscheidung";
import { ohneKennungen } from "@/lib/zeit";
import { Rahmen } from "../rahmen";
import { entscheidungsAnfrage, useOffeneEntscheidungen } from "./offene";
import "../freigabe.css";

const FEHLER: Record<string, string> = {
  unbekannt: "Diese Entscheidung ist nicht mehr offen.",
  option: "Diese Option gibt es nicht mehr. Lade die Seite neu.",
  linear: "Linear hat die Antwort nicht angenommen. Versuch es gleich noch einmal.",
};

function Karte({ eintrag, erledigt }: { eintrag: OffeneEntscheidung; erledigt: (kennung: string) => void }) {
  const { identifier, block } = eintrag;
  const [frei, setFrei] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);

  async function senden(wahl: { option: string } | { text: string }) {
    setLaeuft(true);
    setMeldung(null);
    const res = await entscheidungsAnfrage({ method: "POST", body: JSON.stringify({ issue: identifier, ...wahl }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { fehler?: string; wahl?: string } | null;
    setLaeuft(false);
    if (!res?.ok) return setMeldung({ text: FEHLER[body?.fehler ?? ""] ?? "Die Antwort ist nicht angekommen. Prüfe die Verbindung und versuch es noch einmal.", fehler: true });
    setMeldung({ text: `Gespeichert: ${body?.wahl ?? ""}`, fehler: false });
    setTimeout(() => erledigt(identifier), 1500);
  }

  if (!block)
    return (
      <li className="grund">
        <p>{ohneKennungen(eintrag.titel)}</p>
        <p className="leer">Diese Frage hat keinen lesbaren Entscheidungs-Block. Antworte in Linear.</p>
        <a className="knopf" href={eintrag.url} target="_blank" rel="noreferrer">
          In Linear öffnen
        </a>
      </li>
    );
  const fertig = meldung?.fehler === false;
  return (
    <li className="grund" aria-labelledby={`frage-${identifier}`}>
      <p className="mono-label">
        {block.art} · {identifier}
      </p>
      <h2 id={`frage-${identifier}`}>{block.frage}</h2>
      <ul className="bereiche" aria-label={`Optionen für ${identifier}`}>
        {block.optionen.map((o) => (
          <li key={o.titel}>
            <div>
              <button type="button" className={o.titel === block.empfehlung ? "knopf voll aktiv" : "knopf voll"} disabled={laeuft || fertig} onClick={() => void senden({ option: o.titel })}>
                {o.titel === block.empfehlung ? `${o.titel} (Empfehlung)` : o.titel}
              </button>
              {o.folge && <p className="satz-bereich">{o.folge}</p>}
            </div>
          </li>
        ))}
      </ul>
      {block.recherche.length > 0 && (
        <ul aria-label={`Recherche für ${identifier}`}>
          {block.recherche.map((r) => (
            <li key={r}>
              <a href={r} target="_blank" rel="noreferrer">
                {r}
              </a>
            </li>
          ))}
        </ul>
      )}
      <form
        className="formular"
        onSubmit={(e) => {
          e.preventDefault();
          if (frei.trim()) void senden({ text: frei });
        }}
      >
        <label htmlFor={`frei-${identifier}`}>Eigene Antwort</label>
        <input id={`frei-${identifier}`} type="text" value={frei} onChange={(e) => setFrei(e.target.value)} />
        <button type="submit" className="knopf" disabled={laeuft || fertig || !frei.trim()}>
          Eigene Antwort senden
        </button>
      </form>
      {meldung && (
        <p className="hinweis" role={meldung.fehler ? "alert" : "status"}>
          {meldung.text}
        </p>
      )}
    </li>
  );
}

function Inhalt() {
  // Der Rahmen zeigt Inhalt nur angemeldet.
  const geladen = useOffeneEntscheidungen(true);
  const [weg, setWeg] = useState<string[]>([]);
  const sichtbar = geladen?.filter((e) => !weg.includes(e.identifier));
  return (
    <main className="seite freigabe">
      <header className="freigabe-kopf">
        <p className="augenbraue">Braucht dich · Entscheidungen</p>
        <h1>Entscheidungen</h1>
      </header>
      {sichtbar === undefined ? (
        <p className="hinweis" role="status">
          Wird geladen …
        </p>
      ) : sichtbar === null ? (
        <p className="hinweis" role="alert">
          Die Entscheidungen konnten nicht geladen werden.
        </p>
      ) : sichtbar.length === 0 ? (
        <p className="leer">Nichts zu entscheiden</p>
      ) : (
        <ul className="bereiche">
          {sichtbar.map((e) => (
            <Karte key={e.identifier} eintrag={e} erledigt={(k) => setWeg((w) => [...w, k])} />
          ))}
        </ul>
      )}
      <p className="leer fuss">Antworten gehen als Kommentar nach Linear und werden protokolliert.</p>
    </main>
  );
}

export default function Entscheidungen() {
  return <Rahmen aktiv="entscheidungen">{() => <Inhalt />}</Rahmen>;
}
