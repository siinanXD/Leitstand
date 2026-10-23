// Vercel „Ignored Build Step“ (SIN-1042): Vorschau nur bauen, wenn UI-Dateien betroffen sind.
// Exit 0 = Build überspringen, Exit 1 = bauen. Läuft vor npm ci, daher nur Node ohne Abhängigkeiten.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const UI_PFAD = /^(src\/(app|components)\/|public\/|package(-lock)?\.json$|next\.config\.[^/]+$|.*\.css$)/;

/**
 * @param {{ branch?: string, env?: string, dateien: string[] | null }} a
 *   dateien null = Diff nicht lesbar -> bauen (sicher).
 */
export function sollBauen({ branch, env, dateien }) {
  if (env === "production" || branch === "main") return true;
  if (!dateien) return true;
  return dateien.some((d) => UI_PFAD.test(d));
}

function geaenderteDateien() {
  try {
    // shortcut: nur der letzte Commit (Vercel klont flach); frühere Commits des Branches wurden bei ihrem Push gebaut.
    const out = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bauen = sollBauen({
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    env: process.env.VERCEL_ENV,
    dateien: geaenderteDateien(),
  });
  console.log(bauen ? "Vorschau wird gebaut." : "Nur Doku/Skripte: Vorschau übersprungen.");
  process.exit(bauen ? 1 : 0);
}
