import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("./app/globals.css", import.meta.url), "utf8");
const farbe = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(m, `Token ${name} fehlt`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("Text auf Flächen hat mindestens 4,5:1 (WCAG AA)", () => {
  for (const bg of ["bg-base", "bg-surface", "bg-raised"]) {
    assert.ok(kontrast(farbe("text-primary"), farbe(bg)) >= 4.5, `text-primary auf ${bg}`);
    assert.ok(kontrast(farbe("text-secondary"), farbe(bg)) >= 4.5, `text-secondary auf ${bg}`);
  }
  assert.ok(kontrast(farbe("text-primary"), farbe("accent-strong")) >= 4.5, "weißer Text auf accent-strong");
});

test("Leitstand bunt (SIN-546): Text und weißer Text auf Akzent haben mindestens 4,5:1", () => {
  const bunt = readFileSync(new URL("./app/bunt.css", import.meta.url), "utf8");
  const wert = (name: string) => bunt.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1] ?? assert.fail(`Token ${name} fehlt`);
  for (const bg of ["bg-base", "bg-surface", "bunt-sonne", "bunt-gruen", "bunt-blau", "bunt-lila", "bunt-pfirsich"]) {
    assert.ok(kontrast(wert("text-primary"), wert(bg)) >= 4.5, `text-primary auf ${bg}`);
    assert.ok(kontrast(wert("text-secondary"), wert(bg)) >= 4.5, `text-secondary auf ${bg}`);
  }
  for (const bg of ["accent-strong", "accent-primary", "bunt-violett", "status-ok", "status-warn", "status-error"]) assert.ok(kontrast(wert("bunt-auf-akzent"), wert(bg)) >= 4.5, `weiß auf ${bg}`);
});
