/** SIN-911: warnt bei Treffern der Verbotsliste im PR-Text (Umgebung: PR_BODY, PR_TITLE). Bricht nie ab. */
import { pruefePrText } from "../../src/lib/pr-text/pr-text";

const treffer = pruefePrText(`${process.env.PR_TITLE ?? ""}\n${process.env.PR_BODY ?? ""}`);
if (treffer.length) console.log(`::warning title=pr-text::Öffentlicher PR-Text enthält: ${treffer.join(", ")}. Details gehören nach Linear.`);
else console.log("pr-text: keine Treffer.");
