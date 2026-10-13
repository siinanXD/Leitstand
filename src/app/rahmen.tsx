"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePause, type Pause } from "@/lib/aktionen-client";
import { browserClient } from "@/lib/browser-client";
import type { Zeile } from "@/lib/ceo/ceo";
import { hoereAufEreignisse, mitEreignis, type Echtzeitquelle } from "@/lib/echtzeit";
import { useFreigaben } from "@/lib/freigabe-client";
import { alleProjekte, type Projekt } from "@/lib/projekte";
import { tabTitel, wartendePrs, type WartenderPr } from "@/lib/wartende-prs";
import { useSitzung } from "@/lib/sitzung";
import { erinnere, merke, type Gemerkt } from "@/lib/stand-speicher";
import { ladeChef, ladeQuelle, type Laden, type Lesequelle } from "@/lib/supabase";
import type { Quelle } from "@/lib/uebersicht";
import { zeitInWorten } from "@/lib/zeit";
import { Kopf } from "./kopf";

export const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

const LEER: Quelle = { events: [], snapshot: [] };

/** Sitzung prüfen, Daten laden, Kopf zeigen; die Seiten liefern nur den Inhalt. */
export type Wartende = { wartende: WartenderPr[]; fehler: Readonly<Record<string, string>>; freigeben(pr: WartenderPr): Promise<void> };

type Geladen = { laden: Laden; jetzt: Date; chef: Zeile[] | null };

/** Graue Flächen in Kartenform, solange nichts da ist (SIN-579): kein Text, der gleich wieder verschwindet. */
function Platzhalter() {
  return (
    <main className="platzhalter" role="status" aria-busy="true" aria-label="Inhalt lädt">
      {[0, 1, 2].map((i) => (
        <div key={i} className="tile" />
      ))}
    </main>
  );
}

export function Rahmen({ aktiv, children }: { aktiv: string; children: (quelle: Quelle, jetzt: Date, wartend: Wartende, pause: Pause, laden: "laedt" | "ok" | "fehler", chef: Zeile[] | null) => ReactNode }) {
  const sitzung = useSitzung();
  const [frisch, setFrisch] = useState<Geladen | null>(null);
  const [gemerkt, setGemerkt] = useState<Gemerkt | null>(null);
  // Zähler: jede Erhöhung lädt neu (Änderung in der Datenbank, App wieder sichtbar).
  const [neu, setNeu] = useState(0);
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  const freigaben = useFreigaben();
  const pause = usePause(angemeldet);
  // Der Stand vom letzten Mal steht sofort da, solange die Sitzung noch geprüft wird oder frische Daten fehlen.
  const erinnert = gemerkt !== null && (sitzung.zustand === "pruefe" || angemeldet);
  const geladen: Geladen | null = frisch ?? (erinnert ? { laden: { zustand: "ok", quelle: gemerkt.quelle }, jetzt: new Date(), chef: gemerkt.chef } : null);
  const quelleOk = geladen?.laden.zustand === "ok" ? geladen.laden.quelle : LEER;
  const wartende = wartendePrs(quelleOk.snapshot).filter((p) => !freigaben.erledigt.has(p.key));

  useEffect(() => {
    document.title = tabTitel(angemeldet ? wartende.length : 0);
  }, [angemeldet, wartende.length]);

  useEffect(() => {
    void Promise.resolve().then(() => setGemerkt(erinnere()));
  }, []);

  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    const jetzt = new Date();
    void Promise.all([ladeQuelle(client as unknown as Lesequelle, jetzt), ladeChef(client as unknown as Lesequelle)]).then(([laden, chef]) => {
      if (!offen) return;
      // Ein Fehler beim Nachladen lässt die gezeigten Daten stehen.
      setFrisch((g) => (laden.zustand === "fehler" && g?.laden.zustand === "ok" ? g : { laden, jetzt, chef }));
      if (laden.zustand === "ok") merke({ quelle: laden.quelle, chef, zeit: jetzt.toISOString() });
    });
    return () => {
      offen = false;
    };
  }, [angemeldet, neu]);

  // Neue Ereignisse und die Uhr (SIN-526): Einträge wandern ohne Neuladen, Laufzeiten zählen weiter.
  // Änderungen an loop_snapshot und ceo_entscheidungen sowie die Rückkehr in die App laden neu (SIN-579).
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let verzoegert: ReturnType<typeof setTimeout> | undefined;
    const nachladen = () => {
      clearTimeout(verzoegert);
      verzoegert = setTimeout(() => setNeu((n) => n + 1), 1000);
    };
    const abmelden = hoereAufEreignisse(
      client as unknown as Echtzeitquelle,
      (e) => setFrisch((g) => (g?.laden.zustand === "ok" ? { ...g, jetzt: new Date(), laden: { zustand: "ok", quelle: mitEreignis(g.laden.quelle, e) } } : g)),
      nachladen,
    );
    const sichtbar = () => {
      if (document.visibilityState === "visible") setNeu((n) => n + 1);
    };
    document.addEventListener("visibilitychange", sichtbar);
    const takt = setInterval(() => setFrisch((g) => (g ? { ...g, jetzt: new Date() } : g)), 60_000);
    return () => {
      abmelden();
      document.removeEventListener("visibilitychange", sichtbar);
      clearTimeout(verzoegert);
      clearInterval(takt);
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
  if (!geladen) {
    return (
      <>
        <Kopf angemeldet={angemeldet} aktiv={aktiv} pause={angemeldet ? pause : undefined} />
        <Platzhalter />
      </>
    );
  }
  return (
    <>
      <Kopf angemeldet aktiv={aktiv} stand={!!frisch} pause={pause} />
      {!frisch && gemerkt && (
        <p className="hinweis" role="status">
          Stand von {zeitInWorten(gemerkt.zeit, new Date()) ?? "früher"}
        </p>
      )}
      {geladen.laden.zustand === "fehler" && (
        <p className="hinweis" role="status">
          Datenquelle nicht erreichbar.
        </p>
      )}
      {children(quelleOk, geladen.jetzt, { wartende, fehler: freigaben.fehler, freigeben: freigaben.freigeben }, pause, geladen.laden.zustand, geladen.chef)}
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
