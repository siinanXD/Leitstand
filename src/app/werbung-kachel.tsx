"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { wartenSatz } from "@/lib/marketing/marketing";

/** Kachel „Werbung“ (SIN-550): Zahl der Entwürfe, die auf Freigabe warten. Freigeben läuft auf /freigabe/werbemittel. */
/** Wie viele Werbe-Entwürfe auf Freigabe warten; undefined = lädt, null = nicht ladbar. Auch für die Startseite (Sinan 13.10.: Video nicht mehr zu sehen). */
export function useWartendeWerbung(angemeldet: boolean): number | null | undefined {
  const [anzahl, setAnzahl] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void (async () => {
      const { data } = await client.auth.getSession();
      const res = await fetch("/api/werbemittel", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { eintraege?: unknown[] } | null) : null;
      if (offen) setAnzahl(body?.eintraege ? body.eintraege.length : null);
    })();
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return anzahl;
}

export function WerbungKachel({ angemeldet }: { angemeldet: boolean }) {
  const anzahl = useWartendeWerbung(angemeldet);
  return (
    <section className="tile einfach-block" aria-labelledby="werbung">
      <div className="kopf-block">
        <h2 id="werbung" className="mono-label">
          Werbung
        </h2>
        <p className="leer">Entwürfe des Marketing-Agenten. Nichts geht ohne deine Freigabe raus.</p>
      </div>
      <p className="summe">
        <span className="mono">{anzahl === undefined ? "Wird geladen …" : anzahl === null ? "Nicht ladbar" : wartenSatz(anzahl)}</span>
      </p>
      <p>
        <Link className="knopf" href="/freigabe/werbemittel">
          Entwürfe prüfen und freigeben →
        </Link>
      </p>
    </section>
  );
}
