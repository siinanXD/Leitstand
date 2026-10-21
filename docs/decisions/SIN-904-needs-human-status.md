# SIN-904: Status `needs_human` in `loop_events`

Variante A: additive Migration erweitert `loop_events_status_check` um `needs_human`. Die Übersicht, der Ablauf und die Agenten lesen `needs_human` bereits als „wartet“; Variante B (`fehler` mit `grund`) hätte alle drei ändern müssen.
