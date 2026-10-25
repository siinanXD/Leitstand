// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { fehlergrund } from "../../src/lib/loop/fehlergrund";
import { repo, arg, ereignis } from "./netz";
import { dispatch } from "./dispatch";
import { gemergt, reparaturLauf, frage } from "./abschluss";

const befehl = process.argv[2];

const laeufe: Record<string, () => Promise<unknown>> = { dispatch, gemergt: () => gemergt(repo, Number(arg("pr"))), reparatur: reparaturLauf, frage };

const lauf = laeufe[befehl ?? ""];

if (!lauf) {
  console.error("Befehl: dispatch | gemergt --pr N | reparatur --pr N --lauf URL | frage SIN-ID --grund TEXT");
  process.exit(2);
}

lauf().catch(async (e: Error) => {
  console.error(`::error::${e.message}`);
  await ereignis(befehl === "reparatur" ? "repair" : befehl === "gemergt" ? "merge" : "dispatch", "fehler", { grund: fehlergrund(e.message) });
  process.exit(1);
});
