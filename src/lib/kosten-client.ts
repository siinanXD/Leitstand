"use client";

import { useEffect, useState } from "react";
import { browserClient } from "./browser-client";
import type { Kosten } from "./kosten/kosten";

export type KostenStand = { zustand: "laedt" } | { zustand: "fehler" } | { zustand: "ok"; kosten: Kosten };

/** Kosten vom Server (`/api/kosten`) mit der Sitzung des Nutzers. */
export function useKosten(angemeldet: boolean): KostenStand {
  const [stand, setStand] = useState<KostenStand>({ zustand: "laedt" });
  useEffect(() => {
    if (!angemeldet) return;
    let offen = true;
    void (async () => {
      try {
        const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
        const res = await fetch("/api/kosten", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        if (offen) setStand(res.ok ? { zustand: "ok", kosten: (await res.json()) as Kosten } : { zustand: "fehler" });
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
