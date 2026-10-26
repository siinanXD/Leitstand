import { leseRegister } from "@/lib/figma-ansichten/figma-ansichten";
import { Rahmen } from "../rahmen";
import { Bild } from "./bild";
import "../freigabe.css";

export const dynamic = "force-dynamic";

/** Figma-Bilder (SIN-1038): je Registereintrag das aktuelle PNG, geladen über /api/figma-bild. */
export default function Bilder() {
  const ansichten = leseRegister();
  return (
    <Rahmen aktiv="bilder">
      {() => (
        <main className="seite freigabe">
          <header className="freigabe-kopf">
            <p className="augenbraue">Figma</p>
            <h1>Bilder</h1>
          </header>
          {ansichten.length === 0 ? (
            <p className="leer">Keine Bilder eingetragen</p>
          ) : (
            <ul className="bereiche">
              {ansichten.map((a) => (
                <Bild key={`${a.datei}/${a.node}`} ansicht={a} />
              ))}
            </ul>
          )}
        </main>
      )}
    </Rahmen>
  );
}
