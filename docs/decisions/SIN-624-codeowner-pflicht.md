# SIN-624: Codeowner-Pflicht-Review gegen Selbstumbau

Datum: 14.10.2026. Anlass: Seit SIN-616 ändern Agenten ihre Workflows und das Gate selbst; das Gate war umgehbar (SIN-623). Die Schutzschicht muss außerhalb der Reichweite der Agenten liegen.

## Entscheidung

- `.github/CODEOWNERS` nennt `@siinanXD` für `.github/workflows/` (damit auch `automerge.yml`), `CODEOWNERS` selbst und die Gate-Logik `scripts/loop/risiko.mjs`.
- Ein Ruleset auf `main` verlangt „Require review from Code Owners“ (1 Review). Bypass-Liste leer, also auch für Bots/Apps nicht umgehbar. Auto-Merge wartet dann, bis Sinan reviewt hat; PRs ohne diese Pfade mergen weiter automatisch.
- `AGENT_WORKFLOW_TOKEN` bekommt kein Recht „Administration“ und kann Rulesets nicht ändern.
- Das Ruleset legt Sinan an: Worker und Repo-Token haben kein Administrationsrecht. Ohne Ruleset ist CODEOWNERS wirkungslos.
- Freigabe: in GitHub unter „Files changed → Review changes → Approve“. Das Label `freigegeben` ersetzt das Review nicht. Ein Leitstand-Tipp, der das Review setzt, ist nicht gebaut: Ein Review zählt nur von Sinans eigenem Konto, ein Leitstand-Token wäre ein Bot.

## Ruleset einrichten (je Repo: Leitstand, Content-Agent-Lernapp, gedaechtnis)

Settings → Rules → Rulesets → New branch ruleset, Ziel `main`, Bypass-Liste leer, „Require a pull request before merging“ mit 1 Approval und **Require review from Code Owners**. Die Regel „Require status checks: build“ bleibt. Oder per CLI mit einem Administrations-Token:

```
gh api -X POST repos/siinanXD/<REPO>/rulesets --input - <<'JSON'
{"name":"Codeowner-Review","target":"branch","enforcement":"active","bypass_actors":[],
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"pull_request","parameters":{"required_approving_review_count":1,
   "require_code_owner_review":true,"dismiss_stale_reviews_on_push":true,
   "require_last_push_approval":false,"required_review_thread_resolution":false}}]}
JSON
```

## Offen für Sinan

- Ruleset in allen drei Repos anlegen (siehe oben).
- `.github/CODEOWNERS` in `siinanXD/Content-Agent-Lernapp` (Gate: `scripts/autonomy/risk.mjs`) und `siinanXD/gedaechtnis` anlegen; aus diesem Repo nicht änderbar.
- Prüfen: Test-PR mit Workflow-Änderung bleibt ohne Review ungemergt, Test-PR ohne mergt automatisch.
