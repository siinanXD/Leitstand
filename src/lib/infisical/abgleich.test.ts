import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { pruefeRegister, type Produkt } from "../kontingent/produkte";
import { abgeschlossene, erinnerungen, gleicheAb, plane, type Ist } from "./abgleich";
import { ladeIst, legeAn, type Fetch, type Verbindung } from "./client";

const register = (JSON.parse(readFileSync("docs/autonomy/produkte.json", "utf8")) as { produkte: Produkt[] }).produkte;
const produkt = (id: string) => register.find((p) => p.id === id)!;

test("Soll-Liste: jeder Name aus .env.example und den Workflows steht beim Leitstand", () => {
  const beispiel = readFileSync(".env.example", "utf8").split("\n").flatMap((z) => /^([A-Z][A-Z0-9_]*)=/.exec(z)?.[1] ?? []);
  const workflows = readdirSync(".github/workflows").flatMap((f) => [...readFileSync(`.github/workflows/${f}`, "utf8").matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
  const soll = new Set(produkt("leitstand").secrets.map((s) => s.name));
  const fehlt = [...new Set([...beispiel, ...workflows])].filter((n) => n !== "GITHUB_TOKEN" && !soll.has(n));
  assert.deepEqual(fehlt, []);
  assert.ok(beispiel.length > 10);
});

test("Soll-Liste: Stromlauf AI und Register sind gültig, jeder Eintrag hat Anleitung", () => {
  assert.deepEqual(pruefeRegister(register), []);
  assert.equal(produkt("stromlauf-ai").infisicalOrdner, "/stromlauf-ai");
  for (const s of register.flatMap((p) => p.secrets)) assert.ok(s.zweck && s.wo_holen && s.environment, s.name);
});

const GEHEIM = "sk-test-GEHEIMER-WERT-1234567890";
const klein: Produkt[] = [{ ...produkt("stromlauf-ai"), secrets: produkt("stromlauf-ai").secrets.slice(0, 2) }];
const [a, b] = klein[0].secrets;
const nur = (ist: Partial<Ist>): Ist => ({ ordner: [], variablen: [], ...ist });
const ordner = [{ environment: "dev", pfad: "/stromlauf-ai" }];

test("Abgleich liefert die vier Befundarten", () => {
  assert.deepEqual(gleicheAb(klein, nur({})).map((x) => x.art), ["fehlender_ordner", "fehlende_variable", "fehlende_variable"]);
  const ist = nur({
    ordner,
    variablen: [
      { environment: "dev", pfad: "/stromlauf-ai", name: a.name, leer: true },
      { environment: "dev", pfad: "/stromlauf-ai", name: b.name, leer: false },
      { environment: "dev", pfad: "/stromlauf-ai", name: "ALTES_ZEUG", leer: false },
    ],
  });
  assert.deepEqual(gleicheAb(klein, ist).map((x) => [x.art, "name" in x ? x.name : ""]), [["leerer_wert", a.name], ["unbekannt_in_infisical", "ALTES_ZEUG"]]);
});

test("Werte kommen in keinem Befund, keiner Erinnerung und keinem Log vor", async () => {
  const logs: string[] = [];
  const log = console.log;
  console.log = (...x: unknown[]) => void logs.push(x.join(" "));
  try {
    const f: Fetch = async (u) =>
      new Response(JSON.stringify(u.includes("/folders") ? { folders: [{ name: "stromlauf-ai" }] } : { secrets: [{ secretKey: a.name, secretValue: "" }, { secretKey: b.name, secretValue: GEHEIM }] }));
    const ist = await ladeIst({ fetch: f, token: "t", projektId: "p" }, [{ environment: "dev", pfad: "/stromlauf-ai" }]);
    const befunde = gleicheAb(klein, ist);
    const aus = JSON.stringify([ist, befunde, plane(befunde), erinnerungen(befunde, klein, "https://eu.infisical.com/x")]);
    assert.ok(!aus.includes(GEHEIM) && !logs.join().includes(GEHEIM));
    assert.deepEqual(ist.variablen.map((v) => v.leer), [true, false]);
  } finally {
    console.log = log;
  }
});

test("Pflege legt nur an: Ordner, Variable mit leerem Wert, nie überschreiben, nie löschen", async () => {
  const aufrufe: { methode: string; body: unknown }[] = [];
  const f: Fetch = async (_u, init) => {
    aufrufe.push({ methode: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response("{}");
  };
  const v: Verbindung = { fetch: f, token: "t", projektId: "p" };
  const aktionen = plane(gleicheAb(klein, nur({})));
  assert.deepEqual(aktionen.map((x) => x.art), ["ordner_anlegen", "variable_anlegen", "variable_anlegen"]);
  // vorhandener, gefüllter Wert und leerer Wert erzeugen keine Aktion
  const ist = nur({ ordner, variablen: [{ environment: "dev", pfad: "/stromlauf-ai", name: a.name, leer: true }, { environment: "dev", pfad: "/stromlauf-ai", name: b.name, leer: false }, { environment: "dev", pfad: "/stromlauf-ai", name: "X", leer: false }] });
  assert.deepEqual(plane(gleicheAb(klein, ist)), []);
  for (const x of aktionen) await legeAn(v, x);
  assert.ok(aufrufe.every((c) => c.methode === "POST"));
  assert.deepEqual(aufrufe.filter((c) => "secretValue" in (c.body as object)).map((c) => (c.body as { secretValue: string }).secretValue), ["", ""]);
  assert.deepEqual(aufrufe[0].body, { workspaceId: "p", environment: "dev", name: "stromlauf-ai", path: "/" });
  assert.equal(await legeAn({ ...v, fetch: async () => new Response("", { status: 409 }) }, aktionen[0]), "vorhanden");
  await assert.rejects(legeAn({ ...v, fetch: async () => new Response("", { status: 403 }) }, aktionen[0]), /HTTP 403/);
});

test("Erinnerung: leerer Wert erscheint mit Link und Anleitung, verschwindet nach dem Füllen", () => {
  const leer = nur({ ordner, variablen: [{ environment: "dev", pfad: "/stromlauf-ai", name: a.name, leer: true }, { environment: "dev", pfad: "/stromlauf-ai", name: b.name, leer: true }] });
  const e = erinnerungen(gleicheAb(klein, leer), klein, "https://eu.infisical.com/p");
  assert.equal(e.length, 2);
  assert.equal(e[0].titel, `Stromlauf Ai: Wert für \`${a.name}\` in Infisical eintragen`);
  assert.match(e[0].beschreibung, /https:\/\/eu\.infisical\.com\/p\?secretPath=%2Fstromlauf-ai&env=dev/);
  assert.ok(e[0].beschreibung.includes(a.wo_holen));
  const offen = [...e.map((x) => x.titel), "Repo x braucht claude.yml und Secret"];
  const gefuellt = nur({ ordner, variablen: [{ environment: "dev", pfad: "/stromlauf-ai", name: a.name, leer: false }, { environment: "dev", pfad: "/stromlauf-ai", name: b.name, leer: true }] });
  assert.deepEqual(abgeschlossene(offen, erinnerungen(gleicheAb(klein, gefuellt), klein, "u")), [e[0].titel]);
});
