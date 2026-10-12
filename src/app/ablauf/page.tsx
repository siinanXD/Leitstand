"use client";

import "@xyflow/react/dist/style.css";
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";
import { bahnen, type Bahn } from "@/lib/agenten";
import { LAYOUT, graph, protokoll, unbekannte, zeitpunkte, type AblaufBahn, type AblaufKnoten } from "@/lib/ablauf";
import { DISPATCHER_REGEL, nurProjekt, projektInfo } from "@/lib/projekte";
import type { Quelle } from "@/lib/uebersicht";
import { ProjektFilter, Rahmen, projekteIn, uhrzeit } from "../rahmen";

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

const euro = (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/** Ablauf nach Agent (SIN-486): eine Bahn je Agent, Bahnen untereinander. */
function NachAgent({ quelle, sichtbar, events, bis }: { quelle: Quelle; sichtbar: string[]; events: Quelle["events"]; bis: number }) {
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const liste = useMemo(() => bahnen(events, quelle.snapshot, sichtbar, bis), [events, quelle.snapshot, sichtbar, bis]);
  const gewaehlt = liste.find((b) => b.agent.id === auswahl) ?? null;
  return (
    <div className="ablauf-flaeche">
      <ul className="bahnen" aria-label="Bahnen nach Agent">
        {liste.map((b) => (
          <li key={b.agent.id} className={`bahn ${b.zustand}`}>
            <button type="button" className="knopf" aria-pressed={auswahl === b.agent.id} onClick={() => setAuswahl(b.agent.id)}>
              {b.agent.name} ({ZUSTAND_TEXT[b.zustand]})
            </button>
            <ul className="bahn-knoten">
              {b.knoten.map((k) => (
                <li key={k.id} className={`bahn-knoten-eintrag ${k.zustand}`}>
                  {k.label} ({ZUSTAND_TEXT[k.zustand]})
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <aside className="panel" aria-label="Details">
        {gewaehlt ? <AgentDetails bahn={gewaehlt} /> : <p className="leer">Agent wählen für Auftrag, Läufe, Kosten und Warteschlange.</p>}
      </aside>
    </div>
  );
}

function AgentDetails({ bahn }: { bahn: Bahn }) {
  const { agent, laeufe, kosten7d, warteschlange } = bahn;
  return (
    <>
      <h2 className="mono-label">{agent.name}</h2>
      <p>{agent.auftrag}</p>
      <h3 className="mono-label">Letzte Läufe</h3>
      {laeufe.length === 0 ? (
        <p className="leer">Keine Daten</p>
      ) : (
        <ul className="liste">
          {laeufe.map((e) => (
            <li key={e.id}>
              <span className="mono">{uhrzeit(e.created_at)}</span> {[e.step, e.status, e.issue].filter(Boolean).join(" ")}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mono-label">Kosten 7 Tage</h3>
      <p className="mono">{kosten7d === null ? "Keine Daten" : `${euro(kosten7d)} von ${agent.budget7d === null ? "Keine Daten" : euro(agent.budget7d)}`}</p>
      <h3 className="mono-label">Warteschlange</h3>
      {warteschlange.length === 0 ? (
        <p className="leer">Keine Daten</p>
      ) : (
        <ul className="liste">
          {warteschlange.map((s) => (
            <li key={s.issue}>
              <span className="mono">{s.issue}</span> {s.title}
            </li>
          ))}
        </ul>
      )}
    </>
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
