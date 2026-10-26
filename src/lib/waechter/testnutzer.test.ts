import assert from "node:assert/strict";
import { test } from "node:test";
import { einrichtenPlan } from "./waechter";
import { hatLogin, hatTestnutzer, pruefeTestnutzer, TESTNUTZER_TITEL } from "./testnutzer";

const mitLogin = [
  { pfad: "src/app/anmelden/page.tsx" },
  { pfad: "src/lib/auth.ts", inhalt: "await supabase.auth.signInWithOtp({ email })" },
];
const ohneLogin = [{ pfad: "src/app/page.tsx", inhalt: "export default function Seite() {}" }, { pfad: "README.md" }];

test("Test: Erkennung „hat Login“ (Fixture mit und ohne Login)", () => {
  assert.equal(hatLogin(mitLogin), true);
  assert.equal(hatLogin(ohneLogin), false);
  assert.equal(hatLogin([{ pfad: "src/app/login/page.tsx" }]), true);
  assert.equal(hatLogin([{ pfad: "x.ts", inhalt: "signInWithPassword(" }]), true);
  assert.equal(hatLogin([{ pfad: "x.ts", inhalt: "const { data } = await supabase.auth.getUser()" }]), true);
  // Ähnliche Namen zählen nicht.
  assert.equal(hatLogin([{ pfad: "src/app/loginhilfe/page.tsx" }, { pfad: "docs/login.md" }]), false);
  // Codex-Fund: auch der Pages-Router zählt.
  assert.equal(hatLogin([{ pfad: "src/pages/login.tsx" }]), true);
  assert.equal(hatLogin([{ pfad: "pages/anmelden/index.tsx" }]), true);
});

test("Testnutzer-Marker: Ordner src/lib/agent-testnutzer oder Entscheidung in docs/decisions", () => {
  assert.equal(hatTestnutzer(["src/lib/agent-testnutzer/sitzung.ts"]), true);
  assert.equal(hatTestnutzer(["docs/decisions/agent-testnutzer-leitstand.md"]), true);
  assert.equal(hatTestnutzer(["docs/decisions/SIN-1-agent-testnutzer.md"]), true);
  assert.equal(hatTestnutzer(["docs/agent-testnutzer.md", "src/lib/testnutzer/routen.ts"]), false);
});

test("Test: Wächter legt das Issue genau einmal an (zweiter Lauf: kein Duplikat)", () => {
  const titel: string[] = [];
  const erster = pruefeTestnutzer("Neu", mitLogin, titel);
  assert.equal(erster.status, "anlegen");
  assert.equal(erster.issue?.titel, TESTNUTZER_TITEL);
  assert.match(erster.issue?.beschreibung ?? "", /SIN-913/);
  assert.match(erster.issue?.beschreibung ?? "", /kein neues Secret/i);
  titel.push(erster.issue!.titel);
  const zweiter = pruefeTestnutzer("Neu", mitLogin, titel);
  assert.equal(zweiter.status, "issue vorhanden");
  assert.equal(zweiter.issue, null);
});

test("Kein Issue ohne Login oder mit vorhandenem Testnutzer", () => {
  assert.deepEqual(pruefeTestnutzer("A", ohneLogin, []), { status: "kein Login", issue: null });
  const mitMarker = [...mitLogin, { pfad: "src/lib/agent-testnutzer/sitzung.ts" }];
  assert.deepEqual(pruefeTestnutzer("B", mitMarker, []), { status: "Testnutzer vorhanden", issue: null });
});

test("Projekt-Starter nennt den Agent-Testnutzer in der Einrichtung", () => {
  assert.match(einrichtenPlan("X").beschreibung, /Agent-Testnutzer/);
});
