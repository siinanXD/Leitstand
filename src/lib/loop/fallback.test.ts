import assert from "node:assert/strict";
import { test } from "node:test";
import { fehlerklasse, nachFehler, planeFallback, reserviere, type Auftrag, type ProviderStand, type Speicher } from "./fallback";

const jetzt = new Date("2026-10-19T18:00:00Z");
const beleg = "https://github.com/siinanXD/Leitstand/actions/runs/39288861498";
const frei = (): ProviderStand => ({ adapter: true, fehler: null, bis: null, versuche: 0 });
const auftrag = (): Auftrag => ({ issue: "SIN-832", pr: 294, branch: "claude/issue-293-20261019-1231", revision: 0, worker: null, reparaturen: 0, codexGeeignet: true });
const plane = (a = auftrag(), claude = frei(), codex = frei()) => planeFallback(a, { claude, codex }, jetzt, [beleg]);

test("Claude verfügbar: nur startbereit, niemals als gestarteter Worker ausgeben", () => {
  assert.equal(plane().provider, "claude");
  assert.equal(plane().status, "startbereit");
});

test("Claude-Quota: Codex übernimmt nur mit vorhandenem Adapter; PR und Branch bleiben", () => {
  const leer = nachFehler(frei(), "kontingent", jetzt);
  const e = plane(auftrag(), leer);
  assert.equal(e.provider, "codex");
  assert.equal(e.pr, 294);
  assert.equal(e.branch, auftrag().branch);
  assert.equal(plane(auftrag(), leer, { ...frei(), adapter: false }).status, "wartend");
});

test("Beide leer: Auftrag bleibt nach JSON-Neuladen wartend; nach Cooldown wieder startbereit", () => {
  const leer = nachFehler(frei(), "kontingent", jetzt);
  const a = JSON.parse(JSON.stringify(auftrag()));
  const staende = JSON.parse(JSON.stringify({ claude: leer, codex: leer }));
  assert.equal(planeFallback(a, staende, jetzt, [beleg]).status, "wartend");
  assert.equal(planeFallback(a, staende, new Date(leer.bis!), [beleg]).provider, "claude");
});

test("Auth, Verbindung und unklare Fehler werden nicht durch Zeitablauf gesund", () => {
  for (const klasse of ["auth", "verbindung", "unbekannt"] as const) {
    const defekt = nachFehler(frei(), klasse, jetzt);
    assert.equal(planeFallback(auftrag(), { claude: defekt, codex: { ...frei(), adapter: false } }, new Date("2026-11-01"), []).status, "wartend");
  }
});

test("Netz/Quota: höchstens zwei Wiederholungen; fachlicher Fehler zählt nicht als Providerausfall", () => {
  for (const klasse of ["netz", "kontingent"] as const) {
    const eins = nachFehler(frei(), klasse, jetzt);
    const zwei = nachFehler(eins, klasse, new Date(eins.bis!));
    const drei = nachFehler(zwei, klasse, new Date(zwei.bis!));
    assert.equal(drei.bis, null);
    assert.equal(planeFallback(auftrag(), { claude: drei, codex: drei }, new Date("2026-11-01"), []).status, "wartend");
  }
  assert.deepEqual(nachFehler(frei(), "fachlich", jetzt), frei());
});

test("Aktiver/unklar beendeter Worker bleibt Eigentümer, auch nach langem Timeout", () => {
  const a = { ...auftrag(), worker: { provider: "claude" as const, claim: "run-1" } };
  assert.equal(plane(a).status, "aktiv");
  assert.equal(plane(a).provider, "claude");
  assert.equal(plane(a).branch, a.branch);
  assert.equal(plane({ ...auftrag(), codexGeeignet: false }, nachFehler(frei(), "kontingent", jetzt)).status, "wartend");
});

test("Zwei erfolglose Reparaturen stoppen providerübergreifend", () => {
  assert.equal(plane({ ...auftrag(), reparaturen: 1 }).status, "startbereit");
  assert.equal(plane({ ...auftrag(), reparaturen: 2 }).status, "needs-human");
  assert.equal(plane({ ...auftrag(), reparaturen: 3 }).status, "needs-human");
});

test("Vorhandener Claim bleibt auch an der Reparaturgrenze aktiv", () => {
  const a = { ...auftrag(), reparaturen: 2, worker: { provider: "claude" as const, claim: "run-1" } };
  assert.equal(plane(a).status, "aktiv");
  assert.equal(plane(a).provider, "claude");
});

test("Expliziter Fachfehler hat Vorrang vor Transportmustern im Testoutput", () => {
  for (const f of [{ status: 503 }, { status: 401 }, { text: "network error" }, { text: "usage limit reached" }]) {
    assert.equal(fehlerklasse({ ...f, fachlich: true }), "fachlich");
  }
});

test("Fehlerklassen unterscheiden belegte Quota, Auth, Netz, Verbindung und Fachfehler", () => {
  assert.equal(fehlerklasse({ status: 429 }), "kontingent");
  assert.equal(fehlerklasse({ text: "usage limit reached" }), "kontingent");
  assert.equal(fehlerklasse({ status: 401, text: "usage limit reached" }), "auth");
  assert.equal(fehlerklasse({ status: 503 }), "netz");
  assert.equal(fehlerklasse({ text: "ECONNRESET" }), "netz");
  assert.equal(fehlerklasse({ text: "create an environment for this repo" }), "verbindung");
  assert.equal(fehlerklasse({ text: "is_error:true after 0s" }), "unbekannt");
  assert.equal(fehlerklasse({ fachlich: true }), "fachlich");
});

test("Ereignis enthält nur feste Felder und kanonische Nachweislinks, keine Fehlerrohtexte", () => {
  const e = planeFallback(auftrag(), { claude: frei(), codex: frei() }, jetzt, [beleg, beleg, "https://example.org/?token=secret", beleg + "?token=secret"]);
  assert.deepEqual(e.nachweise, [beleg]);
  assert.equal(e.zeitstempel, jetzt.toISOString());
  assert.equal(e.fehlerklasse, null);
  assert.ok(!JSON.stringify(e).includes("secret"));
  assert.throws(() => planeFallback({ ...auftrag(), reparaturen: -1 }, { claude: frei(), codex: frei() }, jetzt, []));
});

test("Atomare Reservierung verhindert doppelte Worker; Speicherausfall erlaubt keinen Start", async () => {
  let stand = auftrag();
  const speicher: Speicher = {
    async tausche(issue, revision, neu) {
      if (issue !== stand.issue || revision !== stand.revision) return false;
      stand = JSON.parse(JSON.stringify(neu));
      return true;
    },
  };
  const a = auftrag();
  const e = plane(a);
  const r = await Promise.all([reserviere(a, e, "run-1", speicher), reserviere(a, e, "run-2", speicher)]);
  assert.equal(r.filter(Boolean).length, 1);
  assert.equal(plane(stand).status, "aktiv");
  assert.equal(stand.pr, 294);
  assert.equal(await reserviere(a, e, "run-3", { async tausche() { throw new Error("offline"); } }), false);
  assert.equal(await reserviere(a, { ...e, issue: "SIN-999" }, "run-4", speicher), false);
  assert.equal(await reserviere({ ...a, codexGeeignet: false }, { ...e, provider: "codex" }, "run-5", speicher), false);
});
