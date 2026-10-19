import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entscheide, leseHaken, setzeHaken, wiederaufnahme, type Beleg } from './haken';
const link = (text: string, beleg = 'https://github.com/fixture/repo/commit/abc'): Beleg => ({ text, belegt: true, beleg, art: 'code' });
test('SIN-840: drei Kriterien, ein Beleg sperrt den Merge; keine ungeprüften alten Haken', () => {
  const text = '- [x] A\n- [x] B\n- [ ] C';
  const e = entscheide({ haken: leseHaken(text), belege: [link('A')], teil: false, runde: 0 });
  assert.notEqual(e.status, 'done');
  assert.deepEqual(e.offen, ['B', 'C']);
  assert.equal(setzeHaken(text, e.belegt), '- [x] A\n- [ ] B\n- [ ] C');
  assert.match(wiederaufnahme('- [ ] A\n- [ ] B'), /A.*B/);
});
test('SIN-840: Dateipfad, leerer Link und widersprüchliche Belege erlauben keinen Abschluss', () => {
  for (const belege of [[link('A', 'src/a.ts')], [link('A', '')], [link('A'), { ...link('A'), belegt: false }]]) {
    assert.notEqual(entscheide({ haken: leseHaken('- [ ] A'), belege, teil: false, runde: 0 }).status, 'done');
  }
  assert.equal(entscheide({ haken: leseHaken('- [ ] A'), belege: [link('A')], teil: false, runde: 0 }).status, 'done');
});
