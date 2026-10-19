# SIN-848: automerge.yml importiert risiko.mjs über GITHUB_WORKSPACE

- Issue: https://linear.app/sinan-kahraman/issue/SIN-848
- Befund: Seit PR #253 (SIN-812, 19.10. 13:30) endet jeder `automerge`-Lauf mit `ERR_MODULE_NOT_FOUND` für `./scripts/loop/risiko.mjs` (z. B. Läufe 39254717862, 39250945960). `actions/github-script` löst relative Importe gegen sein eigenes Verzeichnis auf, nicht gegen den Checkout. Folge: keine Risiko-Labels, kein Auto-Merge, kein Leitstand-PR mergt.
- Entscheidung: `import(`${process.env.GITHUB_WORKSPACE}/scripts/loop/risiko.mjs`)`, wie die Lern-App in `pr-gate.yml`. Keine weitere Änderung am Gate.
- Freigabe: Gate selbst → risk:high. Das Gate kann diesen PR nicht selbst labeln oder mergen (es stürzt vorher ab); Sinan mergt nach grünem `build` von Hand.
