import assert from "node:assert/strict";
import { test } from "node:test";
import { belegAktuell, kriterienHash, ladeAuftrag, leseStand, standMarker } from "../../../scripts/loop/beleg-stand.mjs";

const alt = "a".repeat(40);
const neu = "b".repeat(40);
const issue = "- [ ] Erstens\n- [ ] Zweitens";
const hash = kriterienHash(issue);

test("Beleg mit alter Head-SHA blockiert, mit aktueller SHA lässt zu", () => {
  const stand = leseStand([`Text\n${standMarker(alt, hash)}`]);
  assert.equal(belegAktuell({ stand, headSha: neu, hash }).ok, false);
  assert.deepEqual(belegAktuell({ stand, headSha: alt, hash }), { ok: true });
});

test("fehlender Beleg blockiert, der jüngste Kommentar zählt", () => {
  assert.equal(belegAktuell({ stand: leseStand(["ohne Marker"]), headSha: alt, hash }).ok, false);
  assert.equal(leseStand([standMarker(alt, hash), standMarker(neu, hash)])?.sha, neu);
});

test("geänderter Kriterien-Text ändert den Hash und erzwingt eine neue Runde", () => {
  assert.notEqual(kriterienHash("- [ ] Erstens\n- [ ] Zweitens neu"), hash);
  assert.notEqual(kriterienHash("- [ ] Erstens"), hash);
  const stand = leseStand([standMarker(alt, hash)]);
  const r = belegAktuell({ stand, headSha: alt, hash: kriterienHash("- [ ] Erstens\n- [ ] Drittens") });
  assert.equal(r.ok, false);
});

test("Nur Häkchen-Stand ändert den Hash nicht, Code und Großschreibung bleiben relevant", () => {
  assert.equal(kriterienHash("- [x] Erstens\n- [ ] Zweitens"), hash);
  assert.notEqual(kriterienHash("- [ ] Erstens\n- [ ] `Zweitens`"), hash);
  assert.equal(kriterienHash(null), kriterienHash(""));
});


test("Nummerierte Kriterien, Absatz und Codeänderungen entwerten die Prüfung", () => {
  for (const text of ["1. HTTP 200", "Nur GET", "`Foo` muss laufen"]) {
    assert.notEqual(kriterienHash(text), kriterienHash(text + " und kein POST"));
  }
  assert.notEqual(kriterienHash("`Foo`"), kriterienHash("`foo`"));
  assert.equal(leseStand([standMarker(alt, hash), "<!-- pruefer-zweites-modell -->\nNicht bestanden"]), null);
});

test("aktueller Linear-Auftrag ersetzt veralteten Spiegel; Fehler blockieren", async () => {
  let description = "1. aktuelles Kriterium";
  const holen = async () => new Response(JSON.stringify({ data: { issue: { identifier: "SIN-854", title: "Auftrag", description } } }));
  const a = await ladeAuftrag("fix(loop): Auftrag (SIN-854)", "fixture", holen);
  assert.equal(a.body, description);
  description = "1. geändertes Kriterium";
  const b = await ladeAuftrag("fix(loop): Auftrag (SIN-854)", "fixture", holen);
  assert.notEqual(a.hash, b.hash);
  assert.equal(belegAktuell({ stand: { sha: alt, hash: a.hash }, headSha: alt, hash: b.hash }).ok, false);
  await assert.rejects(ladeAuftrag("ohne Kennung", "fixture", holen));
  await assert.rejects(ladeAuftrag("SIN-854", "", holen));
  await assert.rejects(ladeAuftrag("SIN-854", "fixture", async () => new Response("{}")));
});
