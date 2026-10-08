export default function Home() {
  return (
    <main className="bento">
      <section className="tile" aria-labelledby="titel">
        <p className="mono-label">Leitstand · M0</p>
        <h1 id="titel">Noch keine Daten</h1>
        <p>
          Der Leitstand zeigt, sobald die Pipeline Ereignisse meldet, was läuft, was wartet und was es kostet.
          Die Datenquelle entsteht in SIN-303 (Lern-App, Tabellen <code>loop_events</code> und <code>loop_snapshot</code>).
        </p>
        <a className="action" href="https://linear.app/sinan-kahraman/issue/SIN-303">
          SIN-303 öffnen
        </a>
      </section>
      <aside className="tile" aria-labelledby="stand">
        <p className="mono-label">Stand</p>
        <h2 id="stand">Gerüst</h2>
        <p>Design-Tokens aus Figma, Übersicht folgt in SIN-304.</p>
      </aside>
    </main>
  );
}
