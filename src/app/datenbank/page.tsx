"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import type { Tabelle } from "@/lib/datenbank/datenbank";
import { Rahmen } from "../rahmen";
import "../ablauf.css";
import "../bunt.css";

type Stand = { zustand: "laedt" } | { zustand: "fehler" } | { zustand: "ok"; tabellen: Tabelle[] };

/** Lädt beim Öffnen einmal frisch, kein Dauerlauf. */
function useDatenbank(): Stand {
  const [stand, setStand] = useState<Stand>({ zustand: "laedt" });
  useEffect(() => {
    let offen = true;
    void (async () => {
      try {
        const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
        const res = await fetch("/api/datenbank", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        const json = res.ok ? ((await res.json()) as { tabellen: Tabelle[] }) : null;
        if (offen) setStand(json ? { zustand: "ok", tabellen: json.tabellen } : { zustand: "fehler" });
      } catch {
        if (offen) setStand({ zustand: "fehler" });
      }
    })();
    return () => {
      offen = false;
    };
  }, []);
  return stand;
}

function Karte({ t }: { t: Tabelle }) {
  return (
    <section className="tile" aria-labelledby={`tabelle-${t.name}`}>
      <h2 id={`tabelle-${t.name}`} className="karte-titel mono-label">
        {t.name}
      </h2>
      <p>
        {/* Rot nur für den Zustand „RLS aus“, dazu immer das Wort. */}
        <span className={t.rls ? "signal ok" : "signal error"} aria-hidden="true" /> {t.rls ? "RLS an" : "RLS aus"} · {t.realtime ? "Realtime an" : "Realtime aus"}
        {t.policies.length > 0 && <span className="leer"> · Policies: {t.policies.join(", ")}</span>}
      </p>
      <ul className="fortschritt">
        {t.spalten.map((s) => (
          <li key={s.name} className="dienst-schmal">
            <span className="station-name mono-label">
              {s.name}
              {s.schluessel ? " (Schlüssel)" : ""}
            </span>
            <span className="leer">
              {s.typ}
              {s.nullable ? "" : ", Pflicht"}
              {s.verweis ? ` → ${s.verweis}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Datenbank (SIN-1037): Tabellen, Spalten, Schlüssel, RLS und Realtime aus dem Katalog, nie Inhalte. */
export default function Datenbank() {
  const stand = useDatenbank();
  return (
    <Rahmen aktiv="datenbank">
      {() => (
        <main className="einfach bunt">
          <div className="kopf-titel">
            <h1>Datenbank</h1>
          </div>
          {stand.zustand === "laedt" && (
            <p className="leer" role="status">
              Lädt …
            </p>
          )}
          {stand.zustand === "fehler" && (
            <p className="leer" role="status">
              Datenquelle nicht erreichbar.
            </p>
          )}
          {stand.zustand === "ok" && (stand.tabellen.length === 0 ? <p className="leer">Keine Daten</p> : stand.tabellen.map((t) => <Karte key={t.name} t={t} />))}
        </main>
      )}
    </Rahmen>
  );
}
