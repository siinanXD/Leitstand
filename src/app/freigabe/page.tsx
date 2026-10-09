"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { BereichZeile } from "@/lib/bereiche";
import { browserClient } from "@/lib/browser-client";
import { Rahmen } from "../rahmen";

type Detail = {
  pr: { nummer: number; titel: string; autor: string | null; zweig: string; ziel: string; status: string; entwurf: boolean; url: string; labels: string[] };
  dateien: number;
  bereiche: BereichZeile[];
  grund: string | null;
};

type Zustand = { art: "laedt" } | { art: "fehler"; text: string } | { art: "ok"; detail: Detail };

const SPAETER_SCHLUESSEL = "leitstand.spaeter";

async function anfrage(url: string, init?: RequestInit): Promise<Response> {
  const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
  return fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" } });
}

function Inhalt() {
  const router = useRouter();
  const params = useSearchParams();
  const repo = params.get("repo");
  const pr = params.get("pr");
  const [zustand, setZustand] = useState<Zustand>({ art: "laedt" });
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let offen = true;
    const lade = async () => {
      if (!repo || !pr) return { art: "fehler", text: "Kein PR angegeben (repo und pr fehlen)." } as const;
      const res = await anfrage(`/api/freigabe?repo=${encodeURIComponent(repo)}&pr=${encodeURIComponent(pr)}`).catch(() => null);
      if (!res?.ok) return { art: "fehler", text: "PR nicht ladbar." } as const;
      return { art: "ok", detail: (await res.json()) as Detail } as const;
    };
    void lade().then((z) => offen && setZustand(z));
    return () => {
      offen = false;
    };
  }, [repo, pr]);

  async function freigeben() {
    setLaeuft(true);
    const res = await anfrage("/api/freigabe", { method: "POST", body: JSON.stringify({ repo, pr: Number(pr) }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { protokolliert?: boolean } | null;
    setLaeuft(false);
    if (!res?.ok) setMeldung("Freigabe nicht möglich. Der PR ist nicht offen oder GitHub hat abgelehnt.");
    else setMeldung(body?.protokolliert ? "Freigegeben und protokolliert." : "Freigegeben, aber nicht protokolliert (SUPABASE_SERVICE_ROLE_KEY fehlt).");
  }

  function spaeter() {
    // Vorerst nur ausblenden; die Erinnerung kommt in Push 3/3.
    const alt = JSON.parse(localStorage.getItem(SPAETER_SCHLUESSEL) ?? "[]") as string[];
    localStorage.setItem(SPAETER_SCHLUESSEL, JSON.stringify([...new Set([...alt, `${repo}#${pr}`])]));
    router.push("/");
  }

  if (zustand.art === "laedt")
    return (
      <p className="hinweis" role="status">
        PR wird geladen …
      </p>
    );
  if (zustand.art === "fehler")
    return (
      <p className="hinweis" role="alert">
        {zustand.text}
      </p>
    );

  const { detail } = zustand;
  const offen = detail.pr.status === "open" && !detail.pr.entwurf;
  return (
    <main className="seite freigabe">
      <header className="tile">
        <p className="mono-label">
          {repo} · <span className="mono">#{detail.pr.nummer}</span>
        </p>
        <h1>{detail.pr.titel}</h1>
      </header>

      <section className="tile" aria-labelledby="merkmale">
        <h2 id="merkmale" className="mono-label">
          Merkmale
        </h2>
        <dl className="zahlen">
          <div>
            <dt>Status</dt>
            <dd className="mono">{detail.pr.status}</dd>
          </div>
          <div>
            <dt>Zweig</dt>
            <dd className="mono">
              {detail.pr.zweig} → {detail.pr.ziel}
            </dd>
          </div>
          <div>
            <dt>Autor</dt>
            <dd className="mono">{detail.pr.autor ?? "unbekannt"}</dd>
          </div>
          <div>
            <dt>Dateien</dt>
            <dd className="mono">{detail.dateien}</dd>
          </div>
        </dl>
      </section>

      <section className="tile" aria-labelledby="aenderungen">
        <h2 id="aenderungen" className="mono-label">
          Änderungen nach Bereichen
        </h2>
        {detail.bereiche.length === 0 ? (
          <p className="leer">Keine Daten</p>
        ) : (
          <ul className="liste">
            {detail.bereiche.map((b) => (
              <li key={b.bereich}>
                <strong>{b.bereich}</strong> <span className="mono">{b.dateien}</span>
                <br />
                <span className="leer">{b.satz}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.grund && (
        <section className="tile grund" aria-labelledby="grund">
          <h2 id="grund" className="mono-label">
            Grund für Freigabe
          </h2>
          <p>{detail.grund}</p>
        </section>
      )}

      {meldung && (
        <p className="hinweis" role="status">
          {meldung}
        </p>
      )}

      <div className="aktionen">
        <button type="button" className="knopf aktiv" disabled={!offen || laeuft || meldung !== null} onClick={() => void freigeben()}>
          Freigeben
        </button>
        <a className="knopf" href={detail.pr.url} target="_blank" rel="noreferrer">
          Auf GitHub ansehen
        </a>
        <button type="button" className="knopf" onClick={spaeter}>
          Später
        </button>
      </div>
    </main>
  );
}

export default function Freigabe() {
  return (
    <Rahmen aktiv="freigabe">
      {() => (
        <Suspense>
          <Inhalt />
        </Suspense>
      )}
    </Rahmen>
  );
}
