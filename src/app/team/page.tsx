"use client";

import { agentKarte, bahnen, type AgentKarte } from "@/lib/agenten";
import { useRollen } from "@/lib/aktionen-client";
import { letzterLauf, ROLLEN, type Takt } from "@/lib/autonomy/rollen";
import { useSitzung } from "@/lib/sitzung";
import { ohneKennungen, zeitInWorten } from "@/lib/zeit";
import { MitMehr } from "../mit-mehr";
import { projekteIn, Rahmen } from "../rahmen";
import { ZustandSymbol, type ZustandArt } from "../zustand-symbol";
import "../bunt.css";

const ZUSTAND: Record<AgentKarte["signal"], ZustandArt> = { laeuft: "laeuft", warn: "wartet", error: "kaputt", ok: "fertig", leer: "fertig" };
const GRUPPEN: { art: ZustandArt; farbe: string; titel: (n: number) => string }[] = [
  { art: "kaputt", farbe: "pfirsich", titel: (n) => (n === 1 ? "Einer ist kaputt" : "Einige sind kaputt") },
  { art: "wartet", farbe: "sonne", titel: (n) => (n === 1 ? "Einer wartet auf dich" : `${n} warten auf dich`) },
  { art: "laeuft", farbe: "gruen", titel: (n) => (n === 1 ? "Einer arbeitet gerade" : `${n} arbeiten gerade`) },
];

const euro = (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

const TAKT: Record<Takt, string> = { "15min": "alle 15 Minuten", stuendlich: "stündlich", "2h": "alle 2 Stunden", taeglich: "täglich", woechentlich: "wöchentlich", monatlich: "monatlich", ereignis: "bei Ereignis", aus: "aus" };

/** Takt und letzter Lauf aller Rollen (SIN-829) aus docs/autonomy/rollen.json und loop_events; nie gesehen heißt „Noch kein Lauf“. */
function Takte({ events, jetzt }: { events: readonly { step: string | null; agent?: string | null; created_at: string }[]; jetzt: Date }) {
  return (
    <section aria-labelledby="team-takt">
      <h2 id="team-takt" className="karte-titel">
        Alle {ROLLEN.length} Rollen
      </h2>
      <ul className="noten">
        {ROLLEN.map((r) => {
          const zuletzt = letzterLauf(r, events);
          return (
            <li key={r.schritt}>
              <strong>{r.schritt}</strong>
              <span>Takt: {TAKT[r.takt]}</span>
              <span>{zuletzt === null ? "Noch kein Lauf" : `Letzter Lauf ${zeitInWorten(new Date(zuletzt).toISOString(), jetzt) ?? "früher"}`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Noten (SIN-637): je Rolle Note 1 bis 6 aus der gemeldeten Wirkung, Kosten der Woche, letzter Lauf. „ok“ allein gibt keine Note. */
function Noten({ jetzt }: { jetzt: Date }) {
  const sitzung = useSitzung();
  const { rollen, fehler, anschalten } = useRollen(sitzung.zustand === "ok" && sitzung.sitzung !== null);
  if (!rollen) return null;
  return (
    <section aria-labelledby="team-noten">
      <h2 id="team-noten" className="karte-titel">
        Noten
      </h2>
      <ul className="noten">
        {rollen.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong>
            <span className="note">{r.note === null ? "Keine Note" : `Note ${r.note}`}</span>
            <span title={`${r.kennzahl} (Ziel ${r.ziel})`}>{r.pausiert ? (r.grund ?? "Pausiert") : !r.laeuft ? "Läuft nicht" : `Ziel ${r.ziel}`}</span>
            <span>{r.kosten7d === null ? "Kosten unbekannt" : `${euro(r.kosten7d)} diese Woche`}</span>
            <span>{r.letzterLauf ? `Letzter Lauf ${zeitInWorten(r.letzterLauf, jetzt) ?? "früher"}` : "Noch kein Lauf"}</span>
            {r.pausiert && (
              <button type="button" onClick={() => void anschalten(r.id)}>
                Wieder anschalten
              </button>
            )}
          </li>
        ))}
      </ul>
      {fehler && <p role="status">{fehler}</p>}
    </section>
  );
}

/** Team nach Figma T2 v2 (SIN-578, 81:10): Figuren statt Tabelle, je Zustand eine Karte, höchstens drei Figuren, Rest hinter „mehr“. Wer ruht, steht in einer Zeile darunter. Zustand nur aus loop_events. */
export default function Team() {
  return (
    <Rahmen aktiv="team">
      {(quelle, jetzt) => {
        const karten = bahnen(quelle.events, quelle.snapshot, projekteIn(quelle).map((p) => p.id), jetzt.getTime()).map((b) => agentKarte(b, jetzt.getTime()));
        const figur = (k: AgentKarte) => (
          <li key={k.id} title={ohneKennungen(k.auftrag)}>
            <span className={`avatar ${k.signal}`} aria-hidden="true">
              {k.name.slice(0, 1)}
            </span>
            <span>{k.name}</span>
          </li>
        );
        const ruhen = karten.filter((k) => ZUSTAND[k.signal] === "fertig");
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <h1>Mein Team</h1>
            </div>
            <p>
              <a href="https://github.com/siinanXD/Leitstand/blob/main/docs/autonomy/ROLLEN-ABNAHME.md">Rollen und Werkzeuge: Prüfbericht und offene Punkte</a>
            </p>
            {GRUPPEN.map((g) => {
              const liste = karten.filter((k) => ZUSTAND[k.signal] === g.art);
              return liste.length === 0 ? null : (
                <section key={g.art} className={`tile einfach-block ${g.farbe}`} aria-labelledby={`team-${g.art}`}>
                  <h2 id={`team-${g.art}`} className="karte-titel">
                    {g.titel(liste.length)}
                  </h2>
                  <ZustandSymbol art={g.art} />
                  <MitMehr liste={liste} klasse="figuren" zeile={figur} />
                </section>
              );
            })}
            {ruhen.length > 0 && (
              <section aria-labelledby="team-fertig">
                <h2 id="team-fertig" className="karte-titel">
                  <ZustandSymbol art="fertig" /> Die anderen ruhen gerade
                </h2>
                <MitMehr liste={ruhen} klasse="figuren" zeile={figur} />
              </section>
            )}
            <Takte events={quelle.events} jetzt={jetzt} />
            <Noten jetzt={jetzt} />
          </main>
        );
      }}
    </Rahmen>
  );
}
