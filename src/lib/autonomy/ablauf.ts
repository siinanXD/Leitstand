// Rollen-Ablauf aus docs/autonomy/agents.json (SIN-543). Rein: aus dem Register wird Mermaid erzeugt, nie von Hand gezeichnet.
export type Rolle = { id: string; name: string; skill: string; aufgabe: string; ausloeser: string[]; netz: string | null; werkzeuge: string[]; ruft: string[];
  /** SIN-637: Pflicht, eine messbare Kennzahl mit Ziel. Das Ereignis meldet den Zielerreichungsgrad (0 bis 1). */
  wirkung: { kennzahl: string; ziel: string };
};
export type Register = { stand: string; quelle: string; spuren: { id: string; name: string }[]; rollen: Rolle[] };

/** Mermaid ist empfindlich gegen Anführungszeichen und Zeilenumbrüche; Register-Text wird entschärft. */
const text = (s: string) => s.replace(/["\r\n|]/g, " ");

/** Meldet doppelte Kennungen, Rollen ohne Auslöser oder Werkzeuge und Verweise auf unbekannte Rollen. */
export function registerFehler(r: Register): string[] {
  const ids = new Set(r.rollen.map((x) => x.id));
  const fehler: string[] = [];
  if (ids.size !== r.rollen.length) fehler.push("doppelte Rollen-Kennung");
  for (const x of r.rollen) {
    if (x.ausloeser.length === 0) fehler.push(`${x.id}: kein Auslöser`);
    if (x.werkzeuge.length === 0) fehler.push(`${x.id}: keine Werkzeuge`);
    if (!x.wirkung?.kennzahl || !x.wirkung?.ziel) fehler.push(`${x.id}: keine Wirkung (Kennzahl mit Ziel)`);
    for (const z of x.ruft) if (!ids.has(z)) fehler.push(`${x.id} ruft unbekannte Rolle ${z}`);
  }
  return fehler;
}

export function ablaufMarkdown(r: Register): string {
  const knoten = r.rollen.map((x) => `  ${x.id}["${text(x.name)}"]`);
  const kanten = r.rollen.flatMap((x) => x.ruft.map((z) => `  ${x.id} --> ${z}`));
  const tabelle = r.rollen.map((x) => `| ${text(x.name)} | ${x.ausloeser.map(text).join("; ")} | ${x.netz ? text(x.netz) : "keins"} | ${x.werkzeuge.map(text).join(", ")} |`);
  return [
    "# Ablauf",
    "",
    `Erzeugt aus \`docs/autonomy/agents.json\` (Stand ${r.stand}) mit \`npx tsx scripts/autonomy/ablauf.ts\`. Nicht von Hand ändern.`,
    "",
    "```mermaid",
    "flowchart LR",
    ...knoten,
    ...kanten,
    "```",
    "",
    `Bau-Spuren: ${r.spuren.map((s) => s.name).join(", ")}.`,
    "",
    "| Rolle | Auslöser | Sicherheitsnetz | Werkzeuge |",
    "| -- | -- | -- | -- |",
    ...tabelle,
    "",
  ].join("\n");
}
