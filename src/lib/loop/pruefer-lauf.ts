// Prüfer-Laufname → Repo und PR (SIN-1009). Seit SIN-939 heißen Produkt-Läufe `pruefer <owner/repo> PR <n>`,
// Leitstand-Läufe weiter `pruefer PR <n>`. Nur freigegebene Produkt-Repos; alles andere gibt null zurück.

export const LEITSTAND_REPO = "siinanXD/Leitstand";
const PRODUKT_REPOS = [LEITSTAND_REPO, "siinanXD/Content-Agent-Lernapp"];

export function prueferLaufziel(titel: string): { repo: string; pr: number } | null {
  const m = titel.match(/^pruefer (?:(\S+\/\S+) )?PR ([1-9][0-9]*)$/);
  if (!m) return null;
  const repo = PRODUKT_REPOS.find((r) => r.toLowerCase() === (m[1] ?? LEITSTAND_REPO).toLowerCase());
  return repo ? { repo, pr: Number(m[2]) } : null;
}
