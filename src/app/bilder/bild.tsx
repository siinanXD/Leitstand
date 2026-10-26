"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import type { Ansicht } from "@/lib/figma-ansichten/figma-ansichten";
import { Rahmen } from "../rahmen";

type Zustand = { art: "laedt" } | { art: "fehlt" } | { art: "ok"; url: string; stand: string };

/** Holt das PNG mit Sitzungs-Token über die Route; jeder Fehler wird zum Satz „Bild nicht verfügbar“. */
export function Bild({ ansicht, link }: { ansicht: Ansicht; link: string }) {
  const [z, setZ] = useState<Zustand>({ art: "laedt" });
  useEffect(() => {
    let url: string | null = null;
    let offen = true;
    void (async () => {
      const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
      const res = await fetch(`/api/figma-bild?node=${encodeURIComponent(ansicht.node)}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => null);
      if (!res?.ok) return offen && setZ({ art: "fehlt" });
      const blob = await res.blob();
      if (!offen) return;
      url = URL.createObjectURL(blob);
      setZ({ art: "ok", url, stand: res.headers.get("X-Bild-Stand") ?? "" });
    })();
    return () => {
      offen = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ansicht.node]);

  return (
    <li className="grund" aria-labelledby={`bild-${ansicht.node}`}>
      <p className="mono-label">
        {ansicht.art} · {ansicht.produkt}
      </p>
      <h2 id={`bild-${ansicht.node}`}>{ansicht.titel}</h2>
      {z.art === "laedt" && (
        <p className="hinweis" role="status">
          Wird geladen …
        </p>
      )}
      {z.art === "fehlt" && <p className="leer">Bild nicht verfügbar</p>}
      {z.art === "ok" && (
        // eslint-disable-next-line @next/next/no-img-element -- Blob-URL aus der Route, next/image kann sie nicht optimieren
        <img src={z.url} alt={`${ansicht.titel} (Figma-Ansicht)`} style={{ maxWidth: "100%", height: "auto" }} />
      )}
      <p className="leer">
        {z.art === "ok" && z.stand ? `Stand ${new Date(z.stand).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · ` : ""}
        <a href={link} target="_blank" rel="noreferrer">
          In Figma öffnen
        </a>
      </p>
    </li>
  );
}

/** Rahmen braucht eine Funktion als children; die darf nur in einer Client-Komponente entstehen, nicht in der Server-Seite. */
export function BilderSeite({ ansichten }: { ansichten: (Ansicht & { link: string })[] }) {
  return (
    <Rahmen aktiv="bilder">
      {() => (
        <main className="seite freigabe">
          <header className="freigabe-kopf">
            <p className="augenbraue">Figma</p>
            <h1>Bilder</h1>
          </header>
          {ansichten.length === 0 ? (
            <p className="leer">Keine Bilder eingetragen</p>
          ) : (
            <ul className="bereiche">
              {ansichten.map((a) => (
                <Bild key={`${a.datei}/${a.node}`} ansicht={a} link={a.link} />
              ))}
            </ul>
          )}
        </main>
      )}
    </Rahmen>
  );
}
