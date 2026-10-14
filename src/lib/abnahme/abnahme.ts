// Abnahme-Proben (SIN-626). Rein, ohne Netz: scripts/abnahme/abnahme.ts holt die Messwerte, hier wird bewertet.
// Jede Probe prüft von außen, ob eine Funktion wirklich läuft (nicht nur, ob Code gemergt ist).

export const SCHRITT = "abnahme";
/** Rot länger als das löst den Alarm aus. */
export const ALARM_NACH_MS = 2 * 3_600_000;

export type Art = "http" | "db" | "datei" | "github";
export type Probe = { id: string; produkt: string; titel: string; art: Art; [feld: string]: string };
export type Ergebnis = { ok: boolean; grund: string };

const ARTEN: readonly string[] = ["http", "db", "datei", "github"];

/**
 * Liest docs/abnahme.yml: eine Liste flacher Einträge `- schluessel: wert` (Text einzeilig, `#` am Zeilenanfang = Kommentar).
 * shortcut: kein volles YAML (keine Verschachtelung), bei Bedarf `yaml` als Abhängigkeit nehmen.
 */
export function parseProben(text: string): Probe[] {
  const proben: Record<string, string>[] = [];
  for (const roh of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(roh)) continue;
    const m = /^(\s*)(- )?([a-z_]+):\s*(.*?)\s*$/.exec(roh);
    if (!m) throw new Error(`abnahme.yml: Zeile nicht lesbar: ${roh}`);
    if (m[2]) proben.push({});
    if (!proben.length) throw new Error(`abnahme.yml: Eintrag ohne „- “: ${roh}`);
    proben[proben.length - 1][m[3]] = m[4].replace(/^(["'])(.*)\1$/, "$2");
  }
  const ids = new Set<string>();
  return proben.map((p) => {
    for (const pflicht of ["id", "produkt", "titel", "art"]) if (!p[pflicht]) throw new Error(`abnahme.yml: „${pflicht}“ fehlt (${p.id ?? p.titel ?? "?"})`);
    if (!ARTEN.includes(p.art)) throw new Error(`abnahme.yml: Art „${p.art}“ unbekannt (${p.id})`);
    if (ids.has(p.id)) throw new Error(`abnahme.yml: id „${p.id}“ doppelt`);
    ids.add(p.id);
    return p as Probe;
  });
}

/** Ersetzt `${NAME}` aus der Umgebung; fehlt ein Wert, ist die Probe nicht prüfbar (Fehler, nie grün). */
export function einsetzen(text: string, env: Readonly<Record<string, string | undefined>>): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
    const wert = env[name];
    if (!wert) throw new Error(`${name} fehlt`);
    return wert;
  });
}

const leer = (v: unknown) => v == null || v === "" || (typeof v === "object" && Object.keys(v).length === 0);

/**
 * Bewertet Zeilen einer lesenden Abfrage: `mindestens` Zeilen (Standard 1), `zeitfeld` nicht älter als `max_alter_min`
 * (Standard 60), `nicht_leer` = Feld mit Inhalt (Text, Liste oder Objekt mit mindestens einem Eintrag).
 */
export function bewerteZeilen(probe: Probe, zeilen: unknown, jetzt: number): Ergebnis {
  if (!Array.isArray(zeilen)) return { ok: false, grund: "Antwort ist keine Liste" };
  const mindestens = Number(probe.mindestens ?? 1);
  if (zeilen.length < mindestens) return { ok: false, grund: `${zeilen.length} Zeilen, erwartet mindestens ${mindestens}` };
  const wert = (z: unknown, feld: string) => (z as Record<string, unknown> | null)?.[feld];
  if (probe.zeitfeld) {
    const minuten = Number(probe.max_alter_min ?? 60);
    const zeiten = zeilen.map((z) => Date.parse(String(wert(z, probe.zeitfeld) ?? ""))).filter(Number.isFinite);
    if (zeiten.length === 0) return { ok: false, grund: `${probe.zeitfeld} fehlt` };
    if (jetzt - Math.max(...zeiten) > minuten * 60_000) return { ok: false, grund: `${probe.zeitfeld} älter als ${minuten} Minuten` };
  }
  if (probe.nicht_leer && !zeilen.some((z) => !leer(wert(z, probe.nicht_leer!)))) return { ok: false, grund: `${probe.nicht_leer} ist leer` };
  return { ok: true, grund: "ok" };
}

/** Bewertet Text (Datei oder Antwort): muss `enthaelt` enthalten, falls angegeben. */
export function bewerteText(probe: Probe, text: string): Ergebnis {
  return !probe.enthaelt || text.includes(probe.enthaelt) ? { ok: true, grund: "ok" } : { ok: false, grund: `„${probe.enthaelt}“ fehlt` };
}

/** Zeile für `loop_events`: Schritt abnahme, `issue` trägt den Titel der Probe (so liest ihn die Seite ohne weitere Abfrage). */
export function ereignisZeile(p: Probe, e: Ergebnis, runId: string | null, runUrl: string | null) {
  return { project: p.produkt, agent: "betrieb", step: SCHRITT, status: e.ok ? "ok" : "failed", issue: p.titel, pr: null, run_id: runId, run_url: runUrl };
}

type Zeile = { project: string | null; step: string | null; status: string | null; issue: string | null; created_at: string };
export type Stand = { produkt: string; titel: string; ok: boolean; zeit: number; rotSeit: number | null };

/** Jüngstes Ergebnis je Probe (beliebige Reihenfolge der Ereignisse) und seit wann sie ununterbrochen rot ist. */
export function staende(ereignisse: readonly Zeile[]): Stand[] {
  const je = new Map<string, { ok: boolean; zeit: number }[]>();
  const kopf = new Map<string, { produkt: string; titel: string }>();
  for (const e of ereignisse) {
    const zeit = Date.parse(e.created_at);
    if (e.step !== SCHRITT || !e.issue || !e.project || !Number.isFinite(zeit)) continue;
    const k = `${e.project}\n${e.issue}`;
    kopf.set(k, { produkt: e.project, titel: e.issue });
    je.set(k, [...(je.get(k) ?? []), { ok: e.status === "ok", zeit }]);
  }
  return [...je].map(([k, liste]) => {
    const neu = liste.sort((a, b) => b.zeit - a.zeit);
    const gruen = neu.findIndex((m) => m.ok);
    const rot = neu.slice(0, gruen === -1 ? neu.length : gruen);
    return { ...kopf.get(k)!, ok: neu[0].ok, zeit: neu[0].zeit, rotSeit: neu[0].ok ? null : rot[rot.length - 1].zeit };
  });
}

/**
 * Alarme für Proben, die länger als `ALARM_NACH_MS` rot sind. Die Kennung trägt den Tag des Rot-Beginns:
 * ein Alarm je Rot-Phase, bei mehr als 24 h Rot (Fenster der Ereignisse) höchstens einer je Tag.
 */
export function alarmeAus(ereignisse: readonly Zeile[], jetzt: number) {
  return staende(ereignisse)
    .filter((s) => s.rotSeit !== null && jetzt - s.rotSeit > ALARM_NACH_MS)
    .map((s) => ({ id: `alarm:abnahme:${s.produkt}:${s.titel}:${new Date(s.rotSeit!).toISOString().slice(0, 10)}`, art: "alarm" as const, projekt: s.produkt, kennung: "Abnahme", titel: `Probe rot: ${s.titel}`, zeit: s.rotSeit! }));
}
