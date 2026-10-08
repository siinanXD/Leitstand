"use client";

import { useState, type FormEvent } from "react";
import { browserClient } from "@/lib/browser-client";
import { useSitzung } from "@/lib/sitzung";
import { ANMELDEN_FEHLER, ANMELDEN_GESENDET, sendeLink } from "@/lib/zugang";
import { Kopf } from "../kopf";

export default function Anmelden() {
  const sitzung = useSitzung();
  const [email, setEmail] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    const client = browserClient();
    if (!client) {
      setMeldung(ANMELDEN_FEHLER);
      return;
    }
    setSendet(true);
    setMeldung(await sendeLink(client, email, window.location.origin));
    setSendet(false);
  }

  return (
    <>
      <Kopf angemeldet={false} />
      <main className="anmelden">
        <section className="tile" aria-labelledby="anmelden-titel">
          <h1 id="anmelden-titel" className="mono-label">
            Anmelden
          </h1>
          {sitzung.zustand === "nicht-konfiguriert" && (
            <p className="hinweis" role="status">
              Datenquelle nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
            </p>
          )}
          <form onSubmit={absenden} className="formular">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className="knopf aktiv" disabled={sendet}>
              Link senden
            </button>
          </form>
          {meldung && (
            <p role="status" className={meldung === ANMELDEN_GESENDET ? "meldung" : "meldung fehler"}>
              {meldung}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
