// Anwalt-Agent (SIN-552): reine Logik. Liest einen Diff, prüft die hinzugefügten Zeilen gegen feste Regeln, bildet die Ampel und den PR-Kommentar.
// Kein Netz, kein Dateizugriff. `scripts/anwalt/anwalt.ts` liefert den Diff und die Dateien. Keine Rechtsberatung: Der Agent markiert, Sinan oder ein Anwalt entscheidet.

export type Ampel = "gruen" | "gelb" | "rot";
export type Fund = { ampel: Exclude<Ampel, "gruen">; datei: string; zeile: string; grund: string; quelle: string };
export type Datei = { name: string; text: string };

export const HINWEIS = "Keine Rechtsberatung. Der Anwalt-Agent markiert und begründet; Sinan oder ein Anwalt entscheidet.";

/** Pfade, bei denen der Workflow läuft (Migrationen, Speicher, Tracking, Prompts, Rechtstexte, Werbemittel). */
const BETROFFEN = [/^supabase\/migrations\//, /^src\/lib\/storage\//, /(tracking|analytics|posthog|sentry|langfuse|prompt|werbemittel)/i, /(^|\/)(datenschutz|impressum|ki-hinweis)(\/|\.)/, /^docs\/recht\//];
export const betrifftRecht = (pfad: string): boolean => BETROFFEN.some((m) => m.test(pfad));

/** Hinzugefügte Zeilen je Datei aus einem unified diff. */
export function leseDiff(diff: string): { datei: string; zeilen: string[] }[] {
  const aus: { datei: string; zeilen: string[] }[] = [];
  for (const z of diff.split("\n")) {
    if (z.startsWith("+++ ")) aus.push({ datei: z.slice(4).replace(/^b\//, ""), zeilen: [] });
    else if (z.startsWith("+") && aus.length) aus[aus.length - 1].zeilen.push(z.slice(1));
  }
  return aus.filter((d) => d.datei !== "/dev/null");
}

const TRACKING = /(posthog\.(init|capture)|\bgtag\(|\bfbq\(|Sentry\.init|document\.cookie|localStorage\.setItem|new Langfuse)/;
const EINWILLIGUNG = /(einwilligung|consent|TDDDG)/i;
const PERSONENFELD = /^\s*(email|e_mail|name|vorname|nachname|telefon|adresse|ip|ip_adresse|geburtsdatum)\b/i;
const RECHTSGRUNDLAGE = /Rechtsgrundlage:/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const KI = /(mit KI erstellt|KI-generiert|Art\.? 50)/i;
const istTest = (datei: string) => /\.test\./.test(datei);

const QUELLE = {
  tddg: "TDDDG § 25",
  dsgvo6: "DSGVO Art. 6, 13",
  dsgvo5: "DSGVO Art. 5, 25",
  ki: "KI-Verordnung Art. 50",
  ddg: "DDG § 5",
};

/** Prüft die hinzugefügten Zeilen. Rot: Tracking ohne Einwilligung, E-Mail im Prompt. Gelb: Personenfeld ohne Rechtsgrundlage, fehlende KI-Kennzeichnung, Impressum ohne DDG-Bezug. */
export function pruefeDiff(diff: string): Fund[] {
  const funde: Fund[] = [];
  for (const { datei, zeilen } of leseDiff(diff)) {
    const text = zeilen.join("\n");
    const fund = (ampel: Fund["ampel"], zeile: string | undefined, grund: string, quelle: string) => funde.push({ ampel, datei, zeile: (zeile ?? "").trim(), grund, quelle });
    const tracking = zeilen.find((z) => TRACKING.test(z));
    if (tracking && !EINWILLIGUNG.test(text)) fund("rot", tracking, "Tracking oder Speichern im Endgerät ohne erkennbare Einwilligung.", QUELLE.tddg);
    if (datei.startsWith("supabase/migrations/")) {
      const feld = zeilen.find((z) => PERSONENFELD.test(z));
      if (feld && !RECHTSGRUNDLAGE.test(text)) fund("gelb", feld, "Personenbezogenes Feld ohne Kommentar „Rechtsgrundlage: …“.", QUELLE.dsgvo6);
    }
    if (/prompt/i.test(datei) && !istTest(datei)) {
      const mail = zeilen.find((z) => EMAIL.test(z));
      if (mail) fund("rot", mail, "E-Mail-Adresse in einem Prompt. Personendaten gehören nicht in Prompts.", QUELLE.dsgvo5);
    }
    if (/werbemittel/i.test(datei) && !istTest(datei) && /\b(text_|clip|video)/i.test(text) && !KI.test(text)) fund("gelb", zeilen[0], "Werbemittel-Code ohne erkennbare KI-Kennzeichnung.", QUELLE.ki);
    if (/(^|\/)impressum/.test(datei) && !/(DDG|§ ?5)/.test(text)) fund("gelb", zeilen[0], "Impressum geändert, Pflichtangaben nach DDG § 5 nicht erkennbar.", QUELLE.ddg);
  }
  return funde;
}

export const ampelVon = (funde: Fund[]): Ampel => (funde.some((f) => f.ampel === "rot") ? "rot" : funde.length ? "gelb" : "gruen");

/** Rot setzt `needs-human`; Auto-Merge bleibt dadurch aus. */
export const brauchtMensch = (funde: Fund[]): boolean => ampelVon(funde) === "rot";

const PUNKT: Record<Ampel, string> = { gruen: "🟢", gelb: "🟡", rot: "🔴" };

export function kommentar(funde: Fund[], geprueft: string[]): string {
  const a = ampelVon(funde);
  return [
    `### Anwalt-Agent: ${PUNKT[a]} ${a}`,
    "",
    geprueft.length ? `Geprüft: ${geprueft.map((p) => `\`${p}\``).join(", ")}` : "Keine rechtlich relevanten Dateien geändert.",
    "",
    ...(funde.length ? funde.map((f) => `- ${PUNKT[f.ampel]} \`${f.datei}\`: ${f.grund} (${f.quelle})\n  \`${f.zeile.slice(0, 120)}\``) : ["Keine Funde."]),
    ...(a === "rot" ? ["", "Label `needs-human` gesetzt, kein Auto-Merge."] : []),
    "",
    `_${HINWEIS}_`,
  ].join("\n");
}

// AVV-Abgleich (monatlich): jeder Dienst braucht in docs/recht/AVV.md eine Zeile mit https-Link.
export const DIENSTE = [
  { name: "Supabase", muster: /supabase/i },
  { name: "Vercel", muster: /vercel/i },
  { name: "Sentry", muster: /sentry/i },
  { name: "PostHog", muster: /posthog/i },
  { name: "Langfuse", muster: /langfuse/i },
  { name: "Anthropic", muster: /anthropic/i },
  { name: "OpenAI", muster: /openai/i },
  { name: "Higgsfield", muster: /higgsfield/i },
] as const;

export type AvvLuecke = { dienst: string; grund: "fehlt" | "ohne-link"; benutzt: boolean };

/** Lücken: Zeile fehlt oder ohne https-Link. `benutzt` sagt, ob der Dienst in den Quellen (package.json, Workflows, Skripte) vorkommt. */
export function avvLuecken(avv: string, quellen: Datei[]): AvvLuecke[] {
  const zeilen = avv.split("\n").filter((z) => z.startsWith("|"));
  return DIENSTE.flatMap(({ name, muster }): AvvLuecke[] => {
    const benutzt = quellen.some((q) => muster.test(q.text));
    const zeile = zeilen.find((z) => z.toLowerCase().includes(name.toLowerCase()));
    if (!zeile) return [{ dienst: name, grund: "fehlt", benutzt }];
    return zeile.includes("https://") ? [] : [{ dienst: name, grund: "ohne-link", benutzt }];
  });
}

const FREMDMARKEN = ["Google", "Meta", "LinkedIn", "Facebook", "Instagram", "TikTok", "Amazon", "Apple", "Microsoft"];

/** Vor `wartet_auf_freigabe`: KI-Kennzeichnung drin, keine Fremdmarken, keine Personendaten. Leer = ok. `erlaubteMarken`: z. B. die Plattform einer Anzeige. */
export function pruefeWerbemittel(w: { text: string; kiKennzeichnung: string | null }, erlaubteMarken: string[] = []): string[] {
  const gruende: string[] = [];
  if (!w.kiKennzeichnung?.trim()) gruende.push("KI-Kennzeichnung fehlt (KI-Verordnung Art. 50)");
  const marke = FREMDMARKEN.filter((m) => !erlaubteMarken.includes(m)).find((m) => new RegExp(`\\b${m}\\b`).test(w.text));
  if (marke) gruende.push(`Fremdmarke im Text: ${marke}`);
  if (EMAIL.test(w.text)) gruende.push("E-Mail-Adresse im Text (Personendaten)");
  return gruende;
}
