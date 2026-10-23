// SIN-1027: Nach „bestanden“ den fehlgeschlagenen pr-gate-Lauf des geprüften Commits neu starten (rein, Netz in scripts/pruefer/regate.ts).
export type GateLauf = { id: number; name?: string | null; path?: string | null; head_sha: string; conclusion: string | null; created_at: string };

const istGate = (l: GateLauf) => l.name === "pr-gate" || /(^|\/)pr-gate\.ya?ml(@|$)/.test(l.path ?? "");

/** Id des neuesten fehlgeschlagenen pr-gate-Laufs für `head`; null = nichts neu zu starten (kein Lauf oder schon grün). */
export function gateLaufNeustart(laeufe: GateLauf[], head: string): number | null {
  const neuester = laeufe.filter((l) => istGate(l) && l.head_sha === head).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0];
  return neuester?.conclusion === "failure" ? neuester.id : null;
}
