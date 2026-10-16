// Projekt-Konfiguration (SIN-305). Neue Projekte kommen aus der Konfiguration des Projekt-Starters (SIN-202);
// Projekte, die nur in den Daten auftauchen, erscheinen trotzdem mit neutraler Marke.

export type Projekt = {
  id: string;
  name: string;
  /** CSS-Variable der Projektfarbe: nur Streifen/Marke, nie Status. */
  farbe: string;
  /** GitHub-Repo für Links auf PRs, falls bekannt. */
  repo?: string;
  /** Name des Linear-Projekts (SIN-763): Mit `repo` und `bauphase` baut der Dispatcher dort Issues mit Label `claude`. */
  linearProjekt?: string;
  /** Projekte in Bauphase haben bei der Platzvergabe Vorrang. */
  bauphase?: boolean;
  /** Bekannte Adressen (SIN-531): nur eintragen, was es wirklich gibt; fehlende Links zeigt die Seite als „nicht verfügbar“. */
  links?: Partial<Record<LinkArt, string>>;
};

export const LINK_ARTEN = ["app", "vorschau", "github", "linear", "vercel", "supabase", "langfuse", "sentry", "posthog", "figma"] as const;
export type LinkArt = (typeof LINK_ARTEN)[number];

export const PROJEKTE: Projekt[] = [
  { id: "lernapp", name: "Lern-App", farbe: "var(--color-projekt-lernapp)", repo: "siinanXD/Content-Agent-Lernapp" },
  { id: "leitstand", name: "Leitstand", farbe: "var(--color-projekt-leitstand)", repo: "siinanXD/Leitstand", linearProjekt: "Leitstand", bauphase: true, links: { figma: "https://www.figma.com/design/7Ti9iVUjUjw3rh9WYhSu9K" } },
  // shortcut: neutrale Farbe, eigene Projektfarbe braucht ein Design-Issue; ausbauen, sobald es ein Token gibt
  { id: "sjcode-website", name: "SJCODE Website", farbe: "var(--color-border-subtle)", repo: "siinanXD/SJCODE-website", linearProjekt: "SJCODE Website", bauphase: true, links: { app: "https://sjcode.de" } },
  { id: "beleg", name: "Beleg-Assistent", farbe: "var(--color-projekt-beleg)", bauphase: true },
  { id: "stoerung", name: "Störungs-Assistent", farbe: "var(--color-projekt-stoerung)", bauphase: true },
];

export type LoopZiel = { id: string; repo: string; linearProjekt: string };

/** Produkte, in denen der Dispatcher baut (SIN-763): Repo, Linear-Projekt und Bauphase gesetzt. */
export const loopZiele = (liste: Projekt[] = PROJEKTE): LoopZiel[] =>
  liste.flatMap((p) => (p.repo && p.linearProjekt && p.bauphase ? [{ id: p.id, repo: p.repo, linearProjekt: p.linearProjekt }] : []));

const NEUTRAL = "var(--color-border-subtle)";

export function projektInfo(id: string, liste: Projekt[] = PROJEKTE): Projekt {
  return liste.find((p) => p.id === id) ?? { id, name: id, farbe: NEUTRAL };
}

/** Konfigurierte Projekte plus alle, die in den Daten vorkommen (neue erscheinen automatisch). */
export function alleProjekte(ids: Iterable<string>, liste: Projekt[] = PROJEKTE): Projekt[] {
  const gesehen = new Set(ids);
  const bekannt = liste.filter((p) => gesehen.has(p.id));
  const unbekannt = [...gesehen]
    .filter((id) => !liste.some((p) => p.id === id))
    .sort()
    .map((id) => projektInfo(id, liste));
  return [...bekannt, ...unbekannt];
}

/** Dispatcher-Regel, im Ablauf sichtbar. */
export const DISPATCHER_REGEL = "Plätze nach Priorität, Projekte in Bauphase haben Vorrang.";

export function platzReihenfolge(ids: string[], liste: Projekt[] = PROJEKTE): string[] {
  const rang = (id: string) => {
    const i = liste.findIndex((p) => p.id === id);
    return i < 0 ? liste.length : i;
  };
  const bau = (id: string) => (projektInfo(id, liste).bauphase ? 0 : 1);
  return [...ids].sort((a, b) => bau(a) - bau(b) || rang(a) - rang(b) || a.localeCompare(b));
}

export const nurProjekt = <T extends { project: string | null }>(zeilen: T[], filter: string | null): T[] => (filter ? zeilen.filter((z) => z.project === filter) : zeilen);
