import assert from "node:assert/strict";
import { test } from "node:test";
import { belegAktuell, kriterienHash, leseStand, standMarker } from "../../../scripts/loop/beleg-stand.mjs";

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

test("Häkchen setzen und Formatierung ändern den Hash nicht", () => {
  assert.equal(kriterienHash("- [x] Erstens\n- [ ] `Zweitens`"), hash);
  assert.equal(kriterienHash(null), kriterienHash(""));
});
