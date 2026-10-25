// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { type ProjektKnoten } from "../../src/lib/loop/projekt-issues";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { LEHREN_ORDNER, leseLehre, workerHinweise } from "../../src/lib/lernen/lernen";
import { aktivePause, pauseSatz } from "../../src/lib/kontingent/kontingent";
import { type PauseStand, PAUSE_SCHRITT, pauseStand } from "../../src/lib/pause";
import { ladeOffenePausen, ladeClaudeRest } from "../kontingent/pausen";
import { knappSatz } from "../../src/lib/kontingent/prioritaet";
import { SCHRITT as VERSION_SCHRITT, haelt, staende } from "../../src/lib/visionaer/visionaer";
import { fehlergrund } from "../../src/lib/loop/fehlergrund";
import { starteLaeufe } from "../../src/lib/loop/lauf";
import { type CommitStatus, aktiveSperren, ohneGesperrte } from "../../src/lib/loop/kontingente";
import { type LinearIssue, ausLinear, istWorkerBranch, gemergteFuerLaufende, type GithubIssue, type Belegung, teilGemergte, gemergteIds, gespiegelteIds, MAX_REPARATUR, freigegebene, PLATZ_MINUTEN, startbare, waehle, laufende, claimsMitPlatz, nachruecken, LABEL, grundNichtsStartbar, issueText, auftragsKommentar } from "../../src/lib/loop/auswahl";
import { wiederaufnahme } from "../../src/lib/loop/haken";
import { loopZiele, type LoopZiel } from "../../src/lib/projekte";
import { workerJeClaim, claimAbgelaufen, blockiert } from "../../src/lib/loop/reservierung";
import { konfliktSchritt } from "../../src/lib/loop/konflikt";
import { parallelRepo, maxParallel, ladePrSchutz, schuetztNoch, parallelAuswahl, konfliktGrund } from "../../src/lib/loop/parallel";
import { env, ereignis, linear, DRY, gh, laufUrl } from "./netz";
import { projektIssues, setzeStatus, kommentar, kriterienAnwenden, sinanIssue, labelSetzen, rueckeNach } from "./linear-netz";
import { reservierungen, laeufeOhnePr, laufAktiv, reserviereStart } from "./reservierung-netz";
import { codexLage, codexSpur } from "./codex";
import { gemergt } from "./abschluss";

/** Passende Lehren und Skills für das Issue (SIN-512). Fehlt der Ordner, gibt es keine Hinweise. */
function lehrenHinweise(i: LinearIssue): string {
  try {
    const lehren = readdirSync(LEHREN_ORDNER)
      .filter((d) => d.endsWith(".md") && d !== "INDEX.md")
      .map((d) => leseLehre(`${LEHREN_ORDNER}/${d}`, readFileSync(`${LEHREN_ORDNER}/${d}`, "utf8")));
    const skills = existsSync("docs/skills") ? readdirSync("docs/skills").filter((s) => existsSync(`docs/skills/${s}/SKILL.md`)) : [];
    return workerHinweise(lehren, skills.filter((s) => i.labels.some((l) => s.includes(l.toLowerCase()))), null, { labels: i.labels });
  } catch {
    return "";
  }
}

/** Pause aus dem Leitstand (SIN-530): jüngstes PAUSE-Ereignis in loop_events. Ohne Supabase-Secrets oder bei Lesefehler läuft der Loop weiter. */
async function pausiert(): Promise<PauseStand> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { pausiert: false };
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?select=step,status,grund,created_at&step=ilike.${PAUSE_SCHRITT}&order=created_at.desc&limit=20`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    return pauseStand((await res.json()) as Parameters<typeof pauseStand>[0]);
  } catch (e) {
    console.log(`::warning::Pausenstand nicht lesbar (${(e as Error).message}), Loop läuft weiter.`);
    return { pausiert: false };
  }
}

/** Version (SIN-573): Meldet der CEO `fertig`, steht der Dispatcher, bis Sinan eine Version freigibt. Wie bei der Pause: nicht lesbar = läuft weiter. */
async function versionHaelt(): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?select=project,step,status,grund,created_at&project=eq.leitstand&step=eq.${VERSION_SCHRITT}&order=created_at.desc&limit=20`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    return haelt(staende(await res.json())[0]);
  } catch (e) {
    console.log(`::warning::Versionsstand nicht lesbar (${(e as Error).message}), Loop läuft weiter.`);
    return false;
  }
}

export async function dispatch() {
  if (await versionHaelt()) {
    console.log("Leitstand wartet auf eine freigegebene Version (CEO: fertig). Nichts gestartet.");
    await ereignis("dispatch", "uebersprungen", { grund: "version_haelt: CEO meldet fertig, keine Version freigegeben" });
    return;
  }
  const pause = await pausiert();
  if (pause.pausiert) {
    console.log(`Loop pausiert seit ${pause.seit}. Nichts gestartet.`);
    await ereignis("dispatch", "uebersprungen", { grund: `pause: seit ${pause.seit}` });
    return;
  }
  // SIN-887: Läufe brauchen kein Claude und keinen Worker-Platz, darum vor der Kontingent-Prüfung.
  await laufSpur().catch((e: Error) => console.error(`::warning::Lauf-Spur: ${e.message}`));
  // Kontingent (SIN-581): Der Worker braucht Claude. Läuft eine Pause, startet nichts.
  const claudePause = aktivePause(await ladeOffenePausen(), "claude", new Date());
  if (claudePause) {
    console.log(`Nicht gestartet. ${pauseSatz(claudePause, new Date())}`);
    await ereignis("dispatch", "uebersprungen", { grund: `claude_pause: ${pauseSatz(claudePause, new Date())}` });
  }
  // SIN-633: Unter dem Puffer pausiert der Loop, bei knappem Rest laufen nur Stufe 1–2.
  const rest = await ladeClaudeRest();
  if (rest !== null && knappSatz(rest)) console.log(knappSatz(rest));
  // SIN-763: je Produkt mit Repo und Linear-Projekt; ein Fehler in einem Repo stoppt die anderen nicht. Platz (max) gilt je Repo.
  let fehler = false;
  try {
    codexLage.bestand = [];
    for (const ziel of loopZiele()) codexLage.bestand.push(...(await projektIssues(ziel.linearProjekt)).map(ausLinear));
  } catch (e) {
    codexLage.bestand = null;
    await ereignis("dispatch", "fehler", { grund: fehlergrund(`codex_bestand_unbekannt: ${(e as Error).message}`) });
  }
  for (const ziel of loopZiele()) {
    try {
      await dispatchZiel(ziel, rest, !!claudePause);
    } catch (e) {
      fehler = true;
      console.error(`::error::${ziel.id}: ${(e as Error).message}`);
      await ereignis("dispatch", "fehler", { projekt: ziel.id, grund: fehlergrund((e as Error).message) });
    }
  }
  if (fehler) process.exit(1);
}

/**
 * Lauf-Spur (SIN-887): Todo-Issues mit Label `lauf` aus allen Projekten startet der Dispatcher per `workflow_dispatch`
 * (nur Erlaubt-Liste, `src/lib/loop/lauf.ts`). Kein Worker, kein PR, kein Worker-Platz. Das Issue geht auf „In Progress“
 * und bekommt den Link zu den Läufen; die Belege hakt der Belege-Prüfer ab (SIN-846).
 */
async function laufSpur() {
  const d = await linear<{ issues: { nodes: (ProjektKnoten & { team: { id: string } })[] } }>(
    `query { issues(first: 25, filter: { labels: { name: { eqIgnoreCase: "lauf" } }, state: { type: { eq: "unstarted" } } }) {
      nodes { id identifier title description priority url createdAt startedAt team { id }
        labels { nodes { name } } state { type }
        inverseRelations { nodes { type issue { identifier state { type } } } } } } }`,
  );
  const team = new Map(d.issues.nodes.map((n) => [n.id, n.team.id]));
  await starteLaeufe(d.issues.nodes.map(ausLinear), {
    ueberspringe: async (i, grund) => {
      console.log(`Lauf ${i.identifier} nicht gestartet: ${grund}`);
      await ereignis("lauf", "uebersprungen", { issue: i.identifier, grund: `lauf_ungueltig: ${grund}` });
    },
    starte: async (i, { repo: r, workflow, inputs }) => {
      if (DRY) return console.log(`[trocken] würde Lauf starten: ${i.identifier} → ${r}/${workflow} ${JSON.stringify(inputs)}`);
      const standard = (await gh<{ default_branch: string }>(`/repos/${r}`)).default_branch;
      await gh(`/repos/${r}/actions/workflows/${workflow}/dispatches`, { method: "POST", body: { ref: standard, inputs } });
      await setzeStatus(i.id, team.get(i.id)!, "In Progress");
      await kommentar(i.id, `Lauf gestartet (SIN-887): ${workflow} mit ${JSON.stringify(inputs)} – https://github.com/${r}/actions/workflows/${workflow}`);
      await ereignis("lauf", "ok", { issue: i.identifier });
      console.log(`Lauf gestartet: ${i.identifier} → ${r}/${workflow}`);
    },
  });
}

/** Voraussetzung im Produkt-Repo (SIN-763): claude.yml vorhanden und Secret gesetzt. Gibt den Grund zurück, wenn etwas fehlt. */
async function fehlendeVoraussetzung(r: string): Promise<string | null> {
  const da = (pfad: string) => gh(pfad).then(() => true, () => false);
  if (!(await da(`/repos/${r}/contents/.github/workflows/claude.yml`))) return `${r} hat keine .github/workflows/claude.yml`;
  // 404 heißt: Secret fehlt oder AGENT_WORKFLOW_TOKEN darf Secrets nicht lesen; beides muss Sinan klären.
  if (!(await da(`/repos/${r}/actions/secrets/CLAUDE_CODE_OAUTH_TOKEN`))) return `${r}: Secret CLAUDE_CODE_OAUTH_TOKEN nicht gefunden (fehlt oder AGENT_WORKFLOW_TOKEN darf Secrets nicht lesen)`;
  return null;
}

/** SIN-1028: offene Worker-PRs mit Merge-Konflikt einmal je Head-Commit anstoßen, nach zwei Versuchen `needs-human`. */
async function konfliktAnstoss(repo: string, prs: { number: number; head: { ref: string }; labels: { name: string }[] }[]) {
  for (const k of prs.filter((p) => istWorkerBranch(p.head.ref))) {
    const p = await gh<{ mergeable_state?: string; head: { sha: string } }>(`/repos/${repo}/pulls/${k.number}`);
    if (p.mergeable_state !== "dirty") continue;
    const kommentare = (await gh<{ body: string }[]>(`/repos/${repo}/issues/${k.number}/comments?per_page=100`)).map((c) => c.body);
    const schritt = konfliktSchritt({ branch: k.head.ref, headSha: p.head.sha, mergeableState: p.mergeable_state, labels: k.labels.map((l) => l.name), kommentare });
    if ("keine" in schritt) continue;
    const was = "stopp" in schritt ? "needs-human" : `Versuch ${schritt.anstoss.versuch}`;
    if (DRY) { console.log(`[trocken] Konflikt #${k.number}: ${was}`); continue; }
    if ("stopp" in schritt) {
      await gh(`/repos/${repo}/issues/${k.number}/labels`, { method: "POST", body: { labels: ["needs-human"] } });
      await gh(`/repos/${repo}/issues/${k.number}/comments`, { method: "POST", body: { body: "Merge-Konflikt mit main auch nach 2 Versuchen offen. Stopp, Sinan entscheidet." } });
    } else {
      await gh(`/repos/${repo}/issues/${k.number}/comments`, { method: "POST", body: { body: schritt.anstoss.text } });
    }
    console.log(`PR #${k.number}: Konflikt, ${was}`);
  }
}

/** SIN-1046: Commit-Status von main und den jüngsten offenen PRs; Lesefehler zählen als „keine Sperre“, der Dispatcher läuft weiter. */
async function commitStatus(repo: string, shas: string[]): Promise<CommitStatus[]> {
  const refs = ["main", ...shas];
  const teile = await Promise.all(refs.map((ref) => gh<CommitStatus[]>(`/repos/${repo}/commits/${ref}/statuses?per_page=30`).catch((e: Error) => (console.log(`::warning::Commit-Status ${ref}: ${e.message}`), []))));
  return teile.flat();
}

async function ladeProdukt(ziel: LoopZiel) {
  const repo = ziel.repo;
  const projekt = ziel.id;
  await ereignis("dispatch", "start", { projekt });
  const nodes = await projektIssues(ziel.linearProjekt);
  let issues = nodes.map(ausLinear);
  issues = await kriterienAnwenden(issues, nodes, projekt);
  const eigenes = repo.toLowerCase() === (env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand").toLowerCase();
  if (!eigenes) {
    const fehlt = await fehlendeVoraussetzung(repo);
    if (fehlt) {
      const team = nodes[0]?.team.id;
      if (team) await sinanIssue(team, `Repo ${repo} braucht claude.yml und Secret`, `Der Loop kann in ${repo} nicht bauen: ${fehlt}.\n\nKlick-Anleitung:\n1. In ${repo} die Datei .github/workflows/claude.yml aus dem Leitstand-Repo übernehmen.\n2. ${repo} → Settings → Secrets and variables → Actions → Secret CLAUDE_CODE_OAUTH_TOKEN setzen.\n3. Der Token AGENT_WORKFLOW_TOKEN braucht auf ${repo} die Rechte Issues: Read and write, Pull requests: Read, Actions secrets: Read (Settings → Developer settings → Fine-grained token → Repository access).\n\nDanach startet der Dispatcher dort automatisch (SIN-763).`);
      await ereignis("dispatch", "uebersprungen", { projekt, grund: `voraussetzung: ${fehlt}` });
      return;
    }
    // Produkt-Repos haben kein loop-merge: gemergte PRs setzen das Linear-Issue hier auf Done.
    const geschlossene = await gh<{ number: number; title: string; merged_at: string | null }[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`);
    const fertig = gemergteFuerLaufende(issues, geschlossene.map((p) => ({ nummer: p.number, titel: p.title, gemergt: !!p.merged_at })));
    for (const f of fertig) await gemergt(repo, f.pr, projekt);
    issues = issues.filter((i) => !fertig.some((f) => f.identifier === i.identifier));
  }
  return { repo, projekt, nodes, issues, eigenes };
}

type Produkt = NonNullable<Awaited<ReturnType<typeof ladeProdukt>>>;
async function ladeGithubLage(repo: string, issues: LinearIssue[], claudeGesperrt: boolean) {
  const ghIssues = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=open&per_page=100`);
  let prs = await gh<{ number: number; title: string; head: { ref: string; sha: string }; labels: { name: string }[]; created_at: string }[]>(`/repos/${repo}/pulls?state=open&per_page=100`);
  if (parallelRepo(repo)) {
    for (let page = 2; prs.length === (page - 1) * 100; page++) {
      const weitere = await gh<typeof prs>(`/repos/${repo}/pulls?state=open&per_page=100&page=${page}`);
      prs = [...prs, ...weitere];
    }
  }
  if (!claudeGesperrt) await konfliktAnstoss(repo, prs).catch((e: Error) => console.error(`::warning::Konflikt-Anstoß: ${e.message}`));
  // Neueste zuerst: der jüngste gemergte PR eines Issues entscheidet, ob es nur auf Folge-Haken wartet (SIN-781).
  const zuletzt = await gh<{ title: string; body: string | null; merged_at: string | null }[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`);
  const belegung: Belegung = {
    jetzt: new Date(),
    offenePrs: prs.map((p) => ({ titel: p.title, branch: p.head.ref, labels: p.labels.map((l) => l.name) })),
    teilGemergt: teilGemergte(zuletzt.map((p) => ({ titel: p.title, body: p.body, gemergt: !!p.merged_at }))),
    // SIN-918: gemergte PRs (auch „Part of“); wartet das Issue nur noch auf den Live-Beleg, belegt es keinen Platz und startet nicht neu.
    gemergt: gemergteIds(zuletzt),
  };
  const max = maxParallel(repo, env.LOOP_MAX_PARALLEL, env.LEITSTAND_MAX_PARALLEL);
  const schutz = parallelRepo(repo)
    ? await ladePrSchutz(prs.filter(p => schuetztNoch({ labels: p.labels.map(l => l.name), createdAt: p.created_at }, new Date())), (pr, page) => gh(`/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`)) : [];
  const gespiegelt = gespiegelteIds(ghIssues);
  return { prs, zuletzt, belegung, max, schutz, gespiegelt };
}
type Lage = Produkt & Awaited<ReturnType<typeof ladeGithubLage>> & { claims: LinearIssue[] };
type ClaimLage = NonNullable<Awaited<ReturnType<typeof ladeReservierungen>>>;

async function ladeReservierungen(lage: Lage) {
  const { repo, projekt, issues } = lage;
  const speicher = reservierungen();
  const ids = issues.filter(i => parallelRepo(repo) || i.stateType === "unstarted").map(i => i.identifier);
  if (!speicher) {
    await ereignis("dispatch", "uebersprungen", { projekt, grund: "reservierung_fehlt: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt, kein Start ohne dauerhafte Sperre (SIN-832)" });
    return undefined;
  }
  let staende;
  try {
    staende = await speicher.staende(ids);
  } catch (e) {
    await ereignis("dispatch", "fehler", { projekt, grund: fehlergrund(`reservierung_unlesbar: ${(e as Error).message}`) });
    return undefined;
  }
  return { speicher, staende };
}

async function bereinigeOhnePr(lage: Lage, claimLage: ClaimLage) {
  const { repo, projekt, nodes, prs, zuletzt, gespiegelt } = lage;
  let { issues } = lage;
  const { speicher, staende } = claimLage;
  // SIN-937: Worker-Lauf beendet, kein PR → Claim sofort frei, Lauf zählen, nach zwei Läufen needs-human.
  for (const { id, stopp } of await laeufeOhnePr(repo, projekt, staende.filter(x => x.claim), issues, nodes, speicher, prs, zuletzt)) {
    gespiegelt.delete(id);
    const stand = staende.find(x => x.issue === id);
    if (stand) stand.claim = null;
    issues = issues.map(i => i.identifier === id ? { ...i, stateType: "unstarted", labels: stopp ? [...i.labels, "needs-human"] : i.labels } : i);
  }
  lage.issues = issues;
}

async function entferneVerwaisteClaims(lage: Lage, claimLage: ClaimLage) {
  const { repo, prs } = lage;
  const { speicher, staende } = claimLage;
  const beleg = laufUrl();
  const mitPr = new Set(prs.map(p => p.title.match(/SIN-\d+/)?.[0]).filter((x): x is string => !!x));
  const worker = await workerJeClaim(staende, id => laufAktiv(repo, id));
  for (const r of staende.filter(x => claimAbgelaufen(x, { offenerPr: mitPr.has(x.issue), workerLaeuft: worker.get(x.issue) ?? null, jetzt: new Date() }))) {
    console.log(`Claim von ${r.issue} abgelaufen (seit ${r.seit}, kein Worker, kein PR) → freigeben`);
    if (beleg && await speicher.freigeben(r, beleg).catch(() => false)) r.claim = null;
  }
}

async function markiereReparaturStopps(lage: Lage, claimLage: ClaimLage) {
  const { nodes } = lage;
  let { issues } = lage;
  const { staende } = claimLage;
  const beansprucht = new Set(staende.filter(r => r.claim).map(r => r.issue));
  lage.claims = issues.filter(i => beansprucht.has(i.identifier));
  const gesperrt = new Set(staende.filter((r) => blockiert(r, MAX_REPARATUR)).map((r) => r.issue));
  for (const r of staende.filter((x) => !x.claim && x.reparaturen >= MAX_REPARATUR)) {
    const i = issues.find((x) => x.identifier === r.issue);
    if (!i || i.labels.some((l) => l.toLowerCase() === "needs-human")) continue;
    const team = nodes.find((n) => n.id === i.id)!.team.id;
    // Nur mit gesetztem Label kommentieren, sonst kommt derselbe Kommentar bei jedem Dispatch.
    const gesetzt = await labelSetzen(i.id, team, "needs-human").then(() => true, (e: Error) => (console.log(`::warning::${r.issue}: needs-human nicht gesetzt: ${e.message}`), false));
    if (gesetzt) await kommentar(i.id, `Loop: ${r.reparaturen} erfolglose Reparaturrunden (issueweit, SIN-832). Kein weiterer Start, Sinan entscheidet. Danach \`reparaturen\` in \`leitstand_aufgaben\` zurücksetzen und \`needs-human\` entfernen.`);
  }
  if (gesperrt.size) console.log(`Ohne Startplatz (Claim oder Reparaturgrenze): ${[...gesperrt].join(", ")}`);
  issues = issues.filter((i) => i.stateType !== "unstarted" || !gesperrt.has(i.identifier));
  lage.issues = issues;
}

async function bereinigeClaims(lage: Lage): Promise<boolean> {
  if (DRY) return true;
  const claims = await ladeReservierungen(lage);
  if (!claims) return false;
  await bereinigeOhnePr(lage, claims);
  await entferneVerwaisteClaims(lage, claims);
  await markiereReparaturStopps(lage, claims);
  return true;
}

async function waehleStartbare(lage: Lage, rest: number | null) {
  const { repo, projekt, issues, nodes, belegung, max, schutz, gespiegelt, prs, claims } = lage;
  for (const h of freigegebene(issues, belegung).filter(i => !claims.some(c => c.identifier === i.identifier))) {
    console.log(`Platz von ${h.identifier} freigegeben: kein offener PR, seit ${h.startedAt ?? "?"} In Progress.`);
    await ereignis("platz", "ok", { projekt, issue: h.identifier, grund: `haenger: ohne PR länger als ${PLATZ_MINUTEN} Min` });
  }
  // SIN-1046: Ist ein Kontingent leer (Vercel-Tageslimit), starten nur Issues, die es nicht brauchen.
  const sperren = aktiveSperren(await commitStatus(repo, prs.slice(0, 5).map((p) => p.head.sha)), new Date());
  for (const s of sperren) console.log(`Kontingent ${s.id} gesperrt bis ${s.bis.toISOString()}`);
  const gesperrtGrund = new Map<string, string>();
  const kontingentFrei = (liste: LinearIssue[]) => {
    if (!sperren.length) return liste;
    const { uebersprungen } = ohneGesperrte(startbare(liste, gespiegelt), sperren);
    for (const u of uebersprungen) gesperrtGrund.set(u.issue.identifier, u.grund);
    return liste.filter((i) => !uebersprungen.some((u) => u.issue.identifier === i.identifier));
  };
  const auswahl = (alle: LinearIssue[]) => {
    const liste = kontingentFrei(alle);
    if (!parallelRepo(repo)) return waehle(liste, gespiegelt, max, belegung, rest);
    const kandidaten = waehle(liste, gespiegelt, liste.length, belegung, rest);
    const aktiv = [...new Map([...laufende(liste, belegung), ...claimsMitPlatz(claims, belegung)].map(i => [i.identifier, i])).values()];
    return parallelAuswahl(kandidaten, aktiv, max, schutz);
  };
  // SIN-923: konkreter Grund statt Pauschaltext (welches Issue, gegen wen, an welchem Pfad).
  const grundLeitstand = (liste: LinearIssue[]) => {
    const aktiv = [...new Map([...laufende(liste, belegung), ...claimsMitPlatz(claims, belegung)].map(i => [i.identifier, i])).values()];
    return konfliktGrund(waehle(liste, gespiegelt, liste.length, belegung, rest), aktiv, max, schutz);
  };
  let wahl = auswahl(issues);
  if (!wahl.length) {
    const naechstes = nachruecken(issues, gespiegelt, max, belegung);
    if (naechstes) {
      const node = nodes.find((n) => n.id === naechstes.id)!;
      await rueckeNach(naechstes, node.team.id);
      const befoerdert: LinearIssue = { ...naechstes, stateType: "unstarted", labels: [...naechstes.labels, LABEL] };
      wahl = auswahl([...issues.filter((i) => i.id !== naechstes.id), befoerdert]);
    }
  }
  for (const [issue, grund] of gesperrtGrund) await ereignis("dispatch", "uebersprungen", { projekt, issue, grund });
  if (!wahl.length) {
    const grund = parallelRepo(repo) && waehle(issues, gespiegelt, max, belegung, rest).length
      ? grundLeitstand(issues)
      : grundNichtsStartbar(issues, gespiegelt, max, belegung);
    console.log(`Nichts zu starten. ${grund}`);
    await ereignis("dispatch", "uebersprungen", { projekt, grund });
    return [];
  }
  return wahl;
}

async function starteIssues(lage: Lage, wahl: LinearIssue[]) {
  const { repo, projekt, nodes, eigenes } = lage;
  const speicher = DRY ? null : reservierungen(new Map(wahl.map((i) => [i.identifier, i.title])));
  for (const i of wahl) {
    const { title, body } = issueText(i, [eigenes ? lehrenHinweise(i) : "", wiederaufnahme(i.description)].filter(Boolean).join("\n\n"), eigenes);
    const team = nodes.find((n) => n.id === i.id)!.team.id;
    if (DRY) {
      console.log(`[trocken] würde starten: ${title}`);
      continue;
    }
    // SIN-832: erst die dauerhafte Reservierung, dann der Start. Scheitert der Start danach, bleibt der Claim (Ausgang unklar).
    if (!(await reserviereStart(speicher, i, projekt))) continue;
    const neu = await gh<{ number: number; html_url: string }>(`/repos/${repo}/issues`, { method: "POST", body: { title, body } });
    // Label getrennt setzen: das löst `issues: labeled` aus und startet claude.yml.
    // SIN-1005: Produkt-Repos können den Auftrag nicht per Skript lesen; der Kommentar kommt vor dem Label (Start).
    const auftrag = eigenes ? null : auftragsKommentar(i.description);
    if (auftrag) await gh(`/repos/${repo}/issues/${neu.number}/comments`, { method: "POST", body: { body: auftrag.text } });
    if (auftrag?.gesperrt.length) console.warn(`${i.identifier}: Auftrags-Kommentar gesperrt (${auftrag.gesperrt.join(", ")}), Haken genügen`);
    await gh(`/repos/${repo}/issues/${neu.number}/labels`, { method: "POST", body: { labels: auftrag?.gesperrt.length ? ["claude", "needs-human"] : ["claude"] } });
    await setzeStatus(i.id, team, "In Progress");
    await kommentar(i.id, `Loop gestartet: ${neu.html_url}`);
    await ereignis("dispatch", "ok", { projekt, issue: i.identifier });
    console.log(`Gestartet: ${i.identifier} → #${neu.number}`);
  }}

async function dispatchZiel(ziel: LoopZiel, rest: number | null, claudeGesperrt = false) {
  const produkt = await ladeProdukt(ziel);
  if (!produkt) return;
  const github = await ladeGithubLage(produkt.repo, produkt.issues, claudeGesperrt);
  const lage: Lage = { ...produkt, ...github, claims: [] };
  if (!(await bereinigeClaims(lage))) return;
  lage.issues = await codexSpur(lage.repo, lage.issues, lage.nodes, lage.prs, lage.projekt, lage.gespiegelt);
  if (claudeGesperrt) return;
  const wahl = await waehleStartbare(lage, rest);
  if (wahl.length) await starteIssues(lage, wahl);
}
