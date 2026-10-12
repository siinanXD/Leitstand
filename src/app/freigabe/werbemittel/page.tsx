"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { ARTEN_NAME, istVideo, MAX_GRUND, type Werbemittel } from "@/lib/werbemittel";
import { Rahmen } from "../../rahmen";

type Zustand = { art: "laedt" } | { art: "fehler"; text: string } | { art: "ok"; eintraege: Werbemittel[] };

async function anfrage(url: string, init?: RequestInit): Promise<Response> {
  const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
  return fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" } });
}

const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

function Karte({ eintrag, onErledigt }: { eintrag: Werbemittel; onErledigt: (id: string, meldung: string) => void }) {
  const [ablehnen, setAblehnen] = useState(false);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function senden(aktion: "freigeben" | "ablehnen") {
    setLaeuft(true);
    setFehler(null);
    const res = await anfrage("/api/werbemittel", { method: "POST", body: JSON.stringify({ id: eintrag.id, aktion, grund }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { protokolliert?: boolean } | null;
    setLaeuft(false);
    if (!res?.ok) return setFehler("Nicht möglich. Das Werbemittel wartet nicht mehr oder die Datenbank hat abgelehnt.");
    const was = aktion === "freigeben" ? "Freigegeben" : "Abgelehnt";
    onErledigt(eintrag.id, `${eintrag.produkt}: ${was}${body?.protokolliert ? " und protokolliert." : ", aber nicht protokolliert (SUPABASE_SERVICE_ROLE_KEY fehlt)."}`);
  }

  const titel = `${eintrag.produkt} · ${ARTEN_NAME[eintrag.art]}`;
  return (
    <li className="tile grund-karte" aria-labelledby={`wm-${eintrag.id}`}>
      <h2 id={`wm-${eintrag.id}`} className="mono-label">
        {titel}
      </h2>
      <ul className="merkmale" aria-label="Merkmale">
        {eintrag.mitKi && <li className="mono">{eintrag.kiKennzeichnung ?? "mit KI erstellt"}</li>}
        {eintrag.modell && <li className="mono">{eintrag.modell}</li>}
        {eintrag.kostenEur !== null && <li className="mono">Kosten {euro(eintrag.kostenEur)}</li>}
        {eintrag.dauerSekunden !== null && <li className="mono">{Math.round(eintrag.dauerSekunden)} s</li>}
        {istVideo(eintrag.art) && <li className="mono">{eintrag.mitTon ? "mit Ton" : "ohne Ton"}</li>}
      </ul>

      {istVideo(eintrag.art) ? (
        eintrag.videoUrl ? (
          <video controls preload="metadata" src={eintrag.videoUrl} aria-label={`Video: ${titel}`} style={{ width: "100%" }} />
        ) : (
          <p className="leer">Video nicht abrufbar</p>
        )
      ) : (
        <p className="satz-bereich" style={{ whiteSpace: "pre-wrap" }}>
          {eintrag.textInhalt ?? "Kein Text vorhanden"}
        </p>
      )}

      <p className="leer">
        {eintrag.quelleUrl && (
          <a href={eintrag.quelleUrl} target="_blank" rel="noreferrer">
            Quelle
          </a>
        )}
        {eintrag.quelleUrl && eintrag.runUrl && " · "}
        {eintrag.runUrl && (
          <a href={eintrag.runUrl} target="_blank" rel="noreferrer">
            Lauf
          </a>
        )}
      </p>

      {fehler && (
        <p className="hinweis" role="alert">
          {fehler}
        </p>
      )}

      {ablehnen ? (
        <div className="aktionen">
          <label htmlFor={`grund-${eintrag.id}`} className="mono-label" style={{ flexBasis: "100%" }}>
            Grund für die Ablehnung
          </label>
          <textarea id={`grund-${eintrag.id}`} value={grund} maxLength={MAX_GRUND} rows={3} onChange={(e) => setGrund(e.target.value)} style={{ flexBasis: "100%" }} />
          <button type="button" className="knopf aktiv" disabled={laeuft || grund.trim().length === 0} onClick={() => void senden("ablehnen")}>
            Ablehnen
          </button>
          <button type="button" className="knopf" disabled={laeuft} onClick={() => setAblehnen(false)}>
            Zurück
          </button>
        </div>
      ) : (
        <div className="aktionen">
          <button type="button" className="knopf aktiv" disabled={laeuft} onClick={() => void senden("freigeben")}>
            Freigeben
          </button>
          <button type="button" className="knopf" disabled={laeuft} onClick={() => setAblehnen(true)}>
            Ablehnen mit Grund
          </button>
        </div>
      )}
    </li>
  );
}

function Inhalt() {
  const [zustand, setZustand] = useState<Zustand>({ art: "laedt" });
  const [meldung, setMeldung] = useState<string | null>(null);

  const lade = useCallback(async (): Promise<Zustand> => {
    const res = await anfrage("/api/werbemittel").catch(() => null);
    if (!res?.ok) return { art: "fehler", text: "Werbemittel nicht ladbar." };
    return { art: "ok", eintraege: ((await res.json()) as { eintraege: Werbemittel[] }).eintraege };
  }, []);

  useEffect(() => {
    let offen = true;
    void lade().then((z) => offen && setZustand(z));
    return () => {
      offen = false;
    };
  }, [lade]);

  function erledigt(id: string, text: string) {
    setMeldung(text);
    setZustand((z) => (z.art === "ok" ? { art: "ok", eintraege: z.eintraege.filter((e) => e.id !== id) } : z));
  }

  if (zustand.art === "laedt")
    return (
      <p className="hinweis" role="status">
        Werbemittel werden geladen …
      </p>
    );
  if (zustand.art === "fehler")
    return (
      <p className="hinweis" role="alert">
        {zustand.text}
      </p>
    );

  return (
    <main className="seite freigabe">
      <header className="freigabe-kopf">
        <p className="augenbraue">Braucht dich · Freigabe</p>
        <h1>Werbemittel</h1>
        <p className="leer mono">{zustand.eintraege.length} warten auf Freigabe</p>
      </header>
      {meldung && (
        <p className="hinweis" role="status">
          {meldung}
        </p>
      )}
      {zustand.eintraege.length === 0 ? (
        <p className="leer">Keine Daten</p>
      ) : (
        <ul className="bereiche">
          {zustand.eintraege.map((e) => (
            <Karte key={e.id} eintrag={e} onErledigt={erledigt} />
          ))}
        </ul>
      )}
      <p className="leer fuss">Freigeben und Ablehnen laufen serverseitig und werden protokolliert. Veröffentlicht wird in einem eigenen Schritt.</p>
    </main>
  );
}

export default function WerbemittelFreigabe() {
  return <Rahmen aktiv="freigabe">{() => <Inhalt />}</Rahmen>;
}
