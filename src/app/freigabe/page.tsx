"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { BereichZeile } from "@/lib/bereiche";
import { browserClient } from "@/lib/browser-client";
import { BereichIcon } from "../bereich-icon";
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
  const dateien = (n: number) => `${n} ${n === 1 ? "Datei" : "Dateien"}`;
  return (
    <main className="seite freigabe">
      <header className="freigabe-kopf">
        <p className="augenbraue">Braucht dich · Freigabe</p>
        <h1>{detail.pr.titel}</h1>
        <p className="leer mono">
          {repo} · #{detail.pr.nummer}
        </p>
        <ul className="merkmale" aria-label="Merkmale">
          <li className="mono">{detail.pr.status}</li>
          <li className="mono">
            {detail.pr.zweig} → {detail.pr.ziel}
          </li>
          <li className="mono">{detail.pr.autor ?? "unbekannt"}</li>
        </ul>
      </header>

      <section aria-labelledby="aenderungen">
        <h2 id="aenderungen" className="mono-label bereiche-kopf">
          <span>Was sich ändert</span>
          <span>
            {detail.bereiche.length} {detail.bereiche.length === 1 ? "Bereich" : "Bereiche"} · {dateien(detail.dateien)}
          </span>
        </h2>
        {detail.bereiche.length === 0 ? (
          <p className="leer">Keine Daten</p>
        ) : (
          <ul className="bereiche">
            {detail.bereiche.map((b) => (
              <li key={b.bereich}>
                <BereichIcon bereich={b.bereich} />
                <div>
                  <p className="mono-label zeile">
                    <span>{b.bereich}</span>
                    <span>{dateien(b.dateien)}</span>
                  </p>
                  <p className="satz-bereich">{b.satz}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.grund && (
        <section className="grund" aria-labelledby="grund">
          <h2 id="grund" className="marke-grund">
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
        <button type="button" className="knopf aktiv voll" disabled={!offen || laeuft || meldung !== null} onClick={() => void freigeben()}>
          Freigeben
        </button>
        <a className="knopf" href={detail.pr.url} target="_blank" rel="noreferrer">
          Auf GitHub ansehen
        </a>
        <button type="button" className="knopf" onClick={spaeter}>
          Später
        </button>
      </div>
      <p className="leer fuss">Freigeben läuft serverseitig und wird protokolliert.</p>
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
