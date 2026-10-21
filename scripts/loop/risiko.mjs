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

/** @param {{ files: any[], bekannt: Set<string>, labels?: string[], pruefBestanden?: boolean }} a */
export function klassifiziere({ files, bekannt, labels = [], pruefBestanden = false }) {
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
        if (/\b(drop\s+(table|column|schema|policy)|truncate|delete\s+from|alter\s+table\s+(if\s+exists\s+)?(only\s+)?\S+\s+(drop(?!\s+(constraint|index)\b)|rename))\b/i.test(s)) gruende.push(`Datenverlust in ${p}: ${s.trim().slice(0, 80)}`);
      }
    }
    if (/^src\/(middleware|lib\/auth|lib\/kopplung)\b|^middleware\.ts$/.test(p)) gruende.push(`Auth/Middleware: ${p}`);
    if (/^src\/(app|components)\//.test(p) && neu.some((l) => /SUPABASE_SERVICE_ROLE_KEY/.test(l))) gruende.push(`Service-Role-Key im Client: ${p}`);
  }
  // SIN-909: Neubewertung je Head. Ein gesetztes risk:high (Prüfer-Sicherheitsfund, Mensch) bleibt nur, bis der Prüfer auf dem aktuellen Head „bestanden“ meldet.
  if (labels.includes("risk:high") && gruende.length === 0 && !pruefBestanden) gruende.push("risk:high bereits gesetzt, bis ein Prüfer-Lauf auf dem aktuellen Head besteht");
  return { gruende, high: gruende.length > 0 };
}

// Aufbauphase (SIN-855): keine feste Einspruchsfrist. low und medium mergen nach grünen Pflichtchecks, high wartet auf `freigegeben`.

const NUR_DOKU = /^(docs\/|[^/]+\.md$)|\.test\.(ts|tsx|mjs)$|^tests\//;

// Nie low: Workflows, Gate, Risiko-Skripte sowie jede neue Zeile mit `permissions:` oder Secrets-Nutzung (auch in Doku).
const NIE_LOW = /^\.github\/|^scripts\/(autonomy\/risk|loop\/risiko)\.mjs$/;
const RECHTE_ODER_SECRET = /^\s*permissions\s*:|secrets\./;

/** low: nur Doku und Tests; high: siehe klassifiziere; sonst medium. */
export function stufe({ files, bekannt, labels = [], pruefBestanden = false }) {
  const { gruende, high } = klassifiziere({ files, bekannt, labels, pruefBestanden });
  if (high) return { stufe: "high", gruende };
  const low = files.length > 0 && files.every((f) =>
    [f.filename, f.previous_filename].filter(Boolean).every((p) => NUR_DOKU.test(p) && !NIE_LOW.test(p)) &&
    !hinzugefuegt(f).some((l) => RECHTE_ODER_SECRET.test(l)));
  return { stufe: low ? "low" : "medium", gruende };
}
