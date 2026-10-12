"use client";

import { useId, useState, type FormEvent } from "react";
import { sendeIdee } from "@/lib/aktionen-client";
import { MAX_ZEICHEN } from "@/lib/idee";
import { PROJEKTE } from "@/lib/projekte";

/** „+ Idee“ in der Kopfzeile (SIN-530): Projekt, ein Satz, optional dringend. Die Bestätigung kommt vom Server. */
export function IdeeFormular() {
  const id = useId();
  const [offen, setOffen] = useState(false);
  const [projekt, setProjekt] = useState(PROJEKTE[0].id);
  const [text, setText] = useState("");
  const [dringend, setDringend] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  async function senden(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    const antwort = await sendeIdee({ projekt, text, dringend });
    setLaeuft(false);
    setMeldung({ ok: antwort.ok, text: antwort.ok ? `${antwort.meldung} (${antwort.kennung})` : antwort.meldung });
    if (antwort.ok) {
      setText("");
      setDringend(false);
    }
  }

  return (
    <div className="idee">
      <button type="button" className="knopf" aria-expanded={offen} aria-controls={`${id}-form`} onClick={() => setOffen(!offen)}>
        + Idee
      </button>
      {offen && (
        <form id={`${id}-form`} className="tile idee-form formular" onSubmit={(e) => void senden(e)} aria-label="Neue Idee">
          <label htmlFor={`${id}-projekt`}>Projekt</label>
          <select id={`${id}-projekt`} value={projekt} onChange={(e) => setProjekt(e.target.value)}>
            {PROJEKTE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-text`}>Idee in einem Satz</label>
          <input id={`${id}-text`} type="text" required maxLength={MAX_ZEICHEN} value={text} onChange={(e) => setText(e.target.value)} />
          <label className="idee-dringend" htmlFor={`${id}-dringend`}>
            <input id={`${id}-dringend`} type="checkbox" checked={dringend} onChange={(e) => setDringend(e.target.checked)} /> Dringend
          </label>
          <button type="submit" className="knopf aktiv" disabled={laeuft || text.trim() === ""}>
            Anlegen
          </button>
          {meldung && (
            <p className="meldung" role={meldung.ok ? "status" : "alert"}>
              {meldung.text}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
