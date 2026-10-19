import { fuehreAus } from "../abnahme/ausfuehren";
import type { Ergebnis, Probe } from "../abnahme/abnahme";
import type { Beleg } from "./haken";

/** Keine Modell-URL öffnen. Nur explizit zugeordnete HTTP-/DB-Proben des gemergten Commits ausführen. */
export async function pruefeLive(a: { belege: Beleg[]; proben: Probe[]; issue: string; runUrl: string | null }, ausfuehren: (p: Probe) => Promise<Ergebnis> = (p) => fuehreAus(p, process.env)): Promise<Beleg[]> {
  const belege: Beleg[] = [];
  for (const b of a.belege) {
    if (b.art !== "live") { belege.push(b); continue; }
    const passend = a.proben.filter((p) => p.issue === a.issue && p.kriterium === b.text && (p.art === "http" || p.art === "db"));
    if (!passend.length) {
      belege.push({ ...b, art: "code", belegt: false, beleg: "HTTP-/DB-Probe mit issue und exaktem kriterium in docs/abnahme.yml ergänzen" });
      continue;
    }
    if (!a.runUrl) {
      belege.push({ ...b, belegt: false, beleg: "GitHub-Laufnachweis für die Live-Messung fehlt" });
      continue;
    }
    const ergebnisse: string[] = [];
    let ok = true;
    for (const p of passend) {
      const e = await ausfuehren(p).catch((f): Ergebnis => ({ ok: false, grund: `Nicht geprüft: ${f instanceof Error ? f.message : f}` }));
      ok &&= e.ok;
      const zeile = `${p.id}: ${e.ok ? "ok" : "ROT"} ${e.grund}`;
      console.log(`Live-Abnahme ${a.issue}: ${zeile}`);
      ergebnisse.push(zeile);
    }
    belege.push({ ...b, belegt: ok, beleg: `${a.runUrl} — ${ergebnisse.join("; ")}` });
  }
  return belege;
}
