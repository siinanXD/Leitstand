// SIN-909: Label-Entscheidung nach dem Prüfer-Lauf (rein in src/lib/pruefer/pruefer.ts). Aufruf aus pruefer.yml:
//   LABELS="$(…)" node --import tsx scripts/pruefer/labels.ts  → Zeilen "add <label>" / "remove <label>"
import { existsSync, readFileSync } from "node:fs";
import { prueferLabels } from "../../src/lib/pruefer/pruefer";

const labels = (process.env.LABELS ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const status = existsSync("pruefer-status.txt") ? readFileSync("pruefer-status.txt", "utf8") : "";
if (!status && !existsSync("pruefer-hoch.txt")) process.exit(0);
const { add, remove } = prueferLabels({ risiko: existsSync("pruefer-hoch.txt"), bestanden: status.startsWith("bestanden"), labels });
for (const l of add) console.log(`add ${l}`);
for (const l of remove) console.log(`remove ${l}`);
