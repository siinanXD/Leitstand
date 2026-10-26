import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Register der Figma-Bilder im Leitstand (SIN-1038): `docs/figma-ansichten.json`. */
export const ARTEN = ["diagramm", "contentplan", "entscheidung"] as const;
export type Art = (typeof ARTEN)[number];
export type Ansicht = { titel: string; datei: string; node: string; art: Art; produkt: string };

const NODE = /^\d+:\d+$/;
const DATEI = /^[0-9A-Za-z]+$/;
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Prüft das Register; wirft mit dem ersten Fehler (Pflichtfelder, gültige Node-ID, keine Doppelten). */
export function pruefeRegister(roh: unknown): Ansicht[] {
  const liste = (roh as { ansichten?: unknown } | null)?.ansichten;
  if (!Array.isArray(liste)) throw new Error("Register: Feld ansichten fehlt");
  const gesehen = new Set<string>();
  return liste.map((e: Record<string, unknown>, i) => {
    const wo = `Register-Eintrag ${i + 1}`;
    if (!text(e?.titel) || !text(e.datei) || !text(e.node) || !text(e.art) || !text(e.produkt)) throw new Error(`${wo}: Pflichtfeld fehlt`);
    if (!NODE.test(e.node)) throw new Error(`${wo}: Node-ID "${e.node}" ungültig`);
    if (!DATEI.test(e.datei)) throw new Error(`${wo}: Datei-Schlüssel ungültig`);
    if (!(ARTEN as readonly string[]).includes(e.art)) throw new Error(`${wo}: Art "${e.art}" unbekannt`);
    const schluessel = `${e.datei}/${e.node}`;
    if (gesehen.has(schluessel)) throw new Error(`${wo}: ${schluessel} doppelt`);
    gesehen.add(schluessel);
    return { titel: e.titel, datei: e.datei, node: e.node, art: e.art as Art, produkt: e.produkt };
  });
}

export const leseRegister = (pfad = join(process.cwd(), "docs/figma-ansichten.json")): Ansicht[] => pruefeRegister(JSON.parse(readFileSync(pfad, "utf8")));

export const figmaLink = (a: Pick<Ansicht, "datei" | "node">) => `https://www.figma.com/design/${a.datei}?node-id=${a.node.replace(":", "-")}`;
