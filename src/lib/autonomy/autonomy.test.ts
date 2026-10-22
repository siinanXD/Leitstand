import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { ablaufMarkdown, registerFehler, type Register } from "./ablauf";
import { entscheidungsdatei, githubTreffer, huggingfaceTreffer } from "./research";
import { pruefeSchema, type Schema } from "./schema";

const lies = <T>(pfad: string) => JSON.parse(readFileSync(pfad, "utf8")) as T;
const register = () => lies<Register>("docs/autonomy/agents.json");
const ROLLEN = ["ceo", "visionaer", "planer", "research", "bauen", "pruefen", "content", "marketing", "hausmeister", "anwalt", "gedaechtnis"];

test("docs/schemas hat 11 Rollen-Schemas, jedes mit Fixture, alle Fixtures gültig", () => {
  // `lernen` (SIN-576) ist das Schema der Wochenmessung, keine Rolle; es wird in schleife.test.ts geprüft.
  const schemas = readdirSync("docs/schemas").filter((f) => f.endsWith(".json") && f !== "lernen.json").map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(schemas, [...ROLLEN].sort());
  for (const r of ROLLEN) assert.deepEqual(pruefeSchema(lies(`docs/schemas/fixtures/${r}.json`), lies<Schema>(`docs/schemas/${r}.json`)), [], r);
});

test("jedes Schema trägt den gemeinsamen Kopf und verbietet fremde Felder", () => {
  for (const r of ROLLEN) {
    const s = lies<Schema>(`docs/schemas/${r}.json`);
    assert.equal(s.additionalProperties, false);
    for (const k of ["rolle", "issue", "zeitpunkt", "status", "zusammenfassung", "naechster_schritt", "kosten_eur", "quellen"]) assert.ok(s.required?.includes(k), `${r}.${k}`);
  }
});

test("Prüfer meldet fehlende, falsche und fremde Felder", () => {
  const s = lies<Schema>("docs/schemas/anwalt.json");
  const ok = lies<Record<string, unknown>>("docs/schemas/fixtures/anwalt.json");
  assert.match(pruefeSchema({ ...ok, hinweis: undefined }, s).join(), /hinweis: erwartet string/);
  assert.match(pruefeSchema(Object.fromEntries(Object.entries(ok).filter(([k]) => k !== "hinweis")), s).join(), /hinweis: fehlt/);
  assert.match(pruefeSchema({ ...ok, status: "vielleicht" }, s).join(), /status: nicht erlaubt/);
  assert.match(pruefeSchema({ ...ok, extra: 1 }, s).join(), /extra: unbekanntes Feld/);
  assert.match(pruefeSchema({ ...ok, kosten_eur: "0" }, s).join(), /kosten_eur: erwartet number/);
  assert.match(pruefeSchema({ ...ok, issue: "543" }, s).join(), /issue: passt nicht/);
});

test("agents.json: 13 Rollen mit Skill-Datei, Auslöser, Werkzeugen und Schema; Verweise stimmen", () => {
  const r = register();
  assert.deepEqual(r.rollen.map((x) => x.id), ROLLEN);
  assert.equal(r.spuren.length, 3);
  assert.deepEqual(registerFehler(r), []);
  for (const x of r.rollen) assert.ok(existsSync(x.skill), x.skill);
});

test("registerFehler findet unbekannte Verweise und leere Auslöser", () => {
  const r = register();
  r.rollen[0].ruft = ["niemand"];
  r.rollen[1].ausloeser = [];
  assert.deepEqual(registerFehler(r), ["ceo ruft unbekannte Rolle niemand", "visionaer: kein Auslöser"]);
});

test("docs/ABLAUF.md passt zu agents.json (sonst: npx tsx scripts/autonomy/ablauf.ts)", () => {
  assert.equal(readFileSync("docs/ABLAUF.md", "utf8"), ablaufMarkdown(register()));
});

test("Änderung an agents.json ändert den Ablauf", () => {
  const r = register();
  const vorher = ablaufMarkdown(r);
  r.rollen[2].werkzeuge.push("Neues Werkzeug");
  r.rollen[0].ruft.push("anwalt");
  const nachher = ablaufMarkdown(r);
  assert.match(nachher, /Neues Werkzeug/);
  assert.match(nachher, /ceo --> anwalt/);
  assert.notEqual(vorher, nachher);
});

test("Research-Fixture: Entscheidungsdatei mit GitHub- und HF-Treffer", () => {
  const jetzt = "2026-10-13T09:00:00Z";
  const gh = { items: [{ full_name: "xyflow/xyflow", html_url: "https://github.com/xyflow/xyflow", stargazers_count: 30000, license: { spdx_id: "MIT" } }, { full_name: "kaputt" }] };
  const hf = [{ id: "example/model", likes: 12, tags: ["text", "license:apache-2.0"] }, { likes: 1 }];
  const treffer = [...githubTreffer(gh, jetzt), ...huggingfaceTreffer(hf, jetzt)];
  assert.equal(treffer.length, 2);
  const md = entscheidungsdatei("SIN-543", "Flow-Diagramm", treffer, jetzt);
  assert.match(md, /\| github \| \[xyflow\/xyflow\]\(https:\/\/github.com\/xyflow\/xyflow\) \| MIT \| 30000 \| 2026-10-13 \|/);
  assert.match(md, /\| huggingface \| \[example\/model\]\(https:\/\/huggingface.co\/example\/model\) \| apache-2.0 \| 12 \| 2026-10-13 \|/);
});

test("Research ohne GitHub- oder HF-Treffer und mit falscher Issue-ID wird abgelehnt", () => {
  const nur = githubTreffer({ items: [{ full_name: "a/b", html_url: "https://github.com/a/b", stargazers_count: 1 }] }, "2026-10-13");
  assert.throws(() => entscheidungsdatei("SIN-1", "x", nur, "2026-10-13"), /huggingface/);
  assert.throws(() => entscheidungsdatei("../x", "x", nur, "2026-10-13"), /Ungültige Issue-ID/);
  assert.deepEqual(githubTreffer(null, "2026-10-13"), []);
});
