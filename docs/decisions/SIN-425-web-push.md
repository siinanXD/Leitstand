# SIN-425: Web Push mit `web-push`

- Entscheidung (Sinan, 12.10.2026): Versand mit dem npm-Paket `web-push` (VAPID, Verschlüsselung aes128gcm). Lizenz MPL-2.0. Die Abweichung von „MIT/Apache“ ist bewusst freigegeben; das Paket wird nicht erneut geprüft. Selbst bauen wäre riskanter (Verschlüsselung, JWT).
- MPL-2.0 gilt dateiweise: Wir ändern das Paket nicht und binden es nur als Abhängigkeit ein.
- Abos liegen in `public.leitstand_push_abos` (public aus demselben Grund wie in `SIN-525-kopplung.md`). RLS an und erzwungen, keine Rechte für `anon`/`authenticated`; nur `service_role` über die API-Routen, die vorher Sitzung und `leitstand_nutzer` prüfen.
- Abgelaufene Abos (HTTP 404/410 beim Senden) werden gelöscht.
- Keine `actions` in der Mitteilung: iOS zeigt bei Web-Apps keine eigenen Knöpfe. Tippen öffnet die URL aus der Mitteilung (nur Pfade der eigenen Seite).
- Push geht auf dem iPhone ab iOS 16.4 und nur aus der Home-Bildschirm-App; die Einstellungen zeigen sonst einen Hinweis.
- Schlüssel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (Namen in `.env.example`, Werte in Vercel).

## Aufgabe für Sinan (Label `sinan`)

Migration `supabase/migrations/leitstand/20261012100000_push_abos.sql` nach Freigabe einspielen. Danach Akzeptanztest auf dem iPhone 14: Schalter „Mitteilungen“, Knopf „Testmitteilung“, Tippen öffnet die Seite.
