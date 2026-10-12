"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { browserClient } from "@/lib/browser-client";
import { useSitzung } from "@/lib/sitzung";
import { ANMELDEN_FEHLER, ANMELDEN_GESENDET, pruefeCode, sendeLink } from "@/lib/zugang";
import { Kopf } from "../kopf";

export default function Anmelden() {
  const sitzung = useSitzung();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeMeldung, setCodeMeldung] = useState<string | null>(null);
  const [prueft, setPrueft] = useState(false);
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

  async function codePruefen(e: FormEvent) {
    e.preventDefault();
    const client = browserClient();
    if (!client) {
      setCodeMeldung(ANMELDEN_FEHLER);
      return;
    }
    setPrueft(true);
    const fehler = await pruefeCode(client, email, code);
    setPrueft(false);
    if (fehler) setCodeMeldung(fehler);
    else router.replace("/");
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
          <form onSubmit={codePruefen} className="formular" aria-labelledby="code-titel">
            <h2 id="code-titel" className="mono-label">
              Code aus der Mail
            </h2>
            <label htmlFor="code">Code (6 Ziffern)</label>
            <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="knopf aktiv" disabled={prueft || !email.trim()}>
              Mit Code anmelden
            </button>
          </form>
          {codeMeldung && (
            <p role="status" className="meldung fehler">
              {codeMeldung}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
