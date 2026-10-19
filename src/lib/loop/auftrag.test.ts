import assert from "node:assert/strict";
import { test } from "node:test";
import { auftragsHaken, auftragStand, auftragText, ladeAuftrag, type Auftrag } from "./auftrag";

const auftrag: Auftrag = { id: "uuid", identifier: "SIN-830", title: "Rollen", description: "- [ ] Live belegen", team: { id: "team" }, kommentare: [{ id: "c1", body: "27 Rollen aus rollen.json, nicht 13 aus agents.json" }], parent: null };

test("Auftrag enthält Kommentare und Elternauftrag; Nachtrag entwertet alten Prüfstand", () => {
  const neu = { ...auftrag, kommentare: [...auftrag.kommentare, { id: "c2", body: "Speicherung scheitert mit HTTP 400" }], parent: { ...auftrag, identifier: "SIN-834", kommentare: [] } };
  assert.match(auftragText(neu), /27 Rollen/);
  assert.match(auftragText(neu), /SIN-834/);
  assert.notEqual(auftragStand(auftrag), auftragStand(neu));
  assert.notEqual(auftragStand(auftrag), auftragStand({ ...auftrag, kommentare: [{ id: "c1", body: "Nachtrag korrigiert" }] }));
  assert.equal(auftragStand(auftrag), auftragStand({ ...auftrag, description: "- [x] Live belegen", kommentare: [...auftrag.kommentare, { id: "auto", body: "<!-- haken-runde -->\nStatus" }] }));
});

test("Nachtragskriterien zählen, Master-Checkboxen und eigene Statusmeldungen erweitern den Scope nicht", () => {
  const a = { ...auftrag, kommentare: [{ id: "a", body: "- [ ] Neuer Nachweis" }, { id: "auto", body: "<!-- haken-runde -->\n- [ ] Statusausgabe" }], parent: { ...auftrag, description: "- [ ] Gesamtes Produkt fertig" } };
  assert.deepEqual(auftragsHaken(a).map((h) => h.text), ["Live belegen", "Neuer Nachweis"]);
});

test("verknüpften Masterauftrag mit eigenen Kommentaren laden; Fehler nicht durch alten Spiegel ersetzen", async () => {
  const seite = (id: unknown) => ({ issue: { ...auftrag, identifier: String(id), updatedAt: "t1", parent: null, comments: { nodes: [{ id: "c", body: `Stand ${id}` }], pageInfo: { hasNextPage: false, endCursor: null } }, relations: { nodes: id === "SIN-830" ? [{ relatedIssue: { identifier: "SIN-834", title: "Work-Wiederaufnahme: Masterauftrag" } }] : [], pageInfo: { hasNextPage: false } } } });
  const a = await ladeAuftrag(async (_q, v) => seite(v.id), "SIN-830");
  assert.match(auftragText(a), /Stand SIN-834/);
  await assert.rejects(ladeAuftrag(async () => { throw new Error("Quelle offline"); }, "SIN-830"), /offline/);
});

test("Linear-Kommentare vollständig paginieren; fehlerhafte Cursor oder geänderte Quelle stoppen", async () => {
  const seite = (after: unknown) => ({ issue: { ...auftrag, updatedAt: "t1", comments: { nodes: after ? [{ id: "c2", body: "Nachtrag" }] : auftrag.kommentare, pageInfo: { hasNextPage: !after, endCursor: "next" } } } });
  const gelesen = await ladeAuftrag(async (_q, v) => seite(v.after), "SIN-830");
  assert.equal(gelesen.kommentare.length, 2);
  assert.match(auftragText(gelesen), /Nachtrag/);
  await assert.rejects(ladeAuftrag(async () => seite(null), "SIN-830"), /Cursor/);
  await assert.rejects(ladeAuftrag(async (_q, v) => ({ issue: { ...seite(v.after).issue, updatedAt: v.after ? "t2" : "t1" } }), "SIN-830"), /geändert/);
  await assert.rejects(ladeAuftrag(async () => ({ issue: null }), "SIN-830"), /nicht gefunden/);
});

test('SIN-840: Zusatzkriterium ohne Checkbox zählt; Reparaturprotokoll ändert den Auftrag nicht', () => {
 const a: Auftrag = {id:'uuid',identifier:'SIN-840',title:'Auftrag',description:'- [ ] A',team:{id:'team'},kommentare:[],parent:null};
 const zusatz = '**Zusatzkriterium (Sinan):** Drei Wirkungszahlen anzeigen.';
 const neu={...a,kommentare:[{id:'neu',body:zusatz}]};
 assert.ok(auftragsHaken(neu).some(h=>h.text===zusatz));
 assert.notEqual(auftragStand(a),auftragStand(neu));
 assert.equal(auftragStand(a),auftragStand({...a,kommentare:[{id:'status',body:'<!-- repair-runde:1 -->\nFehler wird repariert'}]}));
});
