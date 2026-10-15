"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "./browser-client";
import type { PauseStand } from "./pause";
import type { RollenStand } from "./wirkung/wirkung";

export async function aufruf(pfad: string, methode: "GET" | "POST", body?: unknown): Promise<Response> {
  const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
  return fetch(pfad, {
    method: methode,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export type Pause = { stand: PauseStand | null; fehler: string | null; laeuft: boolean; umschalten(): Promise<void> };

/** Pausenstand vom Server (`/api/pause`); umschalten setzt Pause oder Weiter. Unbekannter Stand bleibt `null`, nichts wird geraten. */
export function usePause(angemeldet: boolean): Pause {
  const [stand, setStand] = useState<PauseStand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (!angemeldet) return;
    let offen = true;
    void aufruf("/api/pause", "GET")
      .then((res) => (res.ok ? (res.json() as Promise<PauseStand>) : null))
      .then((s) => offen && s && setStand(s))
      .catch(() => undefined);
    return () => {
      offen = false;
    };
  }, [angemeldet]);

  const umschalten = useCallback(async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await aufruf("/api/pause", "POST", { pausiert: !(stand?.pausiert ?? false) });
      if (res.ok) setStand((await res.json()) as PauseStand);
      else setFehler("Pause konnte nicht geändert werden.");
    } catch {
      setFehler("Pause fehlgeschlagen. Keine Verbindung.");
    }
    setLaeuft(false);
  }, [stand]);

  return { stand, fehler, laeuft, umschalten };
}

export type RollenZeile = RollenStand & { kennzahl: string; ziel: string };

/** Noten der Rollen vom Server (`/api/rollen`, SIN-637); `anschalten` hebt eine Auto-Pause auf. Unbekannter Stand bleibt `null`. */
export function useRollen(angemeldet: boolean) {
  const [rollen, setRollen] = useState<RollenZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState(0);

  useEffect(() => {
    if (!angemeldet) return;
    let offen = true;
    void aufruf("/api/rollen", "GET")
      .then((res) => (res.ok ? (res.json() as Promise<RollenZeile[]>) : null))
      .then((r) => offen && r && setRollen(r))
      .catch(() => undefined);
    return () => {
      offen = false;
    };
  }, [angemeldet, neu]);

  const anschalten = useCallback(async (agent: string) => {
    setFehler(null);
    try {
      if ((await aufruf("/api/rollen", "POST", { agent })).ok) setNeu((n) => n + 1);
      else setFehler("Rolle konnte nicht angeschaltet werden.");
    } catch {
      setFehler("Anschalten fehlgeschlagen. Keine Verbindung.");
    }
  }, []);

  return { rollen, fehler, anschalten };
}

/** Sinans „go“ für die vorgeschlagene Version über `/api/version`. */
export async function sendeGo(produkt: string): Promise<boolean> {
  try {
    return (await aufruf("/api/version", "POST", { produkt, go: true })).ok;
  } catch {
    return false;
  }
}

export type IdeeAntwort = { ok: true; meldung: string; kennung: string } | { ok: false; meldung: string };

/** Idee über `/api/idee` anlegen. */
export async function sendeIdee(eingabe: { projekt: string; text: string; dringend: boolean }): Promise<IdeeAntwort> {
  try {
    const res = await aufruf("/api/idee", "POST", eingabe);
    const json = (await res.json().catch(() => ({}))) as { meldung?: string; kennung?: string };
    if (res.ok && json.meldung && json.kennung) return { ok: true, meldung: json.meldung, kennung: json.kennung };
    return { ok: false, meldung: res.status === 409 ? "Idee nicht angelegt: Meilenstein, Label oder Projekt fehlt in Linear." : "Idee nicht angelegt. Linear hat abgelehnt oder ist nicht erreichbar." };
  } catch {
    return { ok: false, meldung: "Idee nicht angelegt. Keine Verbindung." };
  }
}
