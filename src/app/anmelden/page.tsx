"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { browserClient } from "@/lib/browser-client";
import { useSitzung } from "@/lib/sitzung";
import { ANMELDEN_FEHLER, ANMELDEN_GESENDET, pruefeCode, pruefeKopplung, pruefeLink, sendeLink } from "@/lib/zugang";
import { Kopf } from "../kopf";

export default function Anmelden() {
  const sitzung = useSitzung();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeMeldung, setCodeMeldung] = useState<string | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [kopplung, setKopplung] = useState("");
  const [kopplungMeldung, setKopplungMeldung] = useState<string | null>(null);
  const [kopplungPrueft, setKopplungPrueft] = useState(false);
  const [einLink, setEinLink] = useState("");
  const [linkMeldung, setLinkMeldung] = useState<string | null>(null);
  const [linkPrueft, setLinkPrueft] = useState(false);
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

  async function kopplungPruefen(e: FormEvent) {
    e.preventDefault();
    const client = browserClient();
    if (!client) {
      setKopplungMeldung(ANMELDEN_FEHLER);
      return;
    }
    setKopplungPrueft(true);
    const fehler = await pruefeKopplung(client, kopplung);
    setKopplungPrueft(false);
    if (fehler) setKopplungMeldung(fehler);
    else router.replace("/");
  }

  async function linkPruefen(e: FormEvent) {
    e.preventDefault();
    const client = browserClient();
    const projektUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!client || !projektUrl) {
      setLinkMeldung(ANMELDEN_FEHLER);
      return;
    }
    setLinkPrueft(true);
    const fehler = await pruefeLink(client, einLink, projektUrl);
    setLinkPrueft(false);
    if (fehler) setLinkMeldung(fehler);
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
          <form onSubmit={kopplungPruefen} className="formular" aria-labelledby="kopplung-titel">
            <h2 id="kopplung-titel" className="mono-label">
              Kopplungscode
            </h2>
            <label htmlFor="kopplung">Code (6 Ziffern) aus „Handy-App anmelden“ auf einem angemeldeten Gerät</label>
            <input id="kopplung" name="kopplung" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9 ]{6,7}" maxLength={7} required value={kopplung} onChange={(e) => setKopplung(e.target.value)} />
            <button type="submit" className="knopf aktiv" disabled={kopplungPrueft}>
              Mit Kopplungscode anmelden
            </button>
          </form>
          {kopplungMeldung && (
            <p role="status" className="meldung fehler">
              {kopplungMeldung}
            </p>
          )}
          <form onSubmit={linkPruefen} className="formular" aria-labelledby="link-titel">
            <h2 id="link-titel" className="mono-label">
              Link aus der Mail einfügen
            </h2>
            <label htmlFor="mail-link">In der Mail lange auf „Sign in“ drücken → Link kopieren → hier einfügen</label>
            <input id="mail-link" name="mail-link" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={einLink} onChange={(e) => setEinLink(e.target.value)} />
            <button type="submit" className="knopf aktiv" disabled={linkPrueft}>
              Mit Link anmelden
            </button>
          </form>
          {linkMeldung && (
            <p role="status" className="meldung fehler">
              {linkMeldung}
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
