"use client";

import Link from "next/link";
import { browserClient } from "@/lib/browser-client";

const FOLGT = "folgt in SIN-304 Teil 3";

const REITER = [
  { id: "uebersicht", href: "/", name: "Übersicht" },
  { id: "ablauf", href: "/ablauf", name: "Ablauf" },
  { id: "abhaengigkeiten", href: "/abhaengigkeiten", name: "Abhängigkeiten" },
];

export function Kopf({ stand, angemeldet, aktiv = "uebersicht" }: { stand?: string; angemeldet: boolean; aktiv?: string }) {
  return (
    <header className="kopf">
      <p className="mono-label marke">Leitstand</p>
      {angemeldet && (
        <>
          <nav aria-label="Reiter" className="reiter">
            {REITER.map((r) => (
              <Link key={r.id} href={r.href} className="knopf" aria-current={r.id === aktiv ? "page" : undefined}>
                {r.name}
              </Link>
            ))}
          </nav>
          {stand && <p className="mono-label">Stand {stand}</p>}
          <div className="kopf-aktionen">
            <button type="button" className="knopf" disabled title={`Suche ${FOLGT}`}>
              Suche <span className="mono">⌘K</span>
            </button>
            <button type="button" className="knopf" disabled title={`Planer jetzt ${FOLGT}`}>
              Planer jetzt
            </button>
            <button type="button" className="knopf" disabled title={`Notbremse ${FOLGT}`}>
              Notbremse
            </button>
            <button type="button" className="knopf aktiv" onClick={() => void browserClient()?.auth.signOut()}>
              Abmelden
            </button>
          </div>
          <p className="mono-label kopf-hinweis">Aktionen {FOLGT}</p>
        </>
      )}
    </header>
  );
}
