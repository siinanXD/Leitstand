# SIN-510: Anmeldung per 6-stelligem Code

- Problem: Die Home-Bildschirm-App am iPhone hat einen eigenen Speicher. Der Magic-Link öffnet Safari, dort ist man dann angemeldet, nicht in der App.
- Entscheidung: `signInWithOtp` verschickt weiter Link und Code (`shouldCreateUser: false`). Zusätzlich prüft `/anmelden` den Code mit `verifyOtp({ email, token, type: 'email' })` (`pruefeCode` in `src/lib/zugang.ts`). Zugriff bleibt an `leitstand_nutzer` (RLS) gebunden; die Sitzung hält der Refresh-Token.
- Falscher und abgelaufener Code melden dasselbe; Eingaben, die keine 6 Ziffern sind, gehen gar nicht an Supabase.

## Aufgabe für Sinan (Label `sinan`)

Supabase → Authentication → Email Templates → „Magic Link“ muss den Code enthalten. Vorlagentext (Betreff „Dein Leitstand-Zugang“):

```html
<h2>Leitstand</h2>
<p>Code für die App auf dem Home-Bildschirm: <strong>{{ .Token }}</strong></p>
<p>Oder am selben Gerät den Link öffnen: <a href="{{ .ConfirmationURL }}">Anmelden</a></p>
```

Hinweis: Die Länge des Codes (Standard 6) steht unter Authentication → Providers → Email → „Email OTP Length“.

## Nachtrag SIN-524: Link statt Code

Ohne eigenes SMTP enthält die Standard-Mail keinen Code. `/anmelden` nimmt deshalb den kopierten Link („Sign in“ lange drücken → Link kopieren) und legt die Sitzung mit `verifyOtp({ token_hash, type })` an (`leseLink`, `pruefeLink` in `src/lib/zugang.ts`). Erlaubt sind nur Links des eigenen Supabase-Hosts (Pfad `/auth/v1/verify`) und die Typen `magiclink` und `email`; alles andere meldet dasselbe wie ein falscher Code. Das Code-Feld bleibt, ist aber zweitrangig, bis eigenes SMTP (z. B. Resend, Label `sinan`) eingerichtet ist.
