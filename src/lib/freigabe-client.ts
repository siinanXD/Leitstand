"use client";

import { useCallback, useState } from "react";
import { browserClient } from "./browser-client";
import type { WartenderPr } from "./wartende-prs";

export type Freigaben = {
  /** Schlüssel (`repo#nr`) der PRs, die optimistisch ausgeblendet sind. */
  erledigt: ReadonlySet<string>;
  fehler: Readonly<Record<string, string>>;
  freigeben(pr: WartenderPr): Promise<void>;
};

/** Freigeben über `/api/freigabe` mit der Sitzung des Nutzers. Zeile verschwindet sofort; bei Fehler kommt sie mit Meldung zurück. */
export function useFreigaben(): Freigaben {
  const [erledigt, setErledigt] = useState<ReadonlySet<string>>(new Set());
  const [fehler, setFehler] = useState<Record<string, string>>({});

  const freigeben = useCallback(async (pr: WartenderPr) => {
    setErledigt((alt) => new Set(alt).add(pr.key));
    setFehler((alt) => Object.fromEntries(Object.entries(alt).filter(([k]) => k !== pr.key)));
    let text: string | null = null;
    try {
      const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
      const res = await fetch("/api/freigabe", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ repo: pr.repo, pr: pr.nummer }),
      });
      if (!res.ok) text = res.status === 409 ? "Freigabe nicht möglich: Der PR ist nicht mehr offen oder ein Entwurf." : "Freigabe fehlgeschlagen. GitHub hat abgelehnt oder ist nicht erreichbar.";
    } catch {
      text = "Freigabe fehlgeschlagen. Keine Verbindung.";
    }
    if (text) {
      setErledigt((alt) => {
        const neu = new Set(alt);
        neu.delete(pr.key);
        return neu;
      });
      setFehler((alt) => ({ ...alt, [pr.key]: text }));
    }
  }, []);

  return { erledigt, fehler, freigeben };
}
