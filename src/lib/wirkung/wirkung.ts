// Ergebnis-Kennzahl je Rolle (SIN-637). Rein. „ok“ zählt nicht, nur Wirkung: jede Rolle meldet bei jedem Lauf ein Ereignis in `loop_events`
// mit `agent`, `wirkung` (Zielerreichung 0 bis 1, Kennzahl und Ziel stehen in docs/autonomy/agents.json) und `grund`.
// Ohne Ereignis in 48 Stunden gilt die Rolle als „läuft nicht“. 14 Tage ohne Wirkung (> 0): die Rolle pausiert.
// Die Pause ist ein Ereignis wie bei `pause.ts`; `loop_events.status` erlaubt nur start|ok|fehler|uebersprungen: uebersprungen = pausiert, ok = wieder an.

export const PAUSE_SCHRITT = "ROLLE_PAUSE";
export const LAUF_FRIST_MS = 48 * 3_600_000;
export const PAUSE_NACH_MS = 14 * 24 * 3_600_000;
export const WOCHE_MS = 7 * 24 * 3_600_000;
/** Vor diesem Tag schrieb keine Rolle Wirkung; die 14 Tage zählen erst ab hier (sonst pausierten alle Rollen am ersten Tag). */
export const WIRKUNG_AB = Date.parse("2026-10-15T00:00:00Z");

/** SIN-627 Fokus: bis die Lern-App v1 steht, ruhen diese Rollen (Zeitplan aus, `workflow_dispatch` bleibt). Der Knopf „Wieder anschalten“ hebt es auf. */
export const FOKUS_AB = Date.parse("2026-10-14T00:00:00Z");
export const FOKUS_PAUSE: readonly string[] = ["marketing", "trend", "visionaer"];
export const FOKUS_GRUND = "pausiert bis MAF v1";

export type RollenEreignis = { agent: string | null; step: string | null; status: string | null; created_at: string; wirkung?: number | null; cost?: number | null; grund?: string | null };
export type Rolle = { id: string; name: string };

export type RollenStand = {
  id: string;
  name: string;
  letzterLauf: string | null;
  /** Ereignis in den letzten 48 Stunden. */
  laeuft: boolean;
  /** Mittel der Wirkung der letzten 7 Tage (0 bis 1); null ohne Messwert. */
  wirkung: number | null;
  /** Schulnote 1 bis 6; null ohne Messwert. */
  note: number | null;
  kosten7d: number | null;
  pausiert: boolean;
  /** Warum die Rolle ruht; null, wenn sie läuft. */
  grund: string | null;
};

const zeit = (e: RollenEreignis) => Date.parse(e.created_at);
const istZahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const istPause = (e: RollenEreignis) => e.step?.toUpperCase() === PAUSE_SCHRITT;

/** Zielerreichung 0 bis 1 → Note 1 (Ziel erreicht) bis 6 (keine Wirkung). */
export const note = (wirkung: number): number => 1 + Math.round((1 - Math.min(1, Math.max(0, wirkung))) * 5);

/** Jüngstes Pause-Ereignis der Rolle entscheidet; fehlt es, läuft die Rolle. */
function pausiert(id: string, eigene: RollenEreignis[]): string | null {
  const fokus = FOKUS_PAUSE.includes(id);
  let jung: RollenEreignis | null = null;
  for (const e of eigene) if (istPause(e) && (!fokus || zeit(e) >= FOKUS_AB) && (!jung || zeit(e) > zeit(jung))) jung = e;
  if (!jung) return fokus ? FOKUS_GRUND : null;
  return jung.status === "uebersprungen" ? (jung.grund ?? "pausiert") : null;
}

export function rollenStand(rollen: readonly Rolle[], events: readonly RollenEreignis[], jetzt: number): RollenStand[] {
  return rollen.map((r) => {
    const eigene = events.filter((e) => e.agent === r.id);
    const laeufe = eigene.filter((e) => !istPause(e));
    const letzter = laeufe.reduce<RollenEreignis | null>((a, e) => (!a || zeit(e) > zeit(a) ? e : a), null);
    const woche = laeufe.filter((e) => jetzt - zeit(e) <= WOCHE_MS);
    const werte = woche.map((e) => e.wirkung).filter(istZahl);
    const kosten = woche.map((e) => e.cost).filter(istZahl);
    const grund = pausiert(r.id, eigene);
    const wirkung = werte.length > 0 ? werte.reduce((s, v) => s + v, 0) / werte.length : null;
    return {
      id: r.id,
      name: r.name,
      letzterLauf: letzter?.created_at ?? null,
      laeuft: letzter !== null && jetzt - zeit(letzter) <= LAUF_FRIST_MS,
      wirkung,
      note: wirkung === null ? null : note(wirkung),
      kosten7d: kosten.length > 0 ? kosten.reduce((s, v) => s + v, 0) : null,
      pausiert: grund !== null,
      grund,
    };
  });
}

/** Rollen, die jetzt zu pausieren sind: 14 Tage (frühestens ab WIRKUNG_AB) ohne ein Ereignis mit Wirkung über 0, noch nicht pausiert. */
export function zuPausieren(rollen: readonly Rolle[], events: readonly RollenEreignis[], jetzt: number): string[] {
  if (jetzt - WIRKUNG_AB < PAUSE_NACH_MS) return [];
  const stand = new Map(rollenStand(rollen, events, jetzt).map((s) => [s.id, s]));
  return rollen
    .filter((r) => !stand.get(r.id)?.pausiert)
    .filter((r) => !events.some((e) => e.agent === r.id && !istPause(e) && istZahl(e.wirkung) && e.wirkung > 0 && jetzt - zeit(e) <= PAUSE_NACH_MS))
    .map((r) => r.id);
}

const zeile = (agent: string, status: "uebersprungen" | "ok", grund: string) => ({ project: "leitstand", agent, step: PAUSE_SCHRITT, status, grund, issue: null, pr: null });
export const pauseZeile = (agent: string, name: string) => zeile(agent, "uebersprungen", `${name} pausiert: 14 Tage ohne Wirkung.`);
export const weiterZeile = (agent: string) => zeile(agent, "ok", "Von Sinan wieder angeschaltet.");

/** Push an Sinan mit Begründung: ein Alarm je Pause (die Kennung trägt den Zeitpunkt), Form wie `alarmeAus` der Abnahme. */
export function pausenAlarme(events: readonly RollenEreignis[], jetzt: number) {
  return events
    .filter((e) => istPause(e) && e.status === "uebersprungen" && e.agent && jetzt - zeit(e) <= 24 * 3_600_000)
    .map((e) => ({ id: `alarm:rolle-pause:${e.agent}:${e.created_at}`, art: "alarm" as const, projekt: "Leitstand", kennung: "Rolle pausiert", titel: `${e.grund ?? `${e.agent} pausiert`} Wieder anschalten unter „Mein Team“.`, zeit: zeit(e), url: "/team" }));
}

export const rolleEingabe = (body: unknown, erlaubt: readonly string[]): string | null => {
  const v = body && typeof body === "object" ? (body as Record<string, unknown>).agent : undefined;
  return typeof v === "string" && erlaubt.includes(v) ? v : null;
};
