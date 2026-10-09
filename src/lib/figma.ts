/**
 * Figma-Lesezugriff für Worker (SIN-428). Nur lesen, Token `FIGMA_ACCESS_TOKEN`.
 * Rein: Netz kommt als `fetchImpl` herein, damit die Logik testbar bleibt. Vorbild: Lern-App `scripts/autonomy/figma.mjs` (SIN-239).
 */

export const DEFAULT_FILE_KEY = "7Ti9iVUjUjw3rh9WYhSu9K";
export const NICHT_VERFUEGBAR = "nicht verfügbar (FIGMA_ACCESS_TOKEN fehlt)";

type Farbe = { r: number; g: number; b: number; a?: number };
type Paint = { type: string; visible?: boolean; color?: Farbe; opacity?: number };
export type FigmaKnoten = {
  name: string;
  type: string;
  characters?: string;
  absoluteBoundingBox?: { width: number; height: number };
  fills?: Paint[];
  strokes?: Paint[];
  style?: { fontFamily?: string; fontWeight?: number; fontSize?: number; lineHeightPx?: number };
  children?: FigmaKnoten[];
  [k: string]: unknown;
};
export type Werte = {
  name: string;
  type: string;
  size?: string;
  fills?: string[];
  strokes?: string[];
  text?: string;
  font?: string;
  children?: Werte[];
  [k: string]: unknown;
};
type Env = Record<string, string | undefined>;
type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

const zwei = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
export const hex = (c: Farbe, opacity = 1) => {
  const a = (c.a ?? 1) * opacity;
  return `#${zwei(c.r)}${zwei(c.g)}${zwei(c.b)}${a < 1 ? zwei(a) : ""}`.toUpperCase();
};
const volltoene = (p?: Paint[]) =>
  (p ?? []).filter((f) => f.type === "SOLID" && f.visible !== false && f.color).map((f) => hex(f.color!, f.opacity ?? 1));

/** Wesentliche Werte eines Knotens (rekursiv): Name, Typ, Größe, Abstände, Rundung, Farben, Text, Schrift. */
export function werteAus(k: FigmaKnoten): Werte {
  const out: Werte = { name: k.name, type: k.type };
  if (k.absoluteBoundingBox) out.size = `${k.absoluteBoundingBox.width}x${k.absoluteBoundingBox.height}`;
  for (const f of ["itemSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "cornerRadius", "strokeWeight"]) {
    if (typeof k[f] === "number") out[f] = k[f];
  }
  const fills = volltoene(k.fills);
  if (fills.length) out.fills = fills;
  const strokes = volltoene(k.strokes);
  if (strokes.length) out.strokes = strokes;
  if (k.type === "TEXT") {
    out.text = k.characters;
    if (k.style) out.font = `${k.style.fontFamily} ${k.style.fontWeight} ${k.style.fontSize}/${k.style.lineHeightPx}`;
  }
  if (k.children?.length) out.children = k.children.map(werteAus);
  return out;
}

async function holeJson(pfad: string, env: Env, fetchImpl: Fetch): Promise<unknown | null> {
  if (!env.FIGMA_ACCESS_TOKEN) return null;
  const res = await fetchImpl(`https://api.figma.com/v1/${pfad}`, { headers: { "X-Figma-Token": env.FIGMA_ACCESS_TOKEN } });
  if (!res.ok) throw new Error(`Figma HTTP ${res.status}`);
  return res.json();
}

/** Werte eines Knotens (`35:2`); `null` ohne Token. */
export async function knotenWerte(fileKey: string, nodeId: string, env: Env, fetchImpl: Fetch): Promise<Werte | null> {
  const json = (await holeJson(`files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`, env, fetchImpl)) as
    | { nodes?: Record<string, { document?: FigmaKnoten }> }
    | null;
  if (!json) return null;
  const doc = json.nodes?.[nodeId]?.document;
  if (!doc) throw new Error(`Knoten ${nodeId} nicht gefunden`);
  return werteAus(doc);
}

/** PNG eines Knotens als Bytes (Maßstab 1); `null` ohne Token. */
export async function knotenBild(fileKey: string, nodeId: string, env: Env, fetchImpl: Fetch): Promise<Uint8Array | null> {
  const json = (await holeJson(`images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`, env, fetchImpl)) as
    | { images?: Record<string, string | null> }
    | null;
  if (!json) return null;
  const url = json.images?.[nodeId];
  if (!url) throw new Error(`Kein Bild für Knoten ${nodeId}`);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Figma-Bild HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
