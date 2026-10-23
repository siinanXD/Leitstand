// Research-Agent (SIN-543). Rein: Antworten von GitHub-Suche und Hugging-Face-Hub-API → Treffer → Entscheidungsdatei.
// `scripts/autonomy/research.ts` holt die Daten und schreibt `docs/decisions/<ISSUE-ID>-research.md`.
export const HF_URL = "https://huggingface.co/api/models?limit=5&search=";
export const GITHUB_URL = "https://api.github.com/search/repositories?per_page=5&q=";

export type Treffer = { quelle: "github" | "huggingface"; name: string; url: string; lizenz: string; sterne: number; datum: string; letzterCommit?: string };

const istObjekt = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const tag = (d: string) => d.slice(0, 10);

/** GitHub-Antwort ist eine Vertrauensgrenze: unvollständige Einträge fallen weg. Fehlt die Lizenz, steht „unbekannt“. */
export function githubTreffer(antwort: unknown, abruf: string): Treffer[] {
  const items = istObjekt(antwort) && Array.isArray(antwort.items) ? antwort.items : [];
  return items.flatMap((i): Treffer[] => {
    if (!istObjekt(i) || typeof i.full_name !== "string" || typeof i.html_url !== "string" || typeof i.stargazers_count !== "number") return [];
    const l = istObjekt(i.license) && typeof i.license.spdx_id === "string" ? i.license.spdx_id : "unbekannt";
    return [{ quelle: "github", name: i.full_name, url: i.html_url, lizenz: l, sterne: i.stargazers_count, datum: tag(abruf), ...(typeof i.pushed_at === "string" ? { letzterCommit: tag(i.pushed_at) } : {}) }];
  });
}

/** Hugging Face: Lizenz steht als Tag `license:<id>`, „Sterne“ sind die Likes. */
export function huggingfaceTreffer(antwort: unknown, abruf: string): Treffer[] {
  if (!Array.isArray(antwort)) return [];
  return antwort.flatMap((m): Treffer[] => {
    if (!istObjekt(m) || typeof m.id !== "string") return [];
    const tags = Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : [];
    const lizenz = tags.find((t) => t.startsWith("license:"))?.slice(8) ?? "unbekannt";
    return [{ quelle: "huggingface", name: m.id, url: `https://huggingface.co/${m.id}`, lizenz, sterne: typeof m.likes === "number" ? m.likes : 0, datum: tag(abruf), ...(typeof m.lastModified === "string" ? { letzterCommit: tag(m.lastModified) } : {}) }];
  });
}

/** Ohne mindestens einen GitHub- und einen Hugging-Face-Treffer wird nichts geschrieben. */
export function entscheidungsdatei(issue: string, frage: string, treffer: Treffer[], abruf: string): string {
  if (!/^SIN-\d+$/.test(issue)) throw new Error(`Ungültige Issue-ID: ${issue}`);
  for (const q of ["github", "huggingface"] as const) if (!treffer.some((t) => t.quelle === q)) throw new Error(`Kein Treffer bei ${q}`);
  const zeile = (t: Treffer) => `| ${t.quelle} | [${t.name.replace(/[|\]]/g, " ")}](${t.url}) | ${t.lizenz.replace(/\|/g, " ")} | ${t.sterne} | ${tag(abruf)} |`;
  return [
    `# ${issue}: Research`,
    "",
    `Frage: ${frage.replace(/\s+/g, " ").trim()}`,
    "",
    "| Quelle | Treffer | Lizenz | Sterne/Likes | Abruf |",
    "| -- | -- | -- | -- | -- |",
    ...treffer.map(zeile),
    "",
    "Empfehlung (bauen, anpassen, nicht bauen) und Lizenzprüfung trägt die Rolle Research nach; Sterne und Lizenz stammen von der API, nicht aus dem Gedächtnis.",
    "",
  ].join("\n");
}
