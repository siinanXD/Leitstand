import type { Bereich } from "@/lib/bereiche";

// Icons nach Figma E2 (icon/bereich-*), 16 × 16, Linie 1,33 in Textfarbe. „Inhalte“ gibt es in Figma nicht und nutzt das Dokument-Icon.
const PFADE: Record<Bereich, React.ReactNode> = {
  Frontend: (
    <>
      <rect x="2" y="2.67" width="12" height="8" rx="1" />
      <path d="M5.33 13.33h5.34M8 10.67v2.66" />
    </>
  ),
  Backend: (
    <>
      <rect x="2" y="2.67" width="12" height="4.33" rx="1" />
      <rect x="2" y="9" width="12" height="4.33" rx="1" />
      <path d="M4.67 4.83h.01M4.67 11.17h.01" />
    </>
  ),
  Datenbank: (
    <>
      <ellipse cx="8" cy="4" rx="5.33" ry="2" />
      <path d="M2.67 4v8c0 1.1 2.39 2 5.33 2s5.33-.9 5.33-2V4M2.67 8c0 1.1 2.39 2 5.33 2s5.33-.9 5.33-2" />
    </>
  ),
  Infrastruktur: (
    <>
      <circle cx="4" cy="3.33" r="1.33" />
      <circle cx="4" cy="12.67" r="1.33" />
      <circle cx="12" cy="6" r="1.33" />
      <path d="M4 4.67v6.66M12 7.33c0 2-2.67 2.67-8 3.34" />
    </>
  ),
  Deployment: (
    <>
      <path d="M8 10V2.67M5.33 5.33 8 2.67l2.67 2.66M2.67 10v2.67h10.66V10" />
    </>
  ),
  "Doku und Tests": (
    <>
      <path d="M9.33 2H4.67A1.33 1.33 0 0 0 3.33 3.33v9.34A1.33 1.33 0 0 0 4.67 14h6.66a1.33 1.33 0 0 0 1.34-1.33V5.33L9.33 2Z" />
      <path d="M9.33 2v3.33h3.34" />
    </>
  ),
  Inhalte: (
    <>
      <path d="M9.33 2H4.67A1.33 1.33 0 0 0 3.33 3.33v9.34A1.33 1.33 0 0 0 4.67 14h6.66a1.33 1.33 0 0 0 1.34-1.33V5.33L9.33 2Z" />
      <path d="M9.33 2v3.33h3.34" />
    </>
  ),
};

export function BereichIcon({ bereich }: { bereich: Bereich }) {
  return (
    <svg className="bereich-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PFADE[bereich]}
    </svg>
  );
}
