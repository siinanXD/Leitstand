"use client";

import Link from "next/link";
import type { Pause } from "@/lib/aktionen-client";
import { browserClient } from "@/lib/browser-client";
import { vergiss } from "@/lib/stand-speicher";
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
// Unter „Mehr“ steht zu jeder Seite ein Satz, was man dort findet (Sinan 13.10.: „Die Reiter sind unaussagekräftig“).
const IMMER = [
  { id: "freigabe", href: "/freigabe", name: "Freigaben", hinweis: "Was dein Ja braucht: Code und Werbung" },
  { id: "wochen-check", href: "/wochen-check", name: "Wochen-Check", hinweis: "Sonntags 30 Minuten: sechs Punkte abhaken" },
  { id: "einstellungen", href: "/einstellungen", name: "Einstellungen", hinweis: "Mitteilungen aufs Handy" },
];
const TECHNIK = [
  { id: "details", href: "/details", name: "Alles auf einer Seite", hinweis: "Die ausführliche Übersicht mit allen Zahlen" },
  { id: "ablauf", href: "/ablauf", name: "Wer macht was", hinweis: "Jeder Helfer und woran er gerade sitzt" },
  { id: "abhaengigkeiten", href: "/abhaengigkeiten", name: "Was worauf wartet", hinweis: "Aufgaben, die erst nach anderen starten" },
  { id: "auswertung", href: "/auswertung", name: "Tagesbilanz", hinweis: "Was heute geschafft und repariert wurde" },
  { id: "abnahme", href: "/abnahme", name: "Läuft es wirklich?", hinweis: "Stündliche Proben: jede Funktion grün oder rot" },
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
          <details className="kopf-mehr">
            <summary className="knopf">Mehr</summary>
            <div className="mehr-inhalt">
              <nav aria-label="Weitere Seiten" className="technik-reiter">
                {[...IMMER, ...(technik ? TECHNIK : [])].map((r) => (
                  <Link key={r.id} href={r.href} className="knopf mehr-link" aria-current={r.id === aktiv ? "page" : undefined}>
                    <span>{r.name}</span>
                    <span className="mehr-hinweis">{r.hinweis}</span>
                  </Link>
                ))}
              </nav>
              <label className="knopf technik-schalter">
                <input type="checkbox" checked={technik} onChange={(e) => setzeTechnik(e.target.checked)} /> Mehr Seiten für Technik zeigen
              </label>
              <IdeeFormular />
              <button type="button" className="knopf" aria-pressed={pause?.stand?.pausiert === true} disabled={!pause?.stand || pause.laeuft} onClick={() => void pause?.umschalten()}>
                {pause?.stand?.pausiert ? "Weiter" : "Pause"}
              </button>
              {pause?.fehler && (
                <p className="meldung" role="alert">
                  {pause.fehler}
                </p>
              )}
              <button type="button" className="knopf aktiv" onClick={() => {
                vergiss();
                void browserClient()?.auth.signOut();
              }}>
                Abmelden
              </button>
            </div>
          </details>
        </>
      )}
    </header>
  );
}
