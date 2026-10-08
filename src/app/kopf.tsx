"use client";

import { browserClient } from "@/lib/browser-client";

const FOLGT = "folgt in SIN-304 Teil 3";

export function Kopf({ stand, angemeldet }: { stand?: string; angemeldet: boolean }) {
  return (
    <header className="kopf">
      <p className="mono-label marke">Leitstand</p>
      {angemeldet && (
        <>
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
