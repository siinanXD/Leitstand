// Risiko-Einstufung für automerge.yml (SIN-623). Rein, ohne Netz; Tests: src/lib/loop/risiko.test.ts.
// Datei: { filename, status, previous_filename?, patch?, inhalt? }. `inhalt` = voller Text, nur für Workflows nötig,
// die neu nach .github/workflows/ kommen (neu, umbenannt, kopiert); bei Umbenennung gibt es sonst keine "+"-Zeilen im Diff.
const WF = ".github/workflows/";

export function brauchtInhalt(f) {
  return f.filename.startsWith(WF) && !(f.previous_filename || "").startsWith(WF) && ["added", "renamed", "copied"].includes(f.status);
}

function hinzugefuegt(f) {
  if (brauchtInhalt(f) && typeof f.inhalt === "string") return f.inhalt.split("\n");
  return (f.patch || "").split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}

/** @param {{ files: any[], bekannt: Set<string>, labels?: string[] }} a */
export function klassifiziere({ files, bekannt, labels = [] }) {
  const gruende = [];
  for (const f of files) {
    const p = f.filename;
    const neu = hinzugefuegt(f);
    if (p === ".github/workflows/automerge.yml") gruende.push("Gate selbst geändert (automerge.yml)");
    if (p.startsWith(WF)) {
      for (const l of neu) {
        if (/^\s*(contents|pull-requests|issues|actions|packages|id-token|deployments|statuses|checks|security-events|pages|discussions|repository-projects)\s*:\s*write/.test(l)) gruende.push(`Workflow-Recht erweitert in ${p}: ${l.trim()}`);
        if (/^\s*pull_request_target\s*:/.test(l)) gruende.push(`pull_request_target neu in ${p}`);
        for (const m of l.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) if (m[1] !== "GITHUB_TOKEN" && !bekannt.has(m[1])) gruende.push(`neues Secret ${m[1]} in ${p}`);
        const u = l.match(/^\s*-?\s*uses:\s*([^\s@#]+)/);
        if (u && !u[1].startsWith("./") && !/^(actions|anthropics|github)\//.test(u[1])) gruende.push(`Drittanbieter-Action ${u[1]} in ${p}`);
      }
    }
    if (/^supabase\/migrations\//.test(p)) {
      for (const l of neu) {
        const s = l.replace(/--.*$/, "");
        if (/\b(drop\s+(table|column|schema|policy)|truncate|delete\s+from|alter\s+table\s+\S+\s+(drop|rename))\b/i.test(s)) gruende.push(`Datenverlust in ${p}: ${s.trim().slice(0, 80)}`);
      }
    }
    if (/^src\/(middleware|lib\/auth|lib\/kopplung)\b|^middleware\.ts$/.test(p)) gruende.push(`Auth/Middleware: ${p}`);
    if (/^src\/(app|components)\//.test(p) && neu.some((l) => /SUPABASE_SERVICE_ROLE_KEY/.test(l))) gruende.push(`Service-Role-Key im Client: ${p}`);
  }
  // Ein vorhandenes risk:high (Mensch, Claude oder früherer Lauf) senkt das Gate nie, es hebt höchstens an.
  if (labels.includes("risk:high") && gruende.length === 0) gruende.push("risk:high bereits gesetzt, das Gate senkt es nicht");
  return { gruende, high: gruende.length > 0 };
}

// Einspruchsfrist (SIN-812): risk:low sofort, risk:medium nach 30 Min, risk:high nur mit `freigegeben`.
export const FRIST_MINUTEN = { low: 0, medium: 30 };

const NUR_DOKU = /^(docs\/|[^/]+\.md$)|\.test\.(ts|tsx|mjs)$|^tests\//;

/** low: nur Doku und Tests; high: siehe klassifiziere; sonst medium. */
export function stufe({ files, bekannt, labels = [] }) {
  const { gruende, high } = klassifiziere({ files, bekannt, labels });
  if (high) return { stufe: "high", gruende };
  const low = files.length > 0 && files.every((f) => NUR_DOKU.test(f.filename) && (!f.previous_filename || NUR_DOKU.test(f.previous_filename)));
  return { stufe: low ? "low" : "medium", gruende };
}

/** Verbleibende Wartezeit in ms ab `seit` (letzter Commit); 0 = sofort mergen, null = nie automatisch (high). */
export function wartezeitMs(st, seit, jetzt = Date.now()) {
  if (st === "high") return null;
  const ende = new Date(seit).getTime() + FRIST_MINUTEN[st] * 60_000;
  return Math.max(0, ende - jetzt);
}
