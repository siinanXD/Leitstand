import { existsSync, readFileSync } from "node:fs";
import { bewerteText, bewerteZeilen, einsetzen, type Ergebnis, type Probe } from "./abnahme";

const zeitlimit = () => AbortSignal.timeout(20_000);
export async function fuehreAus(p: Probe, env: Readonly<Record<string, string | undefined>>, holen: typeof fetch = fetch): Promise<Ergebnis> {
  const supabaseKopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}` });
  const feld = (n: string) => einsetzen(p[n] ?? "", env);
  if (p.art === "http") {
    const res = await holen(feld("url"), { signal: zeitlimit() });
    const erwartet = Number(p.status ?? 200);
    return res.status === erwartet ? bewerteText(p, await res.text()) : { ok: false, grund: `HTTP ${res.status}, erwartet ${erwartet}` };
  }
  if (p.art === "db") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
    // Nur GET auf die REST-Schnittstelle: eine Probe kann nichts ändern.
    const res = await holen(`${env.SUPABASE_URL}/rest/v1/${feld("rest")}`, { headers: supabaseKopf(), signal: zeitlimit() });
    return res.ok ? bewerteZeilen(p, await res.json(), Date.now()) : { ok: false, grund: `Abfrage: HTTP ${res.status}` };
  }
  if (p.art === "datei") {
    return existsSync(p.pfad) ? bewerteText(p, readFileSync(p.pfad, "utf8")) : { ok: false, grund: `${p.pfad} fehlt` };
  }
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt");
  const res = await holen(`https://api.github.com/repos/${p.repo}/contents/${p.pfad.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github.raw+json" },
    signal: zeitlimit(),
  });
  return res.ok ? bewerteText(p, await res.text()) : { ok: false, grund: `${p.repo}/${p.pfad}: HTTP ${res.status}` };
}

