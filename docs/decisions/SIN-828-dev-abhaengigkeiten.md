# SIN-828: Auditbefund ohne verfügbaren Paketfix

Stand: 18.10.2026. Ergebnis: Risiko offen, bestehende Eingangsbegrenzung geprüft.

## Reproduktion

Auf Übergabe-Commit `096e2e4792c3796f8a0018334d97f33ff1246fe6`, Node 24.19.0 / npm 11.9.0:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm audit --json                 # Exit 1: 5 high, keine critical
npm audit --omit=dev --json      # Exit 0: 0 bekannte Befunde
npm ls braces micromatch fast-glob @next/eslint-plugin-next eslint-config-next
```

Ein gemeinsamer Ursprung: `eslint-config-next@16.3.8` → `@next/eslint-plugin-next@16.3.8` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`. Alle fünf Pakete gehören zur Entwicklungsabhängigkeitskette; es sind keine fünf unabhängigen Lücken. Null Produktionsbefunde bedeutet keine vollständige Sicherheitsfreigabe.

## Primärquellen und Patchstand

- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), geprüft 18.10.2026: betroffen bis einschließlich 3.0.3, keine gepatchte Version. Tief verschachtelte Brace-Muster können rekursive AST-Verarbeitung zum Stackoverflow bringen (Verfügbarkeit).
- `npm view braces version versions --json` meldet am selben Tag 3.0.3 als neueste Version. Der Audit-Vorschlag `eslint-config-next@14.2.35` ist ein Major-Downgrade, kein belegter kompatibler Fix für Next 16.3.8.
- [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/): Metabefunde entstehen entlang der Abhängigkeitskette. Nicht automatisch reparierbare Befunde benötigen Bewertung.
- Installierte, durch den Lockfile festgelegte Primärimplementierung: `node_modules/@next/eslint-plugin-next/dist/utils/get-root-dirs.js`, `dist/rules/no-html-link-for-pages.js` sowie `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`. Diese lokalen Versionsquellen sind maßgeblich für den geprüften Aufrufpfad.

## Erreichbarkeit und begrenzte Mitigation

Das Next-Lint-Plugin ruft `fast-glob.globSync` im untersuchten Pfad nur auf, wenn `settings.next.rootDir` als String oder Array gesetzt ist. Sonst verwendet es direkt `context.cwd`. Die wirksame Repo-Konfiguration setzt dieses Feld nicht. App-Quelltext und Dateinamen werden in diesem Pfad nicht als `rootDir`-Glob übernommen. `src/` und `scripts/` importieren keines der betroffenen Pakete direkt.

`src/lib/standard/lint-globs.test.ts` prüft die aufgelöste ESLint-Konfiguration für TSX, TS und MJS und instrumentiert die tatsächlich installierte `globSync`-Funktion mit einem abbrechenden Sensor. Der normale Root-Aufruf erreicht ihn nicht; die negative Kontrolle mit einem harmlosen `rootDir: "src/**"` erreicht ihn. Keine schädlichen Tiefen-Muster werden ausgeführt. Der Test läuft im bestehenden `npm test`; ein späterer rootDir-Override verlangt erneute Bewertung.

Das ist ein Nachweis für diesen konkreten Eingang, kein Patch des Parsers und kein Beweis für sämtliche transitiven Codepfade. Die bestehenden Grenzen bleiben: feste Lockdatei, keine externen/unvertrauenswürdigen rootDir-Globs übernehmen, isolierte PR-Builds mit `contents: read` und 20-Minuten-Timeout. Der Next-Build ab Version 16 führt Lint nicht automatisch aus; der Repo-Workflow führt es ausdrücklich separat aus. Privilegierte Prüfer-Ausführung bleibt unabhängig in SIN-827 offen.

Ein Angreifer mit Änderungsmöglichkeit an ESLint-Konfiguration, npm-Skripten oder Workflow hat darüber hinaus allgemeine Codeausführung im Build-Kontext. Dieser Regressionstest ersetzt keine Vertrauensgrenzenprüfung. Kein Rootdir-Override, Paket-Override, Alert-Suppressionsmechanismus oder Gate wird hinzugefügt; die vorhandene Begrenzung wird dokumentiert und gegen versehentliche Änderungen geprüft.

## Entscheidung und Wiedervorlage

Kein `npm audit fix --force`, kein Framework-Downgrade und keine unbestätigte Paketversion. Paketdateien bleiben unverändert. SIN-828 bleibt bis unabhängiger Abnahme In Review; auch nach Abnahme dieser Bewertung bleibt die bekannte Lücke offen, bis ein unterstütztes Update sie beseitigt.

Erneut prüfen, sobald braces oder die Next-Lint-Kette einen belegten Patch veröffentlicht, sich Lockdatei/ESLint-Konfiguration ändern oder ein neuer Glob-Eingang hinzugefügt wird. Dann Audit vollständig und Produktion, Sensor-Test, Lint, Typecheck, Gesamttests und Build wiederholen. Ein unverändert roter Audit wird nicht durch Abschalten einer Prüfung grün gemacht.

## Prüfungen

Siehe PR 268 für konkrete Ergebnisse und Commit. Die Datei-Probe in `docs/abnahme.yml` bestätigt ausschließlich, dass diese Risikobewertung vorhanden ist; sie ist kein grüner Schwachstellen-Scan.
