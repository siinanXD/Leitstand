/**
 * Diagnose-Agent (SIN-907). Rein, kein Netz: Auslöser wählen, Ausgabe prüfen, Linear-Kommentar bauen.
 * Das Urteil (Ursache, Beleg, Art) kommt vom Agenten nach docs/skills/diagnose/SKILL.md; Statusänderungen macht nie er,
 * sondern der Dispatcher anhand von `art` (`folge`).
 */
// shortcut: Schema liegt in docs/diagnose, nicht in docs/schemas, weil die Rollen-Schemas dort den Kopf der registrierten Rollen (agents.json) tragen müssen; bei Aufnahme ins Register umziehen.
import schema from "../../../docs/diagnose/schema.json";
import { pruefeSchema, type Schema } from "../autonomy/schema";

export const SPERRE_STUNDEN = 6;
export const MIN_LAEUFE_OHNE_PR = 2;
export const SCHRITT = "diagnose";

export type Ereignis = { created_at: string; step: string; status: string; issue: string | null; pr: number | null; grund?: string | null; run_url?: string | null };
export type Ziel = { schluessel: string; art: "issue" | "workflow"; issue?: string; beleg: string[] };

export type Art = "code" | "lauf" | "sinan" | "erledigt";
export type Diagnose = { rolle: "diagnose"; ziel: string; zeitpunkt: string; ursache: string; beleg: string[]; art: Art; vorschlag: string };

const stunden = (von: string, bis: Date) => (bis.getTime() - Date.parse(von)) / 3_600_000;

/** Eine Diagnose je Ziel und Sperrfrist: `diagnose`-Ereignisse tragen das Ziel im `issue`-Feld oder als Präfix `<Ziel>:` im `grund`. */
function kuerzlichDiagnostiziert(ereignisse: Ereignis[], schluessel: string, jetzt: Date): boolean {
  return ereignisse.some(
    (e) => e.step === SCHRITT && (e.issue === schluessel || e.grund?.startsWith(`${schluessel}:`)) && stunden(e.created_at, jetzt) < SPERRE_STUNDEN,
  );
}

/** Issues mit mindestens 2 beendeten Worker-Läufen ohne PR (und ohne späteren Lauf mit PR), je Issue höchstens eine Diagnose in 6 h. */
export function issueAusloeser(ereignisse: Ereignis[], jetzt: Date): Ziel[] {
  const nachIssue = new Map<string, Ereignis[]>();
  for (const e of ereignisse) if (e.step === "worker" && e.issue) nachIssue.set(e.issue, [...(nachIssue.get(e.issue) ?? []), e]);
  const ziele: Ziel[] = [];
  for (const [issue, liste] of nachIssue) {
    const beendet = liste.filter((e) => e.status !== "start").sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const ohnePr: Ereignis[] = [];
    for (const e of beendet) {
      if (e.pr) ohnePr.length = 0;
      else ohnePr.push(e);
    }
    if (ohnePr.length < MIN_LAEUFE_OHNE_PR || kuerzlichDiagnostiziert(ereignisse, issue, jetzt)) continue;
    ziele.push({ schluessel: issue, art: "issue", issue, beleg: ohnePr.map((e) => e.run_url ?? `${e.created_at} ${e.status}: ${e.grund ?? "ohne Grund"}`) });
  }
  return ziele;
}

/** Ein roter Workflow-Lauf, höchstens eine Diagnose je Workflow in 6 h. */
export function workflowAusloeser(name: string, runUrl: string, ereignisse: Ereignis[], jetzt: Date): Ziel | null {
  const schluessel = `workflow:${name}`;
  return kuerzlichDiagnostiziert(ereignisse, schluessel, jetzt) ? null : { schluessel, art: "workflow", beleg: [runUrl] };
}

/** Schema-Prüfung plus fachliche Regel: `erledigt` braucht mindestens zwei Belege (sonst wäre es nur eine Behauptung). Leere Liste = gültig. */
export function pruefeDiagnose(roh: unknown): string[] {
  const f = pruefeSchema(roh, schema as Schema);
  if (f.length) return f;
  const d = roh as Diagnose;
  return d.art === "erledigt" && d.beleg.length < 2 ? ["$.beleg: art erledigt braucht mindestens 2 Belege"] : [];
}

/** Was der Dispatcher nach festen Regeln aus `art` macht. Der Agent selbst ändert keinen Status. */
export const folge: Record<Art, string> = {
  code: "Reparatur-Issue vom Planer zerlegen lassen",
  lauf: "Lauf oder Workflow neu anstoßen bzw. Konfiguration korrigieren (kein Code-Worker)",
  sinan: "Sinan-Aufgabe (Label sinan) anlegen, Original bleibt In Review",
  erledigt: "Done vorschlagen; Dispatcher setzt Done erst, wenn die Abnahme-Probe grün ist",
};

export function kommentar(d: Diagnose): string {
  return [
    `**Diagnose (${d.art})** für ${d.ziel}`,
    "",
    `**Ursache:** ${d.ursache}`,
    "",
    "**Belege:**",
    ...d.beleg.map((b) => `- ${b}`),
    "",
    `**Vorschlag:** ${d.vorschlag}`,
    `**Weiter:** ${folge[d.art]}`,
  ].join("\n");
}
