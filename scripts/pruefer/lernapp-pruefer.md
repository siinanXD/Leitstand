# Ein Prüfer für die Lern-App (SIN-939)

Der Leitstand-Prüfer (`pruefer.yml`) prüft PRs der Lern-App (`siinanXD/Content-Agent-Lernapp`) wie Leitstand-PRs: Diff, Fertig-Kriterien aus Linear, Belege. Der Diff wird nur per `git fetch` gelesen, nie ausgecheckt oder ausgeführt. Das Ergebnis (Kommentar mit `pruefer-stand`-Marker, Labels `pruefer:offen`/`risk:high`) steht im Lern-App-PR.

Zwei Wege starten den Prüfer: `repository_dispatch` mit Typ `pruefer-anstoss` und `client_payload` `{repo, pr}` oder von Hand `workflow_dispatch` mit `repo` und `pr` (ohne `pruefen` ein Trockenlauf). Erlaubt sind nur der Leitstand und die Lern-App, nur offene Nicht-Draft-PRs auf `claude/`- oder `codex/`-Branches aus demselben Repo, und nur wenn `main` des Produkts geschützt ist.

## In der Lern-App (Sinan legt an, Workflow-Dateien dort schreibt der Worker des Leitstands nicht)

`.github/workflows/pruefer-anstoss.yml` (nur Anstoß, keine Logik; Secret `AGENT_WORKFLOW_TOKEN` mit Recht, `repository_dispatch` im Leitstand auszulösen):

```yaml
name: pruefer-anstoss
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions: {}
jobs:
  anstoss:
    if: startsWith(github.head_ref, 'claude/') || startsWith(github.head_ref, 'codex/')
    runs-on: ubuntu-latest
    steps:
      - run: gh api repos/siinanXD/Leitstand/dispatches -f event_type=pruefer-anstoss -f 'client_payload[repo]=${{ github.repository }}' -f 'client_payload[pr]=${{ github.event.pull_request.number }}'
        env:
          GH_TOKEN: ${{ secrets.AGENT_WORKFLOW_TOKEN }}
```

`pr-gate.yml` bekommt einen Schritt, der den Beleg verlangt (dieselbe Regel wie `automerge.yml`): Logik von Leitstand-`main`, kein PR-Code.

```js
// actions/github-script; GH_TOKEN mit Leserecht auf den Leitstand, LINEAR_API_KEY wie im Leitstand
const holen = async (pfad) => Buffer.from((await github.rest.repos.getContent({ owner: "siinanXD", repo: "Leitstand", path: pfad, ref: "main" })).data.content, "base64").toString();
// beleg-stand.mjs und beleg-gate.mjs in ein leeres Verzeichnis legen (Importpfade ../loop/ und ./), dann:
const { prueferBeleg } = await import(`${verzeichnis}/pruefer/beleg-gate.mjs`);
const { ladeAuftrag } = await import(`${verzeichnis}/loop/beleg-stand.mjs`);
const pr = (await github.rest.pulls.get({ ...context.repo, pull_number: nummer })).data;
const auftrag = await ladeAuftrag(pr.title, process.env.LINEAR_API_KEY);
const kommentare = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: nummer, per_page: 100 });
const beleg = prueferBeleg({ kommentare, headSha: pr.head.sha, hash: auftrag.hash, absender: [context.repo.owner, "github-actions[bot]"] });
if (!beleg.ok) core.setFailed(`Kein Merge: ${beleg.grund}`);
```

`review.yml` und `scripts/autonomy/review.mjs` der Lern-App entfallen danach (eigenes Lern-App-Issue).
