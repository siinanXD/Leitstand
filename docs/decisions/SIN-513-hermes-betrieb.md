# SIN-513: Hermes Agent in GitHub Actions als Betriebs-Agent

**Links:** Linear [SIN-513](https://linear.app/sinan-kahraman/issue/SIN-513), Vorgänger SIN-512 (Lern-Agent), Push SIN-425/426.

## Entscheidung (Sinan, 12.10.)

- Betriebsart (a): Zeitplan in GitHub Actions, kein Railway, kein Gateway, **kein Telegram**.
- Ergebnisse gehen nur in den Leitstand: Ereignisse in `loop_events` (Agent `betrieb`), Tagesbericht als Karte in der Übersicht, Wichtiges unter „Braucht dich“, Push über den Leitstand.

## Grenzen (bitte so lesen)

- Hermes per Chat anschreiben geht **nicht**: dafür braucht es einen dauernd laufenden Prozess. Es gibt nur geplante Läufe.
- Dieser PR enthält **kein Hermes**. Ich konnte Installation, Lizenz, Modellanbindung (OpenRouter oder eigener Endpoint für Claude) und Speicherform von Gedächtnis/Skills in diesem Lauf nicht prüfen (kein Webzugriff genutzt). Das bleibt vor dem Einbau zu klären; Schätzungen der Tageskosten sind deshalb offen und stehen nirgends als Zahl.
- Neue Actions außer `actions/*`/`anthropics/*` oder neue Secrets machen den PR **risk:high**. Sinan gibt frei.

## Abgrenzung zum Lern-Agent

Der Lern-Agent (`scripts/lernen/lernen.ts`) sammelt Lehren in `docs/autonomy/lehren/` und schreibt `docs/autonomy/berichte/lernen-<Datum>.json`. Der Betriebs-Agent liest diesen Bericht und die Lehren, pflegt sie nicht doppelt und baut daraus den Tagesbericht.

## Umgesetzt (dieser PR)

- `src/lib/betrieb/betrieb.ts` (rein, mit Tests): Kostenbudget je Lauf (Standard 0,25 $) und je Tag (Standard 1 $), per `BETRIEB_MAX_USD_LAUF` / `BETRIEB_MAX_USD_TAG` änderbar; Ereignis für `loop_events` mit Agent `betrieb` und Kosten; Tagesbericht nur aus echten Berichtsdaten, ohne Bericht „keine Daten“.

## Noch offen

- Hermes selbst: Anbindung, Kosten je Tag, Ablage von Gedächtnis/Skills (Repo oder Supabase). Erst nach Prüfung der oben genannten Punkte.
- Skript `scripts/betrieb/`, das Budget prüft, den Bericht liest und Ereignis plus Tagesbericht in Supabase schreibt (braucht Entscheidung zur Tabelle/Spalte für die Karte).
- Workflow `betrieb.yml`: Agenten dürfen `.github/workflows/` nicht ändern; Sinan legt ihn an, sobald das Skript steht.
- Karte „Tagesbericht“ in der Übersicht, Anzeige unter „Braucht dich“ und Push (SIN-425/426).
