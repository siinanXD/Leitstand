"use client";

import Link from "next/link";
import { browserClient } from "@/lib/browser-client";

const REITER = [
  { id: "uebersicht", href: "/", name: "Übersicht" },
  { id: "ablauf", href: "/ablauf", name: "Ablauf" },
  { id: "abhaengigkeiten", href: "/abhaengigkeiten", name: "Abhängigkeiten" },
  { id: "auswertung", href: "/auswertung", name: "Auswertung" },
  { id: "einstellungen", href: "/einstellungen", name: "Einstellungen" },
];

export function Kopf({ stand, angemeldet, aktiv = "uebersicht", wartend = 0 }: { stand?: string; angemeldet: boolean; aktiv?: string; wartend?: number }) {
  return (
    <header className="kopf">
      <p className="mono-label marke">Leitstand</p>
      {angemeldet && (
        <>
          <nav aria-label="Reiter" className="reiter">
            {REITER.map((r) => (
              <Link key={r.id} href={r.href} className="knopf" aria-current={r.id === aktiv ? "page" : undefined}>
                {r.name}
                {r.id === "uebersicht" && wartend > 0 && (
                  <span className="mono">
                    {" "}
                    ({wartend}
                    <span className="sr-only"> warten auf dich</span>)
                  </span>
                )}
              </Link>
            ))}
          </nav>
          {stand && <p className="mono-label live">Live {stand}</p>}
          <div className="kopf-aktionen">
            <button type="button" className="knopf" disabled>
              <span className="mono">⌘K</span> Suche
            </button>
            <button type="button" className="knopf" disabled>
              Planer jetzt
            </button>
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
