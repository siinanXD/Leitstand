"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { staende } from "@/lib/abnahme/abnahme";
import { aufruf } from "@/lib/aktionen-client";
import { MAX_FEHLER, MAX_VORRANG, PUNKTE } from "@/lib/wochencheck/wochencheck";
import { Rahmen } from "../rahmen";
import "../bunt.css";

/** Wochen-Check (SIN-631): sechs Punkte zum Abhaken; Fehler und Vorrang werden Linear-Issues, das Ergebnis geht ins Gedächtnis. */
export default function WochenCheck() {
  const [haken, setHaken] = useState<string[]>([]);
  const [fehler, setFehler] = useState("");
  const [vorrang, setVorrang] = useState("");
  const [stunde, setStunde] = useState("19");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void aufruf("/api/wochencheck", "GET")
      .then((res) => (res.ok ? (res.json() as Promise<{ stunde: number }>) : null))
      .then((d) => d && setStunde(String(d.stunde)))
      .catch(() => undefined);
  }, []);

  async function senden(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    const res = await aufruf("/api/wochencheck", "POST", { haken, fehler, vorrang }).catch(() => null);
    setLaeuft(false);
    const d = res ? ((await res.json().catch(() => ({}))) as { issues?: string[]; ohneIssue?: number; fehler?: string }) : {};
    setMeldung(res?.ok ? { ok: true, text: `Gespeichert. Issues: ${d.issues?.join(", ") || "keine"}${d.ohneIssue ? `, ohne Issue: ${d.ohneIssue}` : ""}.` } : { ok: false, text: d.fehler ?? "Nicht gespeichert." });
  }

  async function speichereStunde() {
    const res = await aufruf("/api/wochencheck", "POST", { stunde: Number(stunde) }).catch(() => null);
    setMeldung(res?.ok ? { ok: true, text: `Push sonntags ab ${stunde} Uhr.` } : { ok: false, text: "Uhrzeit nicht gespeichert." });
  }

  return (
    <Rahmen aktiv="wochen-check">
      {(quelle, _jetzt, wartend) => {
        const rot = staende(quelle.events).filter((s) => !s.ok).length;
        const hinweis: Record<string, string> = { proben: `${rot} rote Proben`, freigaben: `${wartend.wartende.length} Freigaben warten` };
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <h1>Wochen-Check</h1>
            </div>
            <form className="tile einfach-block formular" onSubmit={(e) => void senden(e)} aria-label="Wochen-Check">
              {PUNKTE.map((p) => (
                <label key={p.id} htmlFor={`wc-${p.id}`}>
                  <input id={`wc-${p.id}`} type="checkbox" checked={haken.includes(p.id)} onChange={(e) => setHaken(e.target.checked ? [...haken, p.id] : haken.filter((h) => h !== p.id))} /> {p.titel}
                  {hinweis[p.id] && <span className="leer"> · {hinweis[p.id]}</span>}
                  {p.link && (
                    <>
                      {" "}
                      <Link href={p.link}>Ansehen</Link>
                    </>
                  )}
                </label>
              ))}
              <label htmlFor="wc-fehler">Fehler aus der Stichprobe (eine Zeile je Fehler, höchstens {MAX_FEHLER}): wird je ein Korrektur-Issue</label>
              <textarea id="wc-fehler" rows={3} value={fehler} onChange={(e) => setFehler(e.target.value)} />
              <label htmlFor="wc-vorrang">Vorrang nächste Woche (ein Satz)</label>
              <input id="wc-vorrang" type="text" maxLength={MAX_VORRANG} value={vorrang} onChange={(e) => setVorrang(e.target.value)} />
              <button type="submit" className="knopf aktiv" disabled={laeuft}>
                Abschließen
              </button>
            </form>
            <div className="tile einfach-block formular">
              <label htmlFor="wc-stunde">Push am Sonntag ab (Uhr, Berliner Zeit)</label>
              <input id="wc-stunde" type="number" min={0} max={23} value={stunde} onChange={(e) => setStunde(e.target.value)} />
              <button type="button" className="knopf" onClick={() => void speichereStunde()}>
                Uhrzeit speichern
              </button>
            </div>
            {meldung && (
              <p className="meldung" role={meldung.ok ? "status" : "alert"}>
                {meldung.text}
              </p>
            )}
          </main>
        );
      }}
    </Rahmen>
  );
}
