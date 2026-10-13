// Visionär (SIN-573): teilt ein Produkt in Versionen. Rein, kein Netz. `scripts/visionaer/visionaer.ts` schreibt.
// Der Stand einer Version steht als `loop_events`-Ereignis (Schritt VERSION, Name im Feld `grund`), wie die Pause (SIN-530): kein neuer Speicher.

export const VORSCHLAEGE = ["naechste_version", "pause", "abschliessen"] as const;
export type Vorschlag = (typeof VORSCHLAEGE)[number];

export const SCHRITT = "VERSION";
/** pause: CEO meldet `fertig`, Dispatcher steht. vorschlag: Visionär hat geliefert, wartet auf „go“. go: Sinan hat freigegeben. fertig: Version abgeschlossen. */
export const STATI = ["pause", "vorschlag", "go", "fertig"] as const;
export type Status = (typeof STATI)[number];
/** Fokus-Regel: Eine freigegebene Version hält die anderen Produkte höchstens so lange auf Reparaturen. */
export const FOKUS_TAGE = 14;
export const MIN_PUNKTE = 3;
export const MAX_PUNKTE = 7;

export type Version = { name: string; ziel: string; fertig_punkte: string[]; nicht_ziele: string[]; tage: number; voraussetzung: string; nur_fehler: boolean; idee_issues: string[] };
export type Stand = { produkt: string; status: Status; name: string; seit: string };

/** Jüngster VERSION-Stand je Produkt; Unlesbares fällt weg. */
export function staende(raw: unknown): Stand[] {
  if (!Array.isArray(raw)) return [];
  const je = new Map<string, Stand>();
  for (const r of raw as Record<string, unknown>[]) {
    const status = STATI.find((s) => s === r?.status);
    if (r?.step !== SCHRITT || !status || typeof r.project !== "string" || typeof r.created_at !== "string" || Number.isNaN(Date.parse(r.created_at))) continue;
    const alt = je.get(r.project);
    if (!alt || Date.parse(r.created_at) > Date.parse(alt.seit)) je.set(r.project, { produkt: r.project, status, name: typeof r.grund === "string" ? r.grund : "", seit: r.created_at });
  }
  return [...je.values()];
}

/** Zeile für `loop_events`. */
export const standZeile = (produkt: string, status: Status, name: string) => ({ project: produkt, step: SCHRITT, status, grund: name, issue: null, pr: null });

/** Der Dispatcher steht, solange das Produkt auf Visionär oder „go“ wartet. */
export const haelt = (s: Stand | undefined) => s?.status === "pause" || s?.status === "vorschlag";

/** Anderes Produkt, dessen freigegebene Version die anderen auf Reparaturen beschränkt (jünger als 14 Tage). Null: kein Fokus. */
export function fokusVon(alle: Stand[], produkt: string, jetzt: Date): string | null {
  const grenze = jetzt.getTime() - FOKUS_TAGE * 86_400_000;
  return alle.find((s) => s.produkt !== produkt && s.status === "go" && Date.parse(s.seit) > grenze)?.produkt ?? null;
}

/** Fehlerliste für eine vorgeschlagene Version, leer = gültig. Nie mehr als eine offene Version je Produkt (`offen`: Name der laufenden). */
export function pruefeVersion(v: Version, offen: string | null): string[] {
  const f: string[] = [];
  if (!/^v\d+ \S/.test(v.name)) f.push("Name muss „v2 <Name>“ lauten");
  if (offen) f.push(`Version ${offen} ist noch offen`);
  if (v.fertig_punkte.length < MIN_PUNKTE || v.fertig_punkte.length > MAX_PUNKTE) f.push(`${MIN_PUNKTE} bis ${MAX_PUNKTE} Fertig-Punkte`);
  if (!(v.tage > 0)) f.push("Tage fehlen");
  return f;
}

const liste = (l: string[]) => (l.length ? l.map((x) => `- ${x}`).join("\n") : "- keine genannt");

/** Abschnitt für `docs/VERSIONEN.md`. Die Tage sind die Schätzung des Visionärs und so gekennzeichnet. */
export const versionAbschnitt = (v: Version) =>
  `## ${v.name}\n\n**Ziel:** ${v.ziel}\n\n**Fertig, wenn:**\n${v.fertig_punkte.map((p) => `- [ ] ${p}`).join("\n")}\n\n**Nicht-Ziele:**\n${liste(v.nicht_ziele)}\n\n**Geschätzt:** ${v.tage} Tage (Schätzung)\n\n**Voraussetzung:** ${v.voraussetzung || "keine"}\n`;

/** Text im Feld `grund` des Vorschlags-Ereignisses: Name und Schätzung, damit die Startseite ohne weitere Abfrage fragen kann. */
export const vorschlagText = (v: Pick<Version, "name" | "tage">) => `${v.name}, ${v.tage} Tage`;

/** Satz für die Startseite, wenn ein Vorschlag auf „go“ wartet. */
export const goSatz = (produktName: string, vorschlag: string) => `Der Chef sagt: ${produktName} ist fertig. Vorschlag ${vorschlag}. Go?`;

/** Nur Fehlerbehebungen brauchen kein „go“. */
export const brauchtGo = (v: Pick<Version, "nur_fehler">) => !v.nur_fehler;

/** Eingabe von `/api/version`: Produkt und „go“. Null bei unbekanntem Produkt oder fehlendem go. */
export function goEingabe(body: unknown, bekannt: string[]): { produkt: string } | null {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return typeof o.produkt === "string" && bekannt.includes(o.produkt) && o.go === true ? { produkt: o.produkt } : null;
}
