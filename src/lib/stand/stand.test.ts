import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bericht,
  ereignisZeile,
  envVariablen,
  migrationsVersion,
  pruefeContent,
  pruefeDesign,
  pruefeDoku,
  pruefeLinearGithub,
  pruefeLoopEvents,
  pruefeMigrationen,
  umgang,
} from "./stand";

// Fixture: die bekannten Fälle vom 12.10. (SIN-508).

test("Design: Ablauf ohne Frame in AGENTS.md und Seite ohne Frame werden gefunden", () => {
  const frames = [
    { seite: "Übersicht", id: "10:3", pfad: "src/app/page.tsx" },
    { seite: "Ablauf", id: "21:2", pfad: "src/app/ablauf/page.tsx" },
    { seite: "Handy", id: "99:1", pfad: "src/app/weg/page.tsx" },
  ];
  const agents = "Maßgeblich ist Frame `10:3`.";
  const b = pruefeDesign(frames, agents, ["src/app/page.tsx", "src/app/ablauf/page.tsx", "src/app/neu/page.tsx", "src/app/api/x/page.tsx"], "https://figma.example");
  const arten = b.filter((x) => x.status !== "ok").map((x) => `${x.pruefung}:${x.status}`);
  assert.deepEqual(arten.sort(), ["agents-liste:veraltet", "agents-liste:veraltet", "frame-fuer-seite:fehlt", "seite-im-code:fehlt"]);
  assert.ok(b.find((x) => x.pruefung === "agents-liste" && x.status === "veraltet")?.link);
});

test("Design: Frame, den Figma nicht mehr kennt, ist veraltet", () => {
  const b = pruefeDesign([{ seite: "A", id: "1:1", pfad: "" }], "1:1", [], "l", new Set(["2:2"]));
  assert.equal(b.find((x) => x.pruefung === "frame-in-figma")?.status, "veraltet");
  assert.equal(pruefeDesign([{ seite: "A", id: "1:1", pfad: "" }], "1:1", [], "l").every((x) => x.status === "ok"), true);
});

test("Datenbank: wartende und fehlende Migrationen", () => {
  assert.equal(migrationsVersion("supabase/migrations/20261001120000_loop.sql"), "20261001120000");
  assert.equal(migrationsVersion("README.md"), null);
  const b = pruefeMigrationen(["20261001_a.sql", "20261002_b.sql"], ["20261001", "20260901"]);
  assert.deepEqual(b.map((x) => [x.pruefung, x.status]), [["migrationen-wartend", "veraltet"], ["migrationen-fehlend", "fehlt"]]);
  assert.match(b[0].text, /20261002/);
  assert.equal(pruefeMigrationen(["1_a.sql"], ["1"])[0].status, "ok");
  assert.equal(pruefeMigrationen([], null)[0].status, "fehlt");
});

test("Doku: Befehle, Umgebungsvariablen, Landkarte", () => {
  assert.deepEqual(envVariablen("const a = process.env.FOO_KEY; env.BAR_URL; process.env.x"), ["BAR_URL", "FOO_KEY"]);
  const b = pruefeDoku(["dev", "test", "stand"], "`npm run dev` `npm test`", ["FOO_KEY", "NODE_ENV"], "FOO_KEY=\n", "FOO_KEY");
  assert.equal(b[0].status, "veraltet");
  assert.match(b[0].text, /stand/);
  assert.equal(b[1].status, "ok");
  assert.equal(b[2].status, "ok");
  assert.equal(pruefeDoku([], "", ["NEU_TOKEN"], "", null).map((x) => x.status).join(), "ok,fehlt,fehlt");
  assert.equal(pruefeDoku([], "", ["NEU_TOKEN"], "NEU_TOKEN", "alt")[2].status, "veraltet");
});

test("Content: 264 statt 520 Einheiten und Map noch auf Entwurf", () => {
  const db = { einheiten: 520, maps: [{ name: "Python", status: "Veröffentlicht" }, { name: "SQL", status: "Veröffentlicht" }] };
  const b = pruefeContent(db, 520, 264, [{ name: "Python", status: "Entwurf" }], "https://figma.example/landkarte");
  const schlecht = b.filter((x) => x.status !== "ok");
  assert.deepEqual(schlecht.map((x) => x.pruefung), ["einheiten-landkarte", "map-status", "map-status"]);
  assert.match(schlecht[0].text, /264 statt 520/);
  assert.match(schlecht[1].text, /Entwurf/);
  assert.equal(schlecht[2].status, "fehlt");
  assert.equal(pruefeContent(db, 519, null, [], "l").filter((x) => x.status !== "ok").length, 4);
});

test("Linear ↔ GitHub: Done nach Revert und nicht-Done nach Merge", () => {
  const prs = [
    { nummer: 1, titel: "feat(a): x (SIN-10)", gemergt: true, url: "u1" },
    { nummer: 2, titel: 'Revert "feat(a): x (SIN-10)"', gemergt: true, url: "u2" },
    { nummer: 3, titel: "feat(b): y (SIN-11)", gemergt: true, url: "u3" },
    { nummer: 4, titel: "feat(c): z (SIN-12)", gemergt: false, url: "u4" },
    { nummer: 5, titel: "feat(d): w (SIN-13)", gemergt: true, url: "u5" },
    { nummer: 6, titel: 'Revert "feat(d): w (SIN-13)"', gemergt: true, url: "u6" },
    { nummer: 7, titel: "feat(d): w neu (SIN-13)", gemergt: true, url: "u7" },
  ];
  const issues = [
    { id: "SIN-10", statusTyp: "completed" },
    { id: "SIN-11", statusTyp: "started", url: "l11" },
    { id: "SIN-12", statusTyp: "unstarted" },
    { id: "SIN-13", statusTyp: "completed" },
  ];
  const b = pruefeLinearGithub(prs, issues);
  assert.deepEqual(b.map((x) => x.pruefung), ["revert-status", "merge-status"]);
  assert.match(b[0].text, /SIN-10.*PR #2/);
  assert.equal(b[1].link, "l11");
  assert.equal(pruefeLinearGithub([], issues)[0].status, "ok");
});

test("Leitstand: unbekannte Projekt- und Schrittnamen in loop_events", () => {
  const ev = [{ project: "lernapp", step: "WORK" }, { project: "Content-Agent", step: "stand" }, { project: null, step: "neu" }];
  const b = pruefeLoopEvents(ev, ["lernapp", "leitstand"], ["WORK", "STAND"]);
  assert.deepEqual(b.map((x) => x.pruefung), ["projekt-namen", "schritt-namen"]);
  assert.match(b[0].text, /Content-Agent/);
  assert.equal(pruefeLoopEvents(ev.slice(0, 1), ["lernapp"], ["work"])[0].status, "ok");
});

test("Bericht, Umgang und Ereignis", () => {
  const befunde = pruefeMigrationen(["2_a.sql"], ["1"]).concat(pruefeContent({ einheiten: 1, maps: [] }, 1, 1, []));
  const r = bericht("leitstand", befunde, new Date("2026-10-12T06:15:00Z"));
  assert.deepEqual(r.zusammenfassung, { ok: 2, veraltet: 1, fehlt: 1 });
  assert.equal(r.abweichung, true);
  assert.deepEqual(umgang(befunde[0]), { art: "issue", label: "sinan" });
  assert.deepEqual(umgang({ thema: "design", pruefung: "x", status: "fehlt", text: "" }), { art: "issue", label: "design" });
  assert.deepEqual(umgang({ thema: "doku", pruefung: "x", status: "veraltet", text: "" }), { art: "pr" });
  assert.equal(umgang(befunde[2]), null);
  assert.equal(ereignisZeile(r, "7", "u").status, "needs_human");
  const sauber = bericht("leitstand", [befunde[2]], new Date());
  assert.deepEqual(ereignisZeile(sauber, null, null), { project: "leitstand", agent: "betrieb", step: "stand", status: "ok", issue: null, pr: null, run_id: null, run_url: null });
});
