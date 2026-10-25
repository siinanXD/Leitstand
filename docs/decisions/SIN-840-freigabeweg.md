# SIN-840: Freigabe über die gemeinsame Merge-Policy

Sicherheitsfix, siehe Linear SIN-840 und Audit SIN-1088.

Die Freigabe-API setzt für beide freigegebenen Repositories ausschließlich das Label `freigegeben`. Der bestehende Automerge-Workflow prüft weiterhin den aktuellen Head, Auftragsstand, Build und weitere Sperren. Die API besitzt keinen eigenen Squash-Aufruf mehr. Das Ergebnis bleibt eine Freigabe, keine Behauptung eines abgeschlossenen Merges; die Oberfläche verwendet bereits diesen Wortlaut.

Ein zweiter vollständiger Policy-Nachbau in der API wäre wartungsintensiver und könnte erneut abweichen. Daher wird die bestehende Policy wiederverwendet. Kein neues Recht, Secret, Dienst oder Auslöser.

Regression: Leitstand-Freigabe führt ausschließlich einen Label-Aufruf aus; geschlossene, gemergte und Draft-PRs bleiben abgewiesen; Fehler werden protokolliert. Die bestehenden Gate-Fixtures prüfen separat alte/fehlende Belege, roten Build und geänderten Zielbranch. Live-Freigabe und vollständiger SIN-840-Abschluss bleiben nach Aktivierung gesondert zu belegen.
