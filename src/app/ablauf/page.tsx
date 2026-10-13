"use client";

import "@xyflow/react/dist/style.css";
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";
import { AGENT_LAYOUT, agentGraph, agentKarte, budgetAnteil, kostenText, type AgentKarte, type AgentLane, type Bahn } from "@/lib/agenten";
import { LAYOUT, graph, protokoll, signalAus, unbekannte, zeitpunkte, type AblaufBahn, type AblaufKnoten } from "@/lib/ablauf";
import { DISPATCHER_REGEL, nurProjekt, projektInfo } from "@/lib/projekte";
import { inArbeit, type Quelle } from "@/lib/uebersicht";
import { spurAnzeige } from "@/lib/vorarbeiter/vorarbeiter";
import { ProjektFilter, Rahmen, projekteIn, uhrzeit } from "../rahmen";
import "../ablauf.css";

const ZUSTAND_TEXT = { laeuft: "läuft", wartet: "wartet", fertig: "erledigt", leer: "leer" } as const;

const LEGENDE = [
  { text: "Läuft", klasse: "laeuft" },
  { text: "Erledigt", klasse: "ok" },
  { text: "Wartet", klasse: "warn" },
  { text: "Rot", klasse: "error" },
] as const;

const knotenName = (k: AblaufKnoten) => `${k.label}${k.anzahl > 0 ? ` · ${k.anzahl}` : ""}`;
const knotenLabel = (k: AblaufKnoten) => `${k.projekt ? `${projektInfo(k.projekt).name} ` : ""}${k.label}, ${ZUSTAND_TEXT[k.zustand]}${k.detail ? `, ${k.detail}` : ""}`;

/** Knoten nach Figma D2: Status-Quadrat + Titel, darunter Detailzeile aus echten Daten. */
function Karte({ k }: { k: AblaufKnoten }) {
  return (
    <>
      <span className="karte-kopf">
        <span className={`signal ${k.signal}`} aria-hidden="true" />
        {knotenName(k)}
      </span>
      <span className="karte-detail">{k.detail || "Keine Daten"}</span>
    </>
  );
}

function SchrittKnoten({ data }: NodeProps<Node<{ knoten: AblaufKnoten }>>) {
  return (
    <div className="karte-inhalt">
      <Handle type="target" position={Position.Left} className="griff" isConnectable={false} />
      <Karte k={data.knoten} />
      <Handle type="source" position={Position.Right} className="griff" isConnectable={false} />
    </div>
  );
}

function BahnFlaeche({ data }: NodeProps<Node<{ bahn: AblaufBahn }>>) {
  return (
    <div className="bahn-flaeche" style={data.bahn.farbe ? { borderLeftColor: data.bahn.farbe } : undefined}>
      <span className="bahn-name">{data.bahn.name}</span>
    </div>
  );
}

const NODE_TYPES = { schritt: SchrittKnoten, bahn: BahnFlaeche };

function Legende({ bahnen: liste }: { bahnen: AblaufBahn[] }) {
  return (
    <ul className="legende" aria-label="Legende">
      {liste.filter((b) => b.farbe).map((b) => (
        <li key={b.id}>
          <span className="signal" style={{ background: b.farbe ?? undefined }} aria-hidden="true" /> {b.name}
        </li>
      ))}
      {LEGENDE.map((l) => (
        <li key={l.klasse}>
          <span className={`signal ${l.klasse}`} aria-hidden="true" /> {l.text}
        </li>
      ))}
    </ul>
  );
}

/** Drei Spuren des Vorarbeiters (SIN-553): was läuft und was als Nächstes kommt. Ohne Plan in `loop_snapshot.plan` entfällt der Block. */
function Spuren({ snapshot }: { snapshot: Quelle["snapshot"] }) {
  const plan = snapshot.find((s) => s.plan)?.plan;
  if (!plan) return null;
  const laeuft = new Set(inArbeit(snapshot).flatMap((s) => (s.issue ? [s.issue] : [])));
  return (
    <section aria-labelledby="spuren-titel">
      <h2 id="spuren-titel" className="mono-label">
        Spuren des Vorarbeiters
      </h2>
      <ul className="bahn-liste" aria-label="Spuren">
        {spurAnzeige(plan, laeuft).map((s) => (
          <li key={s.id} className="bahn-eintrag">
            <h3 className="bahn-name">{s.name}</h3>
            <p className="leer">{s.laeuft ? `Läuft: ${s.laeuft.issue} ${s.laeuft.titel}` : "Nichts läuft"}</p>
            <ul className="liste" aria-label={`Als Nächstes in ${s.name}`}>
              {s.naechste.length === 0 ? (
                <li className="leer">Nichts geplant</li>
              ) : (
                s.naechste.map((e) => (
                  <li key={e.issue}>
                    <span className="mono">{e.issue}</span> {e.titel}
                  </li>
                ))
              )}
            </ul>
          </li>
        ))}
      </ul>
      {plan.wartet.length > 0 && <p className="leer">Wartet: {plan.wartet.map((w) => `${w.issue} (${w.grund})`).join("; ")}</p>}
    </section>
  );
}

function Ablauf({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<"projekt" | "agent">("projekt");
  const [position, setPosition] = useState<number | null>(null);

  const alle = projekteIn(quelle);
  const sichtbar = filter ? alle.filter((p) => p.id === filter) : alle;
  const events = useMemo(() => nurProjekt(quelle.events, filter), [quelle.events, filter]);
  const punkte = useMemo(() => zeitpunkte(quelle.events), [quelle.events]);
  const live = position === null || position >= punkte.length - 1;
  const bis = live ? jetzt.getTime() : punkte[position];

  const { knoten, kanten, plaetze, bahnen: flaechen } = useMemo(() => graph(quelle.events, quelle.snapshot, sichtbar, bis, live), [quelle.events, quelle.snapshot, sichtbar, bis, live]);
  const fremd = useMemo(() => unbekannte(quelle.events), [quelle.events]);
  const gewaehlt =knoten.find((k) => k.id === auswahl) ?? null;

  const breite = Math.max(...knoten.map((k) => k.x)) + LAYOUT.breite + LAYOUT.abstand;
  const hoehe = LAYOUT.bahn;
  const bahnKnoten: Node[] = flaechen.map((b) => ({
    id: `bahn-${b.id}`,
    type: "bahn",
    position: { x: 0, y: b.y },
    data: { bahn: b },
    style: { width: breite, height: hoehe },
    zIndex: -1,
    selectable: false,
    focusable: false,
    draggable: false,
    connectable: false,
  }));
  const nodes: Node[] = [
    ...bahnKnoten,
    ...knoten.map((k) => ({
      id: k.id,
      type: "schritt",
      position: { x: k.x, y: k.y },
      data: { knoten: k },
      className: `knoten ${k.zustand}`,
      style: { width: LAYOUT.breite, height: LAYOUT.hoehe },
      ariaLabel: knotenLabel(k),
      draggable: false,
      connectable: false,
    })),
  ];
  const edges: Edge[] = kanten.map((k) => ({ id: k.id, type: "step", source: k.von, target: k.nach, className: k.laeuft ? "kante laeuft" : "kante" }));

  return (
    <main className="seite">
      <section className="tile" aria-labelledby="ablauf-titel">
        <h1 id="ablauf-titel" className="mono-label">
          Ablauf
        </h1>
        <p className="leer">{DISPATCHER_REGEL}</p>
        <ProjektFilter projekte={alle} wert={filter} onChange={setFilter} />
        <Spuren snapshot={quelle.snapshot} />
        {fremd.projekte.length + fremd.schritte.length > 0 && (
          <p className="leer" role="status">
            unbekannt: {[...fremd.projekte.map((p) => `Projekt ${p}`), ...fremd.schritte.map((s) => `Schritt ${s}`)].join(", ")}
          </p>
        )}
        <div className="filter" role="group" aria-label="Ansicht">
          <button type="button" className="knopf" aria-pressed={ansicht === "projekt"} onClick={() => setAnsicht("projekt")}>
            Nach Projekt
          </button>
          <button type="button" className="knopf" aria-pressed={ansicht === "agent"} onClick={() => setAnsicht("agent")}>
            Nach Agent
          </button>
        </div>
        {ansicht === "agent" ? (
          <NachAgent quelle={quelle} sichtbar={sichtbar.map((p) => p.id)} events={events} bis={bis} />
        ) : knoten.every((k) => k.zustand === "leer") && sichtbar.length === 0 ? (
          <p className="leer">Keine Daten</p>
        ) : (
          <div className="ablauf-flaeche">
            <div className="graph-spalte">
              <div className="graph" role="group" aria-label="Pipeline als Graph">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  colorMode="dark"
                  fitView
                  nodesDraggable={false}
                  nodesConnectable={false}
                  proOptions={{ hideAttribution: true }}
                  onNodeClick={(_e, n) => n.type === "schritt" && setAuswahl(n.id)}
                />
              </div>
              <ul className="bahn-liste" aria-label="Pipeline nach Bahnen">
                {flaechen.map((b) => (
                  <li key={b.id} className="bahn-eintrag" style={b.farbe ? { borderLeftColor: b.farbe } : undefined}>
                    <h2 className="bahn-name">{b.name}</h2>
                    <ul className="bahn-karten">
                      {knoten
                        .filter((k) => (b.id === "gemeinsam" ? k.projekt === null : k.projekt === b.id))
                        .map((k) => (
                          <li key={k.id}>
                            <button type="button" className={`karte ${k.zustand}`} aria-pressed={auswahl === k.id} aria-label={knotenLabel(k)} onClick={() => setAuswahl(k.id)}>
                              <Karte k={k} />
                            </button>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <Legende bahnen={flaechen} />
              <p className="mono-label">Regel: Projektfarbe nur als Streifen/Marke, nie als Status. Status bleibt grün/gelb/rot/orange.</p>
            </div>
            <aside className="panel" aria-label="Details">
              {gewaehlt ? <Details knoten={gewaehlt} events={events} bis={bis} plaetze={plaetze} /> : <p className="leer">Knoten wählen für Protokoll und Links.</p>}
            </aside>
          </div>
        )}
        <div className="zeitleiste">
          <label htmlFor="zeit" className="mono-label">
            Zeitleiste {live ? "live" : `Stand ${uhrzeit(new Date(bis).toISOString())}`}
          </label>
          {punkte.length > 1 ? (
            <input id="zeit" type="range" min={0} max={punkte.length - 1} value={live ? punkte.length - 1 : position} onChange={(e) => setPosition(Number(e.target.value))} />
          ) : (
            <p className="leer">Zu wenige Ereignisse zum Zurückspulen.</p>
          )}
        </div>
      </section>
    </main>
  );
}

const AGENT_LEGENDE = [
  { text: "OK", klasse: "ok" },
  { text: "Wartet", klasse: "warn" },
  { text: "Fehler", klasse: "error" },
  { text: "Läuft", klasse: "laeuft" },
  { text: "Leer", klasse: "leer" },
] as const;

/** Agent-Karte nach Figma 46:78: Status-Quadrat, Name, Auftrag, Aktuell, Trenner, Fuß mit Budget-Balken. */
function AgentKarteInhalt({ k }: { k: AgentKarte }) {
  return (
    <>
      <span className="karte-kopf">
        <span className={`signal ${k.signal}`} aria-hidden="true" />
        {k.name}
      </span>
      <span className="agent-auftrag">{k.auftrag}</span>
      <span className="agent-aktuell">{k.aktuell}</span>
      <span className="agent-trenner" aria-hidden="true" />
      <span className="agent-fuss">{k.fuss}</span>
      {k.budgetAnteil !== null && (
        <span className="agent-budget" aria-hidden="true">
          <span className={`agent-verbraucht ${k.signal}`} style={{ width: `${Math.round(k.budgetAnteil * 100)}%` }} />
        </span>
      )}
    </>
  );
}

const karteLabel = (k: AgentKarte) => `${k.name}, ${k.auftrag}, ${k.aktuell}, ${k.fuss}`;

function AgentGraphKnoten({ data }: NodeProps<Node<{ karte: AgentKarte }>>) {
  return (
    <div className="karte-inhalt agent-karte">
      <Handle id="l" type="target" position={Position.Left} className="griff" isConnectable={false} />
      <Handle id="t" type="target" position={Position.Top} className="griff" isConnectable={false} />
      <AgentKarteInhalt k={data.karte} />
      <Handle id="r" type="source" position={Position.Right} className="griff" isConnectable={false} />
      <Handle id="b" type="source" position={Position.Bottom} className="griff" isConnectable={false} />
    </div>
  );
}

function AgentBahnFlaeche({ data }: NodeProps<Node<{ lane: AgentLane }>>) {
  const { lane } = data;
  return (
    <div className="bahn-flaeche" style={lane.projekt ? { borderLeftColor: projektInfo(lane.projekt).farbe } : undefined}>
      <span className="bahn-name">{lane.name}</span>
      {lane.hinweis && <p className="agent-hinweis">{lane.hinweis}</p>}
    </div>
  );
}

const AGENT_NODE_TYPES = { agent: AgentGraphKnoten, bahn: AgentBahnFlaeche };

/** Ablauf nach Agent (SIN-505, Figma D4/D5): Lieferkette, Produkt-Bahnen, Detailzeile. */
function NachAgent({ quelle, sichtbar, events, bis }: { quelle: Quelle; sichtbar: string[]; events: Quelle["events"]; bis: number }) {
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const g = useMemo(() => agentGraph(events, quelle.snapshot, sichtbar, bis), [events, quelle.snapshot, sichtbar, bis]);
  const gewaehlt = g.knoten.find((k) => k.karte.id === auswahl) ?? null;
  const lane = new Map(g.knoten.map((k) => [k.karte.id, k.lane]));

  const nodes: Node[] = [
    ...g.lanes.map((l) => ({
      id: `bahn-${l.id}`,
      type: "bahn",
      position: { x: 0, y: l.y },
      data: { lane: l },
      style: { width: g.breite, height: l.hoehe },
      zIndex: -1,
      selectable: false,
      focusable: false,
      draggable: false,
      connectable: false,
    })),
    ...g.knoten.map((k) => ({
      id: k.karte.id,
      type: "agent",
      position: { x: k.x, y: k.y },
      data: { karte: k.karte },
      className: `knoten ${k.karte.signal}`,
      style: { width: AGENT_LAYOUT.breite, height: AGENT_LAYOUT.hoehe },
      ariaLabel: karteLabel(k.karte),
      draggable: false,
      connectable: false,
    })),
  ];
  const edges: Edge[] = g.kanten.map((k) => {
    const quer = lane.get(k.von) !== lane.get(k.nach);
    return { id: k.id, type: "step", source: k.von, target: k.nach, sourceHandle: quer ? "b" : "r", targetHandle: quer ? "t" : "l", className: k.laeuft ? "kante laeuft" : "kante" };
  });

  return (
    <div className="agent-ansicht">
      <div className="agent-graph" style={{ height: g.hoehe + 24 }} role="group" aria-label="Lieferkette als Graph">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={AGENT_NODE_TYPES}
          colorMode="dark"
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_e, n) => n.type === "agent" && setAuswahl(n.id)}
        />
      </div>
      <ol className="agent-liste" aria-label="Lieferkette nach Agent">
        {g.lanes.map((l) => (
          <li key={l.id} className="agent-lane" style={l.projekt ? { borderLeftColor: projektInfo(l.projekt).farbe } : undefined}>
            <h2 className="bahn-name">{l.name}</h2>
            {l.hinweis && <p className="agent-hinweis">{l.hinweis}</p>}
            <ul className="agent-karten">
              {g.knoten
                .filter((k) => k.lane === l.id)
                .map((k) => (
                  <li key={k.karte.id}>
                    <button type="button" className={`karte agent-karte ${k.karte.signal}`} aria-pressed={auswahl === k.karte.id} aria-label={karteLabel(k.karte)} onClick={() => setAuswahl(k.karte.id)}>
                      <AgentKarteInhalt k={k.karte} />
                    </button>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
      <section className="agent-detail" aria-label="Details">
        {gewaehlt ? <AgentDetails bahn={gewaehlt.bahn} bis={bis} /> : <p className="leer">Karte wählen für Auftrag, letzte Läufe, Kosten 7 Tage und Warteschlange.</p>}
      </section>
      <ul className="legende" aria-label="Legende">
        {AGENT_LEGENDE.map((l) => (
          <li key={l.klasse}>
            <span className={`signal ${l.klasse}`} aria-hidden="true" /> {l.text}
          </li>
        ))}
        {sichtbar.map((p) => (
          <li key={p}>
            <span className="signal" style={{ background: projektInfo(p).farbe }} aria-hidden="true" /> {projektInfo(p).name}
          </li>
        ))}
      </ul>
      <p className="mono-label">Regel: Status nur als Quadrat (grün/gelb/rot/orange). Projektfarbe nur als Streifen. Kante orange = dort läuft gerade etwas.</p>
    </div>
  );
}

const WARTESCHLANGE_MAX = 4;

/** Detailzeile unter dem Graph (D4): Auftrag, letzte Läufe, Kosten 7 Tage, Warteschlange. Fehlende Werte entfallen. */
function AgentDetails({ bahn, bis }: { bahn: Bahn; bis: number }) {
  const { agent, laeufe, kosten7d, warteschlange } = bahn;
  const kosten = kostenText(kosten7d, agent.budget7d);
  const anteil = budgetAnteil(kosten7d, agent.budget7d);
  const k = agentKarte(bahn, bis);
  return (
    <div className="agent-felder">
      <div className={`agent-feld ${k.signal === "laeuft" ? "laeuft" : ""}`}>
        <h2 className="mono-label">
          <span className={`signal ${k.signal}`} aria-hidden="true" /> {agent.name}
        </h2>
        <p>Auftrag: {agent.auftrag}</p>
        {agent.modell && <p className="leer">Modell: {agent.modell}</p>}
        {agent.freigabe && <p className="leer">Freigabe: {agent.freigabe}</p>}
      </div>
      <div className="agent-feld">
        <h3 className="mono-label">Letzte Läufe</h3>
        {laeufe.length === 0 ? (
          <p className="leer">Keine Daten</p>
        ) : (
          <ul className="liste">
            {laeufe.slice(0, 4).map((e) => (
              <li key={e.id} className={signalAus(e.status) === "error" ? "fehler" : undefined}>
                <span className="mono">{uhrzeit(e.created_at)}</span> {[e.issue, e.pr !== null ? `#${e.pr}` : null, e.step, e.status].filter(Boolean).join(" ")}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="agent-feld">
        <h3 className="mono-label">Kosten 7 Tage</h3>
        <p className="mono">{kosten ?? "Keine Daten"}</p>
        {anteil !== null && (
          <span className="agent-budget" aria-hidden="true">
            <span className="agent-verbraucht" style={{ width: `${Math.round(anteil * 100)}%` }} />
          </span>
        )}
      </div>
      <div className="agent-feld">
        <h3 className="mono-label">Warteschlange · {warteschlange.length}</h3>
        {warteschlange.length === 0 ? (
          <p className="leer">Keine Daten</p>
        ) : (
          <ul className="liste">
            {warteschlange.slice(0, WARTESCHLANGE_MAX).map((s) => (
              <li key={s.issue}>
                <span className="mono">{s.issue}</span> {s.title}
              </li>
            ))}
            {warteschlange.length > WARTESCHLANGE_MAX && <li className="leer">+{warteschlange.length - WARTESCHLANGE_MAX} weitere</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function Details({ knoten, events, bis, plaetze }: { knoten: AblaufKnoten; events: Quelle["events"]; bis: number; plaetze: string[] }) {
  const zeilen = protokoll(events, knoten, bis).slice(0, 20);
  const projekt = knoten.projekt ? projektInfo(knoten.projekt) : null;
  const prs = [...new Set(zeilen.flatMap((e) => (e.pr !== null ? [e.pr] : [])))];
  return (
    <>
      <h2 className="mono-label">{knoten.label}</h2>
      <p>
        {projekt?.name ?? "gemeinsam"}, {ZUSTAND_TEXT[knoten.zustand]}
        {knoten.id.startsWith("platz-") && plaetze[Number(knoten.id.slice(6)) - 1] && <> · belegt von {projektInfo(plaetze[Number(knoten.id.slice(6)) - 1]).name}</>}
      </p>
      <h3 className="mono-label">Protokoll</h3>
      {zeilen.length === 0 ? (
        <p className="leer">Keine Daten</p>
      ) : (
        <ul className="liste">
          {zeilen.map((e) => (
            <li key={e.id}>
              <span className="mono">{uhrzeit(e.created_at)}</span> {[e.step, e.status, e.issue].filter(Boolean).join(" ")}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mono-label">Tokens</h3>
      <p className="leer">Keine Daten</p>
      {projekt?.repo && prs.length > 0 && (
        <>
          <h3 className="mono-label">Links</h3>
          <ul className="liste">
            {prs.map((n) => (
              <li key={n}>
                <a href={`https://github.com/${projekt.repo}/pull/${n}`}>PR #{n}</a>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="knopf" disabled title="Lauf abbrechen folgt (Aktionen laufen serverseitig mit eigenem Token)">
        Lauf abbrechen
      </button>
    </>
  );
}

export default function AblaufSeite() {
  return <Rahmen aktiv="ablauf">{(quelle, jetzt) => <Ablauf quelle={quelle} jetzt={jetzt} />}</Rahmen>;
}
