"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { Kopf } from "../../kopf";
import { Kopplung } from "../../kopplung";

/** Rückweg des Magic-Links: supabase-js liest die Tokens aus der Adresse. Danach folgt der Weg zur Übersicht oder die Kopplung der Handy-App (SIN-525). */
export default function Callback() {
  const [fehler, setFehler] = useState(false);
  const [angemeldet, setAngemeldet] = useState(false);

  useEffect(() => {
    const client = browserClient();
    if (!client) {
      void Promise.resolve().then(() => setFehler(true));
      return;
    }
    let aktiv = true;
    const code = new URLSearchParams(window.location.search).get("code");
    const bereit = code ? client.auth.exchangeCodeForSession(code).then(({ error }) => !error) : client.auth.getSession().then(({ data }) => data.session !== null);
    void bereit.then((ok) => {
      if (!aktiv) return;
      if (ok) setAngemeldet(true);
      else setFehler(true);
    });
    return () => {
      aktiv = false;
    };
  }, []);

  return (
    <>
      <Kopf angemeldet={false} />
      <main className="anmelden">
        <section className="tile" aria-labelledby="callback-titel">
          <h1 id="callback-titel" className="mono-label">
            Anmeldung
          </h1>
          {angemeldet ? (
            <p role="status">
              Angemeldet. <Link href="/">Weiter zur Übersicht</Link>
            </p>
          ) : fehler ? (
            <p role="status" className="meldung fehler">
              Der Link ist ungültig oder abgelaufen. <a href="/anmelden">Neuen Link anfordern</a>
            </p>
          ) : (
            <p role="status" className="leer">
              Anmeldung wird bestätigt …
            </p>
          )}
        </section>
        {angemeldet && <Kopplung />}
      </main>
    </>
  );
}
