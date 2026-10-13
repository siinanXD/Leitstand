import type { ReactNode } from "react";

/** Höchstens drei Dinge je Karte (SIN-578); der Rest steht hinter „mehr“. */
export function MitMehr<T>({ liste, klasse, zeile }: { liste: T[]; klasse: string; zeile: (t: T) => ReactNode }) {
  return (
    <>
      <ul className={klasse}>{liste.slice(0, 3).map(zeile)}</ul>
      {liste.length > 3 && (
        <details className="mehr">
          <summary>mehr</summary>
          <ul className={klasse}>{liste.slice(3).map(zeile)}</ul>
        </details>
      )}
    </>
  );
}
