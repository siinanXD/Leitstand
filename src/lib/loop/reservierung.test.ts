import assert from "node:assert/strict";
import { test } from "node:test";
import { planeFallback, reserviere, type ProviderStand } from "./fallback";
import { auftragAus, blockiert, claimAbgelaufen, supabaseReservierung, verwaist, type Reservierung } from "./reservierung";

test("SIN-896: Claim ohne Worker und PR verfällt nach 90 Min, sonst bleibt er", () => {
  const r: Reservierung = { issue: "SIN-855", revision: 1, provider: "claude", claim: "gh-1", seit: "2026-10-20T08:00:00Z", reparaturen: 0, nachweis: null };
  const lage = { offenerPr: false, workerLaeuft: false as boolean | null, jetzt: new Date("2026-10-20T09:31:00Z") };
  assert.equal(claimAbgelaufen(r, lage), true);
  assert.equal(claimAbgelaufen(r, { ...lage, jetzt: new Date("2026-10-20T09:29:00Z") }), false);
  assert.equal(claimAbgelaufen(r, { ...lage, offenerPr: true }), false);
  assert.equal(claimAbgelaufen(r, { ...lage, workerLaeuft: true }), false);
  assert.equal(claimAbgelaufen(r, { ...lage, workerLaeuft: null }), false);
});

/**
 * Simulation von PostgREST mit echter CAS-Semantik (UPDATE … WHERE claim_revision = alt, INSERT ignore-duplicates).
 * Ein Testspeicher ist kein Live-Nachweis; er belegt nur, dass der Adapter die richtigen bedingten Anfragen stellt.
 */
function fakePostgrest() {
  const zeilen = new Map<string, Record<string, unknown>>();
  const anfragen: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let ausfall: number | null = null;
  const holen = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    anfragen.push({ method, url: url.toString(), body });
    if (ausfall) return new Response("geheimer Fehlertext", { status: ausfall });
    const issue = url.searchParams.get("issue")?.replace(/^eq\./, "");
    const rev = url.searchParams.get("claim_revision")?.replace(/^eq\./, "");
    const antwort = (r: Record<string, unknown>[]) => new Response(JSON.stringify(r), { status: 200 });
    if (method === "GET") {
      const liste = url.searchParams.get("issue")?.match(/^in\.\((.*)\)$/)?.[1].split(",");
      if (liste) return antwort(liste.filter((id) => zeilen.has(id)).map((id) => zeilen.get(id)!));
      return antwort(issue && zeilen.has(issue) ? [zeilen.get(issue)!] : []);
    }
    if (method === "PATCH") {
      const z = issue ? zeilen.get(issue) : undefined;
      if (!z || String(z.claim_revision) !== rev) return antwort([]);
      Object.assign(z, body);
      return antwort([z]);
    }
    if (method === "POST") {
      const id = String(body!.issue);
      if (zeilen.has(id)) return antwort([]);
      zeilen.set(id, { reparaturen: 0, ...body });
      return antwort([zeilen.get(id)!]);
    }
    return new Response("", { status: 405 });
  }) as typeof fetch;
  return { zeilen, anfragen, holen, setzeAusfall: (s: number | null) => (ausfall = s) };
}

const jetzt = new Date("2026-10-19T18:00:00Z");
const frei: ProviderStand = { adapter: true, fehler: null, bis: null, versuche: 0 };
const ohneAdapter: ProviderStand = { adapter: false, fehler: null, bis: null, versuche: 0 };
const speicher = (f: ReturnType<typeof fakePostgrest>) =>
  supabaseReservierung({ url: "https://db.example", key: "k", titel: (id) => `Titel ${id}`, jetzt: () => jetzt, fetch: f.holen });

async function starte(f: ReturnType<typeof fakePostgrest>, claim: string) {
  const s = speicher(f);
  const a = auftragAus(await s.laden("SIN-832"), { pr: 294, branch: "claude/x", codexGeeignet: false });
  const e = planeFallback(a, { claude: frei, codex: ohneAdapter }, jetzt, []);
  return { e, ok: await reserviere(a, e, claim, s) };
}

test("Reservierung: erster Start legt fehlende Zeile an, zweiter Start sieht den Claim als aktiv", async () => {
  const f = fakePostgrest();
  const erster = await starte(f, "lauf-1");
  assert.equal(erster.e.status, "startbereit");
  assert.equal(erster.ok, true);
  assert.equal(f.zeilen.get("SIN-832")!.claim_id, "lauf-1");
  const zweiter = await starte(f, "lauf-2");
  assert.equal(zweiter.e.status, "aktiv");
  assert.equal(zweiter.ok, false);
  assert.equal(f.zeilen.get("SIN-832")!.claim_id, "lauf-1");
});

test("Reservierung: zwei Starts mit demselben gelesenen Stand, nur einer gewinnt (Compare-and-swap)", async () => {
  const f = fakePostgrest();
  f.zeilen.set("SIN-832", { issue: "SIN-832", titel: "T", status: "offen", claim_revision: 0, reparaturen: 0 });
  const s = speicher(f);
  const stand = await s.laden("SIN-832");
  const a = auftragAus(stand, { pr: null, branch: null, codexGeeignet: false });
  const e = planeFallback(a, { claude: frei, codex: ohneAdapter }, jetzt, []);
  const ergebnisse = await Promise.all([reserviere(a, e, "lauf-a", s), reserviere(a, e, "lauf-b", s)]);
  assert.deepEqual(ergebnisse.filter(Boolean).length, 1);
  assert.equal(f.zeilen.get("SIN-832")!.claim_revision, 1);
  for (const q of f.anfragen.filter((x) => x.method === "PATCH")) assert.match(q.url, /claim_revision=eq\.0/);
});

test("Reservierung: Speicherfehler sperrt den Start, Rohtext landet nicht in der Fehlermeldung", async () => {
  const f = fakePostgrest();
  f.setzeAusfall(500);
  await assert.rejects(speicher(f).laden("SIN-832"), (e: Error) => !e.message.includes("geheim") && /HTTP 500/.test(e.message));
  const a = auftragAus({ issue: "SIN-832", revision: 0, provider: null, claim: null, seit: null, reparaturen: 0, nachweis: null }, { pr: null, branch: null, codexGeeignet: false });
  const e = planeFallback(a, { claude: frei, codex: ohneAdapter }, jetzt, []);
  assert.equal(await reserviere(a, e, "lauf-1", speicher(f)), false);
});

test("Reservierung: ohne Titel wird keine Platzhalter-Zeile angelegt", async () => {
  const f = fakePostgrest();
  const s = supabaseReservierung({ url: "https://db.example", key: "k", fetch: f.holen });
  const a = auftragAus(await s.laden("SIN-832"), { pr: null, branch: null, codexGeeignet: false });
  assert.equal(await reserviere(a, planeFallback(a, { claude: frei, codex: ohneAdapter }, jetzt, []), "lauf-1", s), false);
  assert.equal(f.zeilen.size, 0);
});

test("Reparaturzähler: zählt issueweit, bleibt beim Freigeben stehen, ab 2 needs-human auch für einen neuen Provider", async () => {
  const f = fakePostgrest();
  await starte(f, "lauf-1");
  const s = speicher(f);
  assert.equal(await s.zaehleReparatur(await s.laden("SIN-832")), true);
  assert.equal(await s.zaehleReparatur(await s.laden("SIN-832")), true);
  assert.equal(await s.freigeben(await s.laden("SIN-832"), "https://github.com/siinanXD/Leitstand/pull/294"), true);
  const r = await s.laden("SIN-832");
  assert.equal(r.claim, null);
  assert.equal(r.reparaturen, 2);
  const a = auftragAus(r, { pr: 294, branch: "claude/x", codexGeeignet: true });
  assert.equal(planeFallback(a, { claude: frei, codex: frei }, jetzt, []).status, "needs-human");
});

test("Freigeben nur mit Beleg: fremder Host, Query-String oder fehlender Claim werden abgelehnt", async () => {
  const f = fakePostgrest();
  await starte(f, "lauf-1");
  const s = speicher(f);
  const r = await s.laden("SIN-832");
  for (const link of ["https://evil.example/pull/1", "https://github.com/siinanXD/Leitstand/pull/1?token=x", ""]) assert.equal(await s.freigeben(r, link), false);
  assert.equal((await s.laden("SIN-832")).claim, "lauf-1");
  const frei2: Reservierung = { ...r, claim: null, provider: null };
  assert.equal(await s.freigeben(frei2, "https://github.com/siinanXD/Leitstand/pull/294"), false);
});

test("Veralteter Stand: Freigeben mit alter Revision verliert gegen einen neueren Schreiber", async () => {
  const f = fakePostgrest();
  await starte(f, "lauf-1");
  const s = speicher(f);
  const alt = await s.laden("SIN-832");
  assert.equal(await s.zaehleReparatur(alt), true);
  assert.equal(await s.freigeben(alt, "https://github.com/siinanXD/Leitstand/pull/294"), false);
  assert.equal((await s.laden("SIN-832")).claim, "lauf-1");
});

test("Verwaist: nur ohne PR, ohne Spiegel, ohne laufenden Worker und nach 6 h; unbekannter Worker-Zustand hält den Claim", () => {
  const r: Reservierung = { issue: "SIN-832", revision: 1, provider: "claude", claim: "lauf-1", seit: "2026-10-19T10:00:00Z", reparaturen: 0, nachweis: null };
  const lage = { offenerPr: false, gespiegelt: false, workerLaeuft: false as boolean | null, jetzt };
  assert.equal(verwaist(r, lage), true);
  assert.equal(verwaist(r, { ...lage, offenerPr: true }), false);
  assert.equal(verwaist(r, { ...lage, gespiegelt: true }), false);
  assert.equal(verwaist(r, { ...lage, workerLaeuft: true }), false);
  assert.equal(verwaist(r, { ...lage, workerLaeuft: null }), false);
  assert.equal(verwaist({ ...r, seit: "2026-10-19T15:00:00Z" }, lage), false);
});

test("Ungültige Kennung erreicht den Speicher nicht", async () => {
  const f = fakePostgrest();
  await assert.rejects(speicher(f).laden("SIN-1&claim_revision=gt.0"));
  assert.equal(f.anfragen.length, 0);
});

test("Befund 3: fehlt die Zeile, legt die erste Reparaturrunde sie an (mit Titel), ohne Titel keine Runde", async () => {
  const f = fakePostgrest();
  const s = speicher(f);
  const leer = await s.laden("SIN-900");
  assert.equal(await s.zaehleReparatur(leer), false);
  assert.equal(await s.zaehleReparatur(leer, "fix(x): y (SIN-900)"), true);
  assert.equal((await s.laden("SIN-900")).reparaturen, 1);
  assert.equal(await s.zaehleReparatur(leer, "fix(x): y (SIN-900)"), false, "zweiter Schreiber mit altem Stand verliert");
});

test("Befund 1: Claim oder ausgeschöpfte Reparaturen blockieren den Startplatz", () => {
  const r: Reservierung = { issue: "SIN-1", revision: 3, provider: null, claim: null, seit: null, reparaturen: 0, nachweis: null };
  assert.equal(blockiert(r, 2), false);
  assert.equal(blockiert({ ...r, reparaturen: 2 }, 2), true);
  assert.equal(blockiert({ ...r, claim: "x", provider: "claude" }, 2), true);
});

test("Merge setzt Zähler zurück, Stopp nicht", async () => {
  const f = fakePostgrest();
  await starte(f, "lauf-1");
  const s = speicher(f);
  await s.zaehleReparatur(await s.laden("SIN-832"));
  assert.equal(await s.freigeben(await s.laden("SIN-832"), "https://github.com/siinanXD/Leitstand/pull/1"), true);
  assert.equal((await s.laden("SIN-832")).reparaturen, 1, "Stopp/Freigabe ohne Erfolg behält den Zähler");
  assert.equal(await s.freigeben(await s.laden("SIN-832"), "https://github.com/siinanXD/Leitstand/pull/2", true), true);
  assert.equal((await s.laden("SIN-832")).reparaturen, 0, "Merge: Runden davor waren nicht erfolglos");
});

test("Befund 6: HTTP 400 nennt die fehlende Migration", async () => {
  const f = fakePostgrest();
  f.setzeAusfall(400);
  await assert.rejects(speicher(f).laden("SIN-832"), /Migration 20261019200000/);
});

test("staende liefert auch Zeilen ohne Claim (Zähler für den Wächter)", async () => {
  const f = fakePostgrest();
  f.zeilen.set("SIN-5", { issue: "SIN-5", titel: "T", status: "offen", claim_revision: 2, reparaturen: 2 });
  const st = await speicher(f).staende(["SIN-5", "SIN-6"]);
  assert.deepEqual(st.map((r) => [r.issue, r.reparaturen, r.claim]), [["SIN-5", 2, null]]);
});
