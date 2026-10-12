"use client";

import { useSitzung } from "@/lib/sitzung";
import { Kopf } from "../kopf";
import { Kopplung } from "../kopplung";
import { Mitteilungen } from "../mitteilungen";

export default function Einstellungen() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  return (
    <>
      <Kopf angemeldet={angemeldet} aktiv="einstellungen" />
      <main className="anmelden">
        <h1 className="mono-label">Einstellungen</h1>
        {angemeldet && <Mitteilungen />}
        {angemeldet && <Kopplung />}
      </main>
    </>
  );
}
