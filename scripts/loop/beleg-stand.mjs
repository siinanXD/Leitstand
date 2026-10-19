// Beleg-Stand (SIN-854): Der Prüfer-Kommentar nennt Head-SHA und Hash der Fertig-Kriterien, gegen die geprüft wurde.
// Das Gate (automerge.yml, Logik von main) lässt nur zu, was zum aktuellen Head und Kriterien-Text passt. Rein, ohne Netz.
// Als .mjs, damit automerge.yml es ohne Build laden kann (wie risiko.mjs). Tests: src/lib/loop/beleg-stand.test.ts.
import { createHash } from "node:crypto";

const STAND = /<!-- pruefer-stand:([0-9a-f]{40}):([0-9a-f]{16}) -->/;


/** Vollständiger Linear-Auftrag: auch nummerierte Kriterien, Fließtext und Code müssen Änderungen entwerten. */
export function kriterienHash(beschreibung) {
  return createHash("sha256").update(String(beschreibung ?? "").replace(/\r\n/g, "\n").replace(/^(\s*[-*]\s+)\[[xX ]\]/gm, "$1[ ]")).digest("hex").slice(0, 16);
}

/** Der GitHub-Spiegel ist Startkontext, nie die aktuelle Quelle für den Merge. */
export async function ladeAuftrag(titel, token, holen = fetch) {
  const id = /\bSIN-\d+\b/.exec(titel)?.[0];
  if (!id || !token) throw new Error("Aktueller Linear-Auftrag fehlt: Kennung oder LINEAR_API_KEY fehlt");
  const res = await holen("https://api.linear.app/graphql", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query: "query($id: String!) { issue(id: $id) { identifier title description } }", variables: { id } }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  const issue = json.data?.issue;
  if (!res.ok || json.errors || issue?.identifier !== id || !issue.description?.trim()) throw new Error("Aktueller Linear-Auftrag nicht lesbar");
  return { title: issue.title, body: issue.description, hash: kriterienHash(`${id}\n${issue.title}\n${issue.description}`) };
}

export const standMarker = (headSha, hash) => `<!-- pruefer-stand:${headSha.toLowerCase()}:${hash} -->`;

/** Nur jüngster offizieller Prüfer-Kommentar zählt; Fehlreview entwertet frühere Erfolge. */
export function leseStand(kommentare) {
  for (const k of [...kommentare].reverse()) {
    if (!k.startsWith("<!-- pruefer-zweites-modell -->\n")) continue;
    const m = STAND.exec(k);
    if (!m || !/^### Prüfer \(zweites Modell\): bestanden\r?$/m.test(k)) return null;
    if (m) return { sha: m[1], hash: m[2] };
  }
  return null;
}

/** Beleg zählt nur für den aktuellen Head und die aktuellen Kriterien; sonst Grund für den PR-Kommentar. */
export function belegAktuell({ stand, headSha, hash }) {
  if (!stand) return { ok: false, grund: "Kein Prüfer-Beleg mit Stand vorhanden." };
  if (stand.sha !== headSha.toLowerCase()) return { ok: false, grund: `Beleg gehört zu ${stand.sha.slice(0, 7)}, der PR-Head ist ${headSha.slice(0, 7)}: neue Prüfer-Runde nötig.` };
  if (stand.hash !== hash) return { ok: false, grund: "Fertig-Kriterien wurden nach der Prüfung geändert: neue Prüfer-Runde nötig." };
  return { ok: true };
}
