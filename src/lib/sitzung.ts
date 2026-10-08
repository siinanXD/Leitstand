"use client";

import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserClient } from "./browser-client";
import { umleitung } from "./zugang";

export type SitzungsZustand = { zustand: "pruefe" } | { zustand: "nicht-konfiguriert" } | { zustand: "ok"; sitzung: Session | null };

/** Liest die Browser-Sitzung und leitet nach `umleitung` weiter (clientseitiger Schutz; die Daten schützt RLS). */
export function useSitzung(): SitzungsZustand {
  const router = useRouter();
  const pfad = usePathname();
  const [state, setState] = useState<SitzungsZustand>({ zustand: "pruefe" });

  useEffect(() => {
    const client = browserClient();
    if (!client) {
      void Promise.resolve().then(() => setState({ zustand: "nicht-konfiguriert" }));
      return;
    }
    let aktiv = true;
    void client.auth.getSession().then(({ data }) => aktiv && setState({ zustand: "ok", sitzung: data.session }));
    const { data } = client.auth.onAuthStateChange((_ereignis, sitzung) => setState({ zustand: "ok", sitzung }));
    return () => {
      aktiv = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const ziel = state.zustand === "ok" ? umleitung(state.sitzung !== null, pfad) : null;
  useEffect(() => {
    if (ziel) router.replace(ziel);
  }, [ziel, router]);

  return state;
}
