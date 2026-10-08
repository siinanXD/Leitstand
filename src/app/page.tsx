import { ladeQuelle } from "@/lib/supabase";
import { aktivitaet, brauchtDich, heuteSatz, inArbeit, kontingente, letzte24h, pipeline, type SnapshotRow } from "@/lib/uebersicht";

export const dynamic = "force-dynamic";

const KEINE_DATEN = <p className="leer">Keine Daten</p>;

const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

function Zeilen({ zeilen }: { zeilen: SnapshotRow[] }) {
  if (zeilen.length === 0) return KEINE_DATEN;
  return (
    <ul className="liste">
      {zeilen.map((z) => (
        <li key={`${z.project}-${z.title ?? z.stage ?? ""}`}>
          <span className="mono">{z.project}</span> {z.title ?? z.stage ?? ""}
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const jetzt = new Date();
  const geladen = await ladeQuelle();
  const quelle = geladen.zustand === "ok" ? geladen.quelle : { events: [], snapshot: [] };
  const hinweis =
    geladen.zustand === "nicht-konfiguriert"
      ? "Datenquelle nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)."
      : geladen.zustand === "fehler"
        ? "Datenquelle nicht erreichbar."
        : null;

  const satz = heuteSatz(quelle, jetzt);
  const stufen = pipeline(quelle.snapshot);
  const laeuft = inArbeit(quelle.snapshot);
  const wartet = brauchtDich(quelle.snapshot);
  const quoten = kontingente(quelle.snapshot);
  const events24 = letzte24h(quelle.events, jetzt);
  const balken = aktivitaet(quelle.events, jetzt);
  const spitze = Math.max(...balken, 1);
  const projekte = new Set(quelle.snapshot.map((s) => s.project)).size;

  return (
    <>
      <header className="kopf">
        <p className="mono-label">Leitstand</p>
        <p className="mono-label">Stand {uhrzeit(jetzt.toISOString())}</p>
      </header>
      {hinweis && (
        <p className="hinweis" role="status">
          {hinweis}
        </p>
      )}
      <main className="bento">
        <section className="tile breit" aria-labelledby="heute">
          <h1 id="heute" className="mono-label">
            Heute in einem Satz
          </h1>
          {satz ? (
            <>
              <p className="satz">{satz.satz}</p>
              <ul className="liste" aria-label="Belege">
                {satz.belege.map((b) => (
                  <li key={b.id}>
                    <span className="mono">{uhrzeit(b.created_at)}</span> {b.project ?? ""} {b.type ?? ""} {b.message ?? ""}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            KEINE_DATEN
          )}
        </section>

        <section className="tile breit" aria-labelledby="pipeline">
          <h2 id="pipeline" className="mono-label">
            Pipeline
          </h2>
          {stufen.length === 0 ? (
            KEINE_DATEN
          ) : (
            <ol className="schiene">
              {stufen.map((s) => (
                <li key={s.stage}>
                  <span className="mono-label">{s.stage}</span>
                  <span className="zahl mono">{s.anzahl}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="tile" aria-labelledby="arbeit">
          <h2 id="arbeit" className="mono-label">
            In Arbeit
          </h2>
          <Zeilen zeilen={laeuft} />
        </section>

        <section className="tile" aria-labelledby="zahlen">
          <h2 id="zahlen" className="mono-label">
            Zahlen
          </h2>
          {quelle.events.length === 0 && quelle.snapshot.length === 0 ? (
            KEINE_DATEN
          ) : (
            <dl className="zahlen">
              <div>
                <dt>Projekte</dt>
                <dd className="mono">{projekte}</dd>
              </div>
              <div>
                <dt>In Arbeit</dt>
                <dd className="mono">{laeuft.length}</dd>
              </div>
              <div>
                <dt>Ereignisse 24 h</dt>
                <dd className="mono">{events24.length}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="tile" aria-labelledby="braucht">
          <h2 id="braucht" className="mono-label">
            Braucht dich
          </h2>
          <Zeilen zeilen={wartet} />
        </section>

        <section className="tile" aria-labelledby="kontingente">
          <h2 id="kontingente" className="mono-label">
            Kontingente
          </h2>
          {quoten.length === 0 ? (
            KEINE_DATEN
          ) : (
            <ul className="liste">
              {quoten.map((q) => (
                <li key={q.name}>
                  <span>
                    {q.name}
                    {q.schaetzung && " (Schätzung)"}
                  </span>{" "}
                  <span className="mono">
                    {q.used} / {q.limit}
                  </span>
                  <div className="meter" aria-hidden="true">
                    <div style={{ width: `${Math.min(100, (q.used / q.limit) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tile breit" aria-labelledby="aktivitaet">
          <h2 id="aktivitaet" className="mono-label">
            Aktivität 24 h
          </h2>
          {events24.length === 0 ? (
            KEINE_DATEN
          ) : (
            <>
              <div className="balken" role="img" aria-label={`${events24.length} Ereignisse in 24 Stunden, stündlich: ${balken.join(", ")}`}>
                {balken.map((n, i) => (
                  <div key={i} style={{ height: `${(n / spitze) * 100}%` }} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
