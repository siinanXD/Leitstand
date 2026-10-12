"use client";

import "@xyflow/react/dist/style.css";
import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMemo, useState } from "react";
import { bahnen, type Bahn } from "@/lib/agenten";
import { graph, protokoll, unbekannte, zeitpunkte, type AblaufKnoten } from "@/lib/ablauf";
import { DISPATCHER_REGEL, nurProjekt, projektInfo } from "@/lib/projekte";
import type { Quelle } from "@/lib/uebersicht";
import { ProjektFilter, Rahmen, projekteIn, uhrzeit } from "../rahmen";

const ZUSTAND_TEXT = { laeuft: "läuft", wartet: "wartet", fertig: "erledigt", leer: "leer" } as const;

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

  const { knoten, kanten, plaetze } = useMemo(() => graph(quelle.events, quelle.snapshot, sichtbar, bis, live), [quelle.events, quelle.snapshot, sichtbar, bis, live]);
  const fremd = useMemo(() => unbekannte(quelle.events), [quelle.events]);
  const gewaehlt =knoten.find((k) => k.id === auswahl) ?? null;

  const nodes: Node[] = knoten.map((k) => ({
    id: k.id,
    position: { x: k.x, y: k.y },
    data: { label: `${k.label}${k.anzahl > 0 ? ` · ${k.anzahl}` : ""} (${ZUSTAND_TEXT[k.zustand]})` },
    className: `knoten ${k.zustand}`,
    style: k.projekt ? { borderLeft: `4px solid ${projektInfo(k.projekt).farbe}` } : undefined,
    ariaLabel: `${k.projekt ? `${projektInfo(k.projekt).name} ` : ""}${k.label}, ${ZUSTAND_TEXT[k.zustand]}`,
    draggable: false,
    connectable: false,
  }));
  const edges: Edge[] = kanten.map((k) => ({ id: k.id, source: k.von, target: k.nach, animated: k.laeuft, className: k.laeuft ? "kante laeuft" : "kante" }));

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
            <div className="graph" role="group" aria-label="Pipeline als Graph">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                colorMode="dark"
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
                onNodeClick={(_e, n) => setAuswahl(n.id)}
              >
                <Background />
              </ReactFlow>
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
              <span className="mono">{uhrzeit(e.created_at)}</span> {[e.status, e.issue].filter(Boolean).join(" ")}
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
