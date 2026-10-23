// SIN-1027: Gibt die Id des pr-gate-Laufs aus, der nach „bestanden“ neu zu starten ist (leer = keiner).
//   gh api … | HEAD_SHA=<sha> node --import tsx scripts/pruefer/regate.ts   (stdin: JSON-Liste der workflow_runs)
import { readFileSync } from "node:fs";
import { gateLaufNeustart } from "../../src/lib/pruefer/gate-lauf";

const id = gateLaufNeustart(JSON.parse(readFileSync(0, "utf8")), process.env.HEAD_SHA ?? "");
if (id !== null) console.log(id);
