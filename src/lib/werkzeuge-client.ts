"use client";

import { useEffect, useState } from "react";
import { browserClient } from "./browser-client";
import type { Zeile } from "./werkzeuge/werkzeuge";

export type WerkzeugeStand = { zustand: "laedt" } | { zustand: "fehler" } | { zustand: "ok"; zeilen: Zeile[] };

/** Werkzeug-Status vom Server (`/api/werkzeuge`) mit der Sitzung des Nutzers. */
export function useWerkzeuge(angemeldet: boolean): WerkzeugeStand {
  const [stand, setStand] = useState<WerkzeugeStand>({ zustand: "laedt" });
  useEffect(() => {
    if (!angemeldet) return;
    let offen = true;
    void (async () => {
      try {
        const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
        const res = await fetch("/api/werkzeuge", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        if (offen) setStand(res.ok ? { zustand: "ok", zeilen: (await res.json()) as Zeile[] } : { zustand: "fehler" });
      } catch {
        if (offen) setStand({ zustand: "fehler" });
      }
    })();
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return stand;
}
