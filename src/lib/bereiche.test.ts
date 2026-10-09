import assert from "node:assert/strict";
import { test } from "node:test";
import { bereicheAusDateien, bereichVon } from "./bereiche";

const namen = (d: string[], text?: string) => bereicheAusDateien(d, text).map((z) => `${z.bereich}:${z.dateien}`);

test("gemischter PR in fester Reihenfolge mit Zahlen", () => {
  assert.deepEqual(
    namen(["src/app/page.tsx", "src/app/globals.css", "src/app/api/freigabe/route.ts", "supabase/migrations/1.sql", "README.md", "package.json", "vercel.json"]),
    ["Datenbank:1", "Infrastruktur:1", "Deployment:1", "Backend:1", "Frontend:2", "Doku und Tests:1"],
  );
});

test("nur Doku", () => {
  assert.deepEqual(namen(["docs/decisions/a.md", "AGENTS.md"]), ["Doku und Tests:2"]);
});

test("Migration ist Datenbank", () => {
  assert.deepEqual(namen(["supabase/migrations/leitstand/20261009_protokoll.sql"]), ["Datenbank:1"]);
});

test("Tests unter src/ zählen zu Doku und Tests, nicht Backend", () => {
  assert.equal(bereichVon("src/lib/bereiche.test.ts"), "Doku und Tests");
  assert.equal(bereichVon("src/app/seite.spec.tsx"), "Doku und Tests");
  assert.deepEqual(namen(["src/lib/a.ts", "src/lib/a.test.ts"]), ["Backend:1", "Doku und Tests:1"]);
});

test("Workflows: Deploy ist Deployment, sonst Infrastruktur", () => {
  assert.equal(bereichVon(".github/workflows/deploy.yml"), "Deployment");
  assert.equal(bereichVon(".github/workflows/build.yml"), "Infrastruktur");
});

test("ohne Dateien keine Bereiche; doppelte Pfade zählen einmal", () => {
  assert.deepEqual(namen([]), []);
  assert.deepEqual(namen(["src/app/a.tsx", "src/app/a.tsx"]), ["Frontend:1"]);
});

test("Abschnitt ## Bereiche im PR-Text überschreibt den Satz", () => {
  const text = "Closes #1\n\n## Bereiche\n- Frontend: Neue Freigabe-Seite.\n- Unbekannt: ignoriert\n\n## Anderes\n- Backend: nicht hier";
  const z = bereicheAusDateien(["src/app/a.tsx", "src/lib/b.ts"], text);
  assert.equal(z.find((x) => x.bereich === "Frontend")?.satz, "Neue Freigabe-Seite.");
  assert.match(z.find((x) => x.bereich === "Backend")?.satz ?? "", /serverseitige/);
});
