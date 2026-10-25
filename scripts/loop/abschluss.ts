// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { fehlergrund } from "../../src/lib/loop/fehlergrund";
import { prueferLaufziel } from "../../src/lib/loop/pruefer-lauf";
import { linearId, statusNachMerge, type GithubIssue, offeneSpiegel, istWorkerBranch, prueferReparatur, reparatur, MAX_REPARATUR } from "../../src/lib/loop/auswahl";
import { leseBelege, RUNDE_MARKER, entscheide, leseHaken, istTeil, setzeHaken, kommentarText } from "../../src/lib/loop/haken";
import { istEchteEntscheidung, leseBlock, baueBlock, LABEL_ENTSCHEIDUNG } from "../../src/lib/entscheidung/entscheidung";
import { GITHUB_URL, githubTreffer } from "../../src/lib/autonomy/research";
import { arg, env, DRY, linear, gh, ereignis, repo } from "./netz";
import { issueNachKennung, labelSetzen, kommentar, issueMitHaken, setzeStatus } from "./linear-netz";
import { gibFrei, reservierungen } from "./reservierung-netz";

/**
 * SIN-1014: Ein Worker fragt eine echte Entscheidung (neues Secret, Kosten, Design, Umfang …) über
 * `loop.ts frage <SIN-ID> --grund "…" [--empfehlung "…"]`: GitHub-Recherche, Block in der Beschreibung, Label `entscheidung`.
 * Routinefehler (Test rot, Reparaturrunden, Prüfer-Fund) bleiben `needs-human` und lösen diesen Befehl nicht aus.
 */
export async function frage() {
  const kennung = process.argv[3] ?? "";
  const grund = arg("grund") ?? "";
  const art = istEchteEntscheidung(grund);
  if (!/^SIN-\d+$/.test(kennung) || !art) throw new Error("frage: <SIN-ID> und --grund mit echter Entscheidung (Zugang, Kosten, Design, Infrastruktur, Umfang) nötig");
  const issue = await issueNachKennung(kennung);
  if (!issue) throw new Error(`frage: ${kennung} nicht gefunden`);
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  const antwort = await fetch(`${GITHUB_URL}${encodeURIComponent(grund.slice(0, 100))}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then((r) => (r.ok ? r.json() : null), () => null);
  const recherche = githubTreffer(antwort, new Date().toISOString());
  if (DRY) return console.log(`[trocken] ${kennung}: Block (${art}), ${recherche.length} Treffer`);
  const d = await linear<{ issue: { description: string | null } }>(`query($id: String!) { issue(id: $id) { description } }`, { id: issue.id });
  if (!leseBlock(d.issue.description)) {
    const block = baueBlock({ frage: grund, art, optionen: [{ titel: "Freigeben", folge: "Der Loop macht weiter." }, { titel: "Verwerfen", folge: "Das Issue wird nicht gebaut." }], empfehlung: arg("empfehlung") ?? "", recherche });
    await linear(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }`, { id: issue.id, d: `${d.issue.description ?? ""}\n\n${block}` });
  }
  await labelSetzen(issue.id, issue.team.id, LABEL_ENTSCHEIDUNG, true);
  await kommentar(issue.id, `Entscheidung nötig (${art}): Block in der Beschreibung, ${recherche.length} Recherche-Treffer.`);
}

export async function gemergt(repo: string, pr: number, projekt?: string) {
  const p = await gh<{ title: string; body: string | null; html_url: string; merged: boolean }>(`/repos/${repo}/pulls/${pr}`);
  if (!p.merged) return console.log(`PR #${pr} ist nicht gemergt.`);
  const id = linearId(p.title);
  if (!id) return console.log(`PR #${pr}: keine Linear-Kennung im Titel.`);
  const issue = await issueMitHaken(id);
  if (!issue) return console.log(`${id} nicht in Linear gefunden.`);
  // SIN-754: Done nur, wenn alle Fertig-Kriterien belegt sind und der PR kein „Part of“ ist.
  const belege = leseBelege((await gh<{ body: string }[]>(`/repos/${repo}/issues/${pr}/comments?per_page=100`)).map((c) => c.body));
  const runde = issue.comments.nodes.filter((c) => c.body.includes(RUNDE_MARKER)).length + 1;
  const e = entscheide({ haken: leseHaken(issue.description), belege, teil: istTeil(p.title, p.body), runde });
  if (e.belegt.length && issue.description && !DRY) await linear(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }`, { id: issue.id, d: setzeHaken(issue.description, e.belegt) });
  await kommentar(issue.id, kommentarText(e, belege ?? [], runde, p.html_url));
  // Offen: zurück auf Todo, der nächste Dispatch gibt dem Worker die offenen Haken mit.
  // SIN-918: Sind nur noch [nach Aktivierung]-Haken offen, „In Review“ statt Todo (sonst startet ein Worker, der nichts zu bauen hat).
  const naechster = statusNachMerge(e);
  if (naechster === "needs-human") await labelSetzen(issue.id, issue.team.id, "needs-human");
  else await setzeStatus(issue.id, issue.team.id, naechster);
  // SIN-760: Spiegel schließen (falls `Closes #N` es nicht schon tat), sonst startet das Issue nie wieder.
  const offene = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=open&per_page=100`);
  for (const n of offeneSpiegel(offene, id)) await gh(`/repos/${repo}/issues/${n}`, { method: "PATCH", body: { state: "closed" } });
  // SIN-832: Der Worker ist mit dem Merge belegt fertig; Claim und Reparaturzähler gehen (Runden davor waren nicht erfolglos).
  await gibFrei(id, p.html_url, projekt, true);
  if (e.status === "done") await ereignis("merge", "ok", { projekt, issue: id, pr });
  else await ereignis("merge", "uebersprungen", { projekt, issue: id, pr, grund: `haken_offen: ${e.grund}` });
}

async function ladeReparatur() {
  // SIN-1009: Prüfer-Läufe von Produkt-Repos nennen Repo und PR im Laufnamen (`--titel`); Rundenzählung, Labels und Kommentar laufen dort.
  const ziel = arg("titel") ? prueferLaufziel(arg("titel") as string) : { repo, pr: Number(arg("pr")) };
  if (!ziel) return console.log(`Laufname "${arg("titel")}" nennt kein freigegebenes Repo oder keinen PR.`);
  const { repo: zielRepo, pr } = ziel;
  const lauf = arg("lauf") ?? "";
  // SIN-925: `--quelle pruefer` = Prüfer-Fund statt rotem build; nur mit `pruefer:offen`, nie bei echtem Risiko.
  const pruefer = arg("quelle") === "pruefer";
  const p = await gh<{ title: string; head: { ref: string; sha?: string }; labels: { name: string }[]; state: string }>(`/repos/${zielRepo}/pulls/${pr}`);
  if (p.state !== "open" || !istWorkerBranch(p.head.ref)) return console.log(`PR #${pr}: nicht offen oder kein Worker-Branch.`);
  if (pruefer && arg("sha") && p.head.sha !== arg("sha")) return console.log(`PR #${pr}: Prüfer-Lauf gehört zu einem älteren Head.`);
  const was = pruefer ? "Der Prüfer hat offene Funde" : "Der Check build ist rot";
  const id = linearId(p.title);
  // SIN-832: issueweiter, dauerhafter Zähler; ohne lesbaren Stand keine weitere Runde (Stopp statt Raten).
  const speicher = id ? reservierungen() : null;
  if (!id || !speicher) throw new Error("Reparatur gestoppt: Linear-Kennung oder dauerhafter Speicher fehlt");
  let stand = null;
  try {
    stand = await speicher.laden(id);
  } catch (e) {
    await ereignis("repair", "fehler", { issue: id ?? undefined, pr, grund: fehlergrund(`reservierung_unlesbar: ${(e as Error).message}`) });
    return;
  }
  return { zielRepo, pr, lauf, pruefer, p, was, id, speicher, stand };
}

async function stoppeReparatur(lage: Exclude<Awaited<ReturnType<typeof ladeReparatur>>, void>) {
  const { zielRepo, pr, lauf, pruefer, p, was, id } = lage;
  if (p.labels.some((l) => l.name === "needs-human")) return console.log(`PR #${pr}: wartet schon auf Sinan.`);
  if (DRY) return console.log(`[trocken] Stopp für #${pr}`);
  await gh(`/repos/${zielRepo}/issues/${pr}/labels`, { method: "POST", body: { labels: ["needs-human"] } });
  await gh(`/repos/${zielRepo}/issues/${pr}/comments`, { method: "POST", body: { body: `${was} auch nach ${MAX_REPARATUR} Reparaturrunden (issueweit gezählt, ${lauf}). Stopp, Sinan entscheidet.` } });
  if (id) {
    const issue = await issueNachKennung(id);
    if (issue) {
      await labelSetzen(issue.id, issue.team.id, "needs-human");
      await kommentar(issue.id, `Blocker: PR #${pr} nach ${MAX_REPARATUR} Reparaturrunden (issueweit) ${pruefer ? "mit offenen Prüfer-Funden" : "rot"}. ${lauf}`);
    }
  }
  await ereignis("repair", "fehler", { issue: id ?? undefined, pr, grund: fehlergrund(`Test rot: ${pruefer ? "Prüfer-Funde" : "build"} nach ${MAX_REPARATUR} Reparaturrunden noch offen (${lauf})`) });
  // SIN-832: Stopp ist ein belegtes Ende des Workers; Claim lösen, Zähler bleibt, needs-human hält das Issue an.
  if (id) await gibFrei(id, `https://github.com/${zielRepo}/pull/${pr}`);
  return;
}

export async function reparaturLauf() {
  const lage = await ladeReparatur();
  if (!lage) return;
  const { zielRepo, pr, lauf, pruefer, p, was, id, speicher, stand } = lage;
  const labels = p.labels.map((l) => l.name);
  const schritt = pruefer ? prueferReparatur(labels, stand.reparaturen) : reparatur(labels, stand.reparaturen);
  if ("keine" in schritt) return console.log(`PR #${pr}: ${schritt.keine}.`);
  if ("stopp" in schritt) return stoppeReparatur(lage);
  if (DRY) return console.log(`[trocken] Runde ${schritt.runde} für #${pr}`);
  // Erst zählen, dann bitten: verliert der Zähler das Compare-and-swap, startet keine Runde (sonst unbegrenzt).
  if (!(await speicher.zaehleReparatur(stand, p.title))) {
    await ereignis("repair", "uebersprungen", { issue: id ?? undefined, pr, grund: "reservierung_verloren: Reparaturzähler hat sich parallel geändert, keine Runde" });
    return;
  }
  await gh(`/repos/${zielRepo}/issues/${pr}/labels`, { method: "POST", body: { labels: [`repair:${schritt.runde}`] } });
  await gh(`/repos/${zielRepo}/issues/${pr}/comments`, {
    method: "POST",
    body: {
      body: `@${p.head.ref.startsWith("codex/") ? "codex" : "claude"} ${was} (${lauf}). ${pruefer ? "Funde im Prüfer-Kommentar des PR lesen" : "Ursache im Log suchen"}, beheben, npm run typecheck, npm run lint und npm test lokal grün, dann auf diesen Branch pushen. Runde ${schritt.runde} von ${MAX_REPARATUR}.`,
    },
  });
  await ereignis("repair", "start", { issue: id ?? undefined, pr });
}
