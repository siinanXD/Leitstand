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
          {/* Handy: feste Leiste unten (Figma 59:28); Desktop: Reiter oben. */}
          <nav aria-label="Reiter" className="reiter">
            {REITER.map((r) => (
              <Link key={r.id} href={r.href} className="knopf" aria-current={r.id === aktiv ? "page" : undefined}>
                {r.name}
              </Link>
            ))}
          </nav>
          {stand && <p className="mono-label live">Live</p>}
          {/* Alles andere hinter „Mehr“ (SIN-578, Sinan 13.10.: kein seitliches Scrollen). Knöpfe ohne Funktion sind raus. */}
          <details className="mehr">
            <summary className="knopf">Mehr</summary>
            <div className="mehr-inhalt">
              <label className="knopf technik-schalter">
                <input type="checkbox" checked={technik} onChange={(e) => setzeTechnik(e.target.checked)} /> Für Technik
              </label>
              {technik && (
                <nav aria-label="Für Technik" className="technik-reiter">
                  {TECHNIK.map((r) => (
                    <Link key={r.id} href={r.href} className="knopf" aria-current={r.id === aktiv ? "page" : undefined}>
                      {r.name}
                    </Link>
                  ))}
                </nav>
              )}
              <IdeeFormular />
              <button type="button" className="knopf" aria-pressed={pause?.stand?.pausiert === true} disabled={!pause?.stand || pause.laeuft} onClick={() => void pause?.umschalten()}>
                {pause?.stand?.pausiert ? "Weiter" : "Pause"}
              </button>
              {pause?.fehler && (
                <p className="meldung" role="alert">
                  {pause.fehler}
                </p>
              )}
              {!technik && (
                <Link href="/einstellungen" className="knopf" aria-current={aktiv === "einstellungen" ? "page" : undefined}>
                  Einstellungen
                </Link>
              )}
              <button type="button" className="knopf aktiv" onClick={() => void browserClient()?.auth.signOut()}>
                Abmelden
              </button>
            </div>
          </details>
        </>
      )}
    </header>
  );
}
