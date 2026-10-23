"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import type { OffeneEntscheidung } from "@/lib/entscheidung/entscheidung";

/** Mit Sitzungs-Token an die Route; die Route prüft den Nutzer serverseitig. */
export async function entscheidungsAnfrage(init?: RequestInit): Promise<Response> {
  const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
  return fetch("/api/entscheidungen", { ...init, headers: { ...init?.headers, Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" } });
}

/** Offene Entscheidungen; undefined = lädt, null = nicht ladbar. */
export function useOffeneEntscheidungen(angemeldet: boolean): OffeneEntscheidung[] | null | undefined {
  const [liste, setListe] = useState<OffeneEntscheidung[] | null | undefined>(undefined);
  useEffect(() => {
    if (!angemeldet) return;
    let offen = true;
    void (async () => {
      const res = await entscheidungsAnfrage().catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { entscheidungen?: OffeneEntscheidung[] } | null) : null;
      if (offen) setListe(body?.entscheidungen ?? null);
    })();
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return liste;
}
