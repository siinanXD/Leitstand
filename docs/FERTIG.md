# Fertig-Liste Leitstand (v1 Grundgerüst)

Checkliste, die der Wächter zählt (`fertig_v1` / `gesamt_v1` in `loop_snapshot.progress`) und aus der der CEO neue Linear-Issues anlegt (SIN-572).

- Format: eine Zeile je Punkt, `- [ ] Titel` offen, `- [x] Titel` fertig. Der Titel wird zum Linear-Titel; gleicher Titel eines offenen Issues wird nie doppelt angelegt.
- Ohne Punkte zeigt der Leitstand keinen Fortschritt (nichts raten).
- Die Punkte pflegt Sinan; der CEO setzt keine Haken.

## v1 Grundgerüst Leitstand

Haken `[x]` nur mit Beleg: Funktion läuft live (Link auf PR **und** sichtbarer Nachweis, z. B. Snapshot, Screenshot, Lauf). Ohne Beleg bleibt `[ ]`. Belege: `docs/decisions/SIN-618-fertig-liste.md`.

### Sehen
- [ ] Startseite zeigt auf dem Handy ohne Scrollen: was läuft, was hängt, was Sinan tun muss
- [ ] Jede Zahl hat ein Wort, keine IDs auf der Startseite, bunter Handy-Stil nach Figma
- [ ] Je Produkt die Kette live: Planer, Schlange, Worker, PR, Gate, Merge, Deploy
- [ ] Aufgabe antippen zeigt den Ablauf: welcher Agent, welches Werkzeug, was gemeldet
- [ ] Fortschritt je Produkt aus der Fertig-Liste (x von y)
- [ ] Rote Läufe mit Grund, die 3 häufigsten Gründe der letzten 24 h

### Handeln
- [ ] Freigeben mit einem Tipp
- [ ] Pause und Notbremse für den Loop
- [ ] „+ Idee“ landet als Linear-Issue mit Label idee
- [ ] Neues Produkt aus einer Beschreibung anlegen (Projekt, Repo, Fertig-Liste), Sinan bestätigt

### Melden
- [ ] Push aufs iPhone: Braucht dich, Alarm, Tages-Auswertung 20:00
- [ ] Stiller Abbruch des Loops löst Alarm aus

### Kosten und Kontingente
- [ ] Kosten heute und im Monat je Dienst (Langfuse, Anthropic, OpenAI, Higgsfield)
- [ ] Freie Kontingente in Prozent (GitHub Actions, Vercel, Supabase, Linear, Claude-Pausen)
- [ ] Kontingent-Pause mit Reset-Zeit, danach läuft alles von selbst weiter

### Agenten
- [ ] Agenten-Team sichtbar mit letzter Meldung: CEO, Vorarbeiter, Planer, Worker, Designer, Hausmeister, Anwalt, Marketing, Feature, Lern-Agent, Gedächtnis
- [ ] CEO entscheidet je Produkt: weiterbauen, warten oder fertig, und plant die nächste Version
- [ ] Planer legt keine Dubletten an
- [ ] Jede Funktion ist erst Done, wenn sie live läuft

### Werkzeuge und Sicherheit
- [ ] Seite Werkzeuge: jedes Tool grün oder mit konkretem Grund
- [ ] Alle Keys kommen aus Infisical per OIDC, keine kopierten Secrets
- [ ] Anmeldung nur Sinan, Daten strikt getrennt

### Gedächtnis
- [ ] Gedächtnis-Vault zeigt echten Stand (Wo stehen wir, Offen, Tage)
- [ ] Gespräche mit Claude landen über Linear im Vault
- [ ] Vault-Struktur mit Index, Protokoll, Bases-Ansichten und Wochen-Check

