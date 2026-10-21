/**
 * SIN-896: Bereichs-Spuren. Der Planer zerlegt ein Vorhaben in Issues je Bereich, jedes mit Label und `worker-pfade`.
 * Gemeinsame Dateien (Abnahme, Lehren) liegen je Issue in eigenen Dateien, damit Bereiche nicht kollidieren.
 */
export const BEREICHE = ["schnittstelle", "backend", "frontend", "infra"] as const;
export type Bereich = (typeof BEREICHE)[number];

/** Feste Zuordnung Bereich → Ordner; `<modul>` ist der Modulname des Vorhabens. */
const ORDNER: Record<Bereich, string[]> = {
  frontend: ["src/app/<modul>", "src/components/<modul>"],
  backend: ["src/lib/<modul>", "scripts/<modul>"],
  schnittstelle: ["src/lib/typen/<modul>", "docs/api/<modul>"],
  infra: [".github", "scripts/loop"],
};

export const abnahmeDatei = (issue: string) => `docs/abnahme/${issue}.yml`;
export const lehrenDatei = (issue: string) => `docs/lehren/${issue}.md`;

export const bereichVon = (labels: readonly string[]): Bereich | null => {
  const l = labels.map(x => x.toLowerCase());
  return BEREICHE.find(b => l.includes(b)) ?? null;
};

export type Vorhaben = { id: string; titel: string; modul: string; frontend?: boolean; backend?: boolean; schnittstelle?: boolean; infra?: boolean };
export type GeplantesIssue = { schluessel: string; titel: string; bereich: Bereich; labels: string[]; pfade: string[]; blockiertVon: string[] };

const MODUL = /^[a-z][a-z0-9-]*$/;

export function pfadeFuer(bereich: Bereich, modul: string, issue: string): string[] {
  if (!MODUL.test(modul)) throw new Error(`Modulname ungültig: ${modul}`);
  return [...ORDNER[bereich].map(o => o.replace("<modul>", modul)), abnahmeDatei(issue), lehrenDatei(issue)];
}

/**
 * Zerlegt ein Vorhaben: Brauchen Frontend und Backend denselben Vertrag, kommt zuerst `schnittstelle`
 * (Typen und Mock); Frontend und Backend hängen daran und laufen danach parallel.
 */
export function planeVorhaben(v: Vorhaben): GeplantesIssue[] {
  const vertrag = v.schnittstelle ?? (!!v.frontend && !!v.backend);
  const wahl = BEREICHE.filter(b => (b === "schnittstelle" ? vertrag : !!v[b]));
  return wahl.map(bereich => {
    const schluessel = `${v.id}-${bereich}`;
    const nachVertrag = vertrag && (bereich === "frontend" || bereich === "backend");
    return {
      schluessel,
      titel: `${v.titel} (${bereich})`,
      bereich,
      labels: ["claude", bereich],
      pfade: pfadeFuer(bereich, v.modul, schluessel),
      blockiertVon: nachVertrag ? [`${v.id}-schnittstelle`] : [],
    };
  });
}

export const pfadeBlock = (pfade: string[]) => `<!-- worker-pfade: ${JSON.stringify(pfade)} -->`;
