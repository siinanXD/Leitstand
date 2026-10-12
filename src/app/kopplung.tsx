"use client";

import { useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { KOPPLUNG_ERZEUGEN_FEHLER, holeKopplungsCode, zeigeKopplungsCode } from "@/lib/zugang";

/** Knopf „Handy-App anmelden“: zeigt einen 6-stelligen Code (10 Minuten, einmal nutzbar) aus der aktuellen Sitzung (SIN-525). */
export function Kopplung() {
  const [code, setCode] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function erzeugen() {
    setLaedt(true);
    setFehler(null);
    const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
    const ergebnis = await holeKopplungsCode(data.session?.access_token ?? "");
    setLaedt(false);
    setCode(ergebnis?.code ?? null);
    if (!ergebnis) setFehler(KOPPLUNG_ERZEUGEN_FEHLER);
  }

  return (
    <section className="tile kopplung" aria-labelledby="kopplung-titel">
      <h2 id="kopplung-titel" className="mono-label">
        Handy-App anmelden
      </h2>
      <p>Zeigt einen Code für die Leitstand-App auf dem Home-Bildschirm. Gültig 10 Minuten, einmal nutzbar.</p>
      <button type="button" className="knopf aktiv" onClick={() => void erzeugen()} disabled={laedt}>
        Handy-App anmelden
      </button>
      <div role="status">
        {code && (
          <>
            <p className="kopplung-code mono" aria-label={`Kopplungscode ${code.split("").join(" ")}`}>
              {zeigeKopplungsCode(code)}
            </p>
            <p>In der App unter „Anmelden“ im Feld „Kopplungscode“ eingeben.</p>
          </>
        )}
        {fehler && <p className="meldung fehler">{fehler}</p>}
      </div>
    </section>
  );
}
