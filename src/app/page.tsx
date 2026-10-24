"use client";

import { useSitzung } from "@/lib/sitzung";
import { FliessbandStart } from "./fliessband/start";
import { Rahmen } from "./rahmen";

/** Startseite = Fließband (SIN-815, Figma M1 98:2 und D1 99:45). Die ausführliche Übersicht liegt unter /details. */
export default function Home() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  return <Rahmen aktiv="uebersicht">{(quelle, jetzt) => <FliessbandStart quelle={quelle} jetzt={jetzt} angemeldet={angemeldet} />}</Rahmen>;
}
