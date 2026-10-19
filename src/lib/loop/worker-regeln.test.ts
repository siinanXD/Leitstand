import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { issueText, type LinearIssue } from './auswahl';
test('SIN-840: Grundregel und fünf Regeln wörtlich in AGENTS und Bauen-Skill', () => {
 const block=readFileSync('docs/autonomy/SIN-840-regeln.md','utf8').trim();
 for(const file of ['AGENTS.md','docs/skills/bauen/SKILL.md']) assert.ok(readFileSync(file,'utf8').includes(block), file);
 for(const regel of ['Vor dem Start den Auftrag aktualisieren.','Behauptungen zuerst gegen Belege prüfen.','Begrenzte Reparaturen automatisch.','Abschluss unabhängig prüfen.','Nur echte Entscheidungen an Sinan.']) assert.ok(block.includes(regel));
});
test('SIN-840: Prompt verlangt Aktualisierung vor erstem Edit, Diagnose vor Reparatur, Abgleich vor Merge', () => {
 const {body}=issueText({identifier:'SIN-840',title:'Auftrag',url:'https://linear.app/sinan/issue/SIN-840',description:''} as LinearIssue);
 for(const teil of ['vor dem ersten Edit','Linear-Kommentare','verlinkte PRs','rollen.json','agents.json','abnahme.yml','Logs/loop_events','vor einer Reparatur','Vor Merge','zwei erfolglosen Reparaturrunden','needs-human']) assert.ok(body.includes(teil),teil);
});
