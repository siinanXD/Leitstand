"use client";

import Link from "next/link";
import type { Pause } from "@/lib/aktionen-client";
import { browserClient } from "@/lib/browser-client";
import { IdeeFormular } from "./idee-formular";
import { setzeTechnik, useTechnik } from "./technik";

// Im Menü nur die sechs einfachen Seiten (SIN-578); die Aufgabe öffnet man aus einer Karte. Der Rest hinter „Für Technik“.
const REITER = [
  { id: "uebersicht", href: "/", name: "Start" },
  { id: "team", href: "/team", name: "Team" },
  { id: "werkzeuge", href: "/werkzeuge", name: "Werkzeuge" },
  { id: "projekte", href: "/projekte", name: "Produkt" },
  { id: "kosten", href: "/kosten", name: "Kosten" },
];
const TECHNIK = [
  { id: "details", href: "/details", name: "Details" },
  { id: "ablauf", href: "/ablauf", name: "Ablauf" },
  { id: "abhaengigkeiten", href: "/abhaengigkeiten", name: "Abhängigkeiten" },
  { id: "auswertung", href: "/auswertung", name: "Auswertung" },
  { id: "freigabe", href: "/freigabe", name: "Freigabe" },
  { id: "einstellungen", href: "/einstellungen", name: "Einstellungen" },
];

export function Kopf({ stand, angemeldet, aktiv = "uebersicht", pause }: { stand?: boolean; angemeldet: boolean; aktiv?: string; pause?: Pause }) {
  const technik = useTechnik();
  return (
    <header className="kopf">
      <p className="mono-label marke">Leitstand</p>
      {angemeldet && (
        <>
          <nav aria-label="Reiter" className="reiter">
            {(technik ? [...REITER, ...TECHNIK] : REITER).map((r) => (
              <Link key={r.id} href={r.href} className="knopf" aria-current={r.id === aktiv ? "page" : undefined}>
                {r.name}
              </Link>
            ))}
            <label className="knopf technik-schalter">
              <input type="checkbox" checked={technik} onChange={(e) => setzeTechnik(e.target.checked)} /> Für Technik
            </label>
          </nav>
          {stand && <p className="mono-label live">Live</p>}
          <div className="kopf-aktionen">
            <IdeeFormular />
            <button type="button" className="knopf" disabled>
              <span className="mono">⌘K</span> Suche
            </button>
            <button type="button" className="knopf" disabled>
              Planer jetzt
            </button>
            <button type="button" className="knopf" aria-pressed={pause?.stand?.pausiert === true} disabled={!pause?.stand || pause.laeuft} onClick={() => void pause?.umschalten()}>
              {pause?.stand?.pausiert ? "Weiter" : "Pause"}
            </button>
            {pause?.fehler && (
              <p className="meldung" role="alert">
                {pause.fehler}
              </p>
            )}
            <button type="button" className="knopf" disabled>
              Notbremse
            </button>
            <button type="button" className="knopf aktiv" onClick={() => void browserClient()?.auth.signOut()}>
              Abmelden
            </button>
          </div>
        </>
      )}
    </header>
  );
}
