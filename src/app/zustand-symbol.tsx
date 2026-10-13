// Die vier Zustände (SIN-578, Figma „Zustand“ 77:16): Farbe, Form und Wort gehören zusammen, nie nur Farbe.
export type ZustandArt = "laeuft" | "wartet" | "kaputt" | "fertig";

const NAME: Record<ZustandArt, string> = { laeuft: "läuft", wartet: "wartet auf dich", kaputt: "kaputt", fertig: "fertig" };

const FORM: Record<ZustandArt, React.ReactNode> = {
  laeuft: <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />,
  wartet: <path d="M9 12V6.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-4-2l-2-3a1.5 1.5 0 0 1 2.4-1.8L9 15" />,
  kaputt: <path d="M13 3 6 13h5l-1 8 7-10h-5l1-8Z" />,
  fertig: <path d="m6 12.5 4 4 8-9" />,
};

/** Symbol mit Wort daneben; `nurSymbol` lässt das Wort für Screenreader stehen, wenn der Satz daneben es schon sagt. */
export function ZustandSymbol({ art, nurSymbol = false }: { art: ZustandArt; nurSymbol?: boolean }) {
  return (
    <span className={`zustand-symbol ${art}`}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {art === "laeuft" && <circle className="puls" cx="12" cy="12" r="9" />}
        {FORM[art]}
      </svg>
      <span className={nurSymbol ? "sr-only" : undefined}>{NAME[art]}</span>
    </span>
  );
}
