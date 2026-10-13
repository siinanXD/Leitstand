"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { SCHRITT, VAULT_URL, aktualisiertSatz } from "@/lib/gedaechtnis/gedaechtnis";

/** Kachel „Gedächtnis“ (SIN-541): Datum der letzten Aktualisierung des Obsidian-Vaults und Link. Das Datum kommt aus dem letzten Ereignis des Gedächtnis-Agenten. */
export function GedaechtnisKachel({ angemeldet }: { angemeldet: boolean }) {
  const [zeit, setZeit] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("loop_events").select("created_at").eq("step", SCHRITT).order("created_at", { ascending: false }).limit(1)).then(({ data, error }) => {
      if (offen) setZeit(error ? null : ((data?.[0] as { created_at?: string } | undefined)?.created_at ?? null));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return (
    <section className="tile einfach-block" aria-labelledby="gedaechtnis">
      <div className="kopf-block">
        <h2 id="gedaechtnis" className="mono-label">
          Gedächtnis
        </h2>
        <p className="leer">Dein Obsidian-Vault: Wo steht jedes Produkt, auch nach einer Woche Urlaub.</p>
      </div>
      <p className="summe">
        <span className="mono">{zeit === undefined ? "Wird geladen …" : aktualisiertSatz(zeit)}</span>
      </p>
      <p>
        <a className="knopf" href={VAULT_URL} target="_blank" rel="noreferrer">
          Vault öffnen →
        </a>
      </p>
    </section>
  );
}
