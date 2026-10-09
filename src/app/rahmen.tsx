"use client";

import { useEffect, useState, type ReactNode } from "react";
import { browserClient } from "@/lib/browser-client";
import { alleProjekte, type Projekt } from "@/lib/projekte";
import { useSitzung } from "@/lib/sitzung";
import { ladeQuelle, type Laden, type Lesequelle } from "@/lib/supabase";
import type { Quelle } from "@/lib/uebersicht";
import { Kopf } from "./kopf";

export const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

const LEER: Quelle = { events: [], snapshot: [] };

/** Sitzung prüfen, Daten laden, Kopf zeigen; die Seiten liefern nur den Inhalt. */
export function Rahmen({ aktiv, children }: { aktiv: string; children: (quelle: Quelle, jetzt: Date) => ReactNode }) {
  const sitzung = useSitzung();
  const [geladen, setGeladen] = useState<{ laden: Laden; jetzt: Date } | null>(null);
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;

  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    const jetzt = new Date();
    void ladeQuelle(client as unknown as Lesequelle, jetzt).then((laden) => offen && setGeladen({ laden, jetzt }));
    return () => {
      offen = false;
    };
  }, [angemeldet]);

  if (sitzung.zustand === "nicht-konfiguriert") {
    return (
      <>
        <Kopf angemeldet={false} aktiv={aktiv} />
        <p className="hinweis" role="status">
          Datenquelle nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
        </p>
      </>
    );
  }
  if (!angemeldet) {
    return (
      <>
        <Kopf angemeldet={false} aktiv={aktiv} />
        <p className="hinweis" role="status">
          Sitzung wird geprüft …
        </p>
      </>
    );
  }
  return (
    <>
      <Kopf angemeldet aktiv={aktiv} stand={geladen ? uhrzeit(geladen.jetzt.toISOString()) : undefined} />
      {!geladen && (
        <p className="hinweis" role="status">
          Daten werden geladen …
        </p>
      )}
      {geladen?.laden.zustand === "fehler" && (
        <p className="hinweis" role="status">
          Datenquelle nicht erreichbar.
        </p>
      )}
      {children(geladen?.laden.zustand === "ok" ? geladen.laden.quelle : LEER, geladen?.jetzt ?? new Date())}
    </>
  );
}

export const projekteIn = (q: Quelle): Projekt[] => alleProjekte([...q.snapshot.map((s) => s.project), ...q.events.flatMap((e) => (e.project ? [e.project] : []))]);

/** Filter nach Projekt; Farbe nur als Marke. */
export function ProjektFilter({ projekte, wert, onChange }: { projekte: Projekt[]; wert: string | null; onChange: (id: string | null) => void }) {
  if (projekte.length === 0) return null;
  return (
    <div className="filter" role="group" aria-label="Projekt filtern">
      <button type="button" className="knopf" aria-pressed={wert === null} onClick={() => onChange(null)}>
        Alle
      </button>
      {projekte.map((p) => (
        <button key={p.id} type="button" className="knopf" aria-pressed={wert === p.id} onClick={() => onChange(wert === p.id ? null : p.id)}>
          <span className="marke-projekt" style={{ background: p.farbe }} aria-hidden="true" /> {p.name}
        </button>
      ))}
    </div>
  );
}
