// Native Quelle plus begrenzter Anstoß. Kein API-Reviewer und keine automatische Wiederholung.
import { codexAnforderungsText, leseCodexReview, planeCodexAnstoss, type Anforderung, type NativeReview, type Pruefstand } from "./codex";
import type { Ergebnis } from "./pruefer";

type Lage = { stand: Pruefstand; anforderungen: Anforderung[]; reviews: NativeReview[]; heute: number; deckel: number; jetzt: Date; trocken: boolean };
type Ausgang = { status: "fertig"; ergebnis: Ergebnis } | { status: "wartend" | "blockiert"; grund: string };

/** Zuerst vorhandenen gebundenen Review prüfen; auch nach Timeout niemals einen zweiten Anstoß für denselben Head erzeugen. */
export async function pruefeCodexAbo(lage: Lage, anfordern: (text: string) => Promise<void>): Promise<Ausgang> {
  const plan = planeCodexAnstoss(lage.stand, lage.anforderungen, lage.heute, lage.deckel, lage.jetzt);
  if (plan.erstellt) {
    const review = leseCodexReview(lage.reviews, lage.stand, plan.erstellt);
    if (review.status === "fertig") return { status: "fertig", ergebnis: review.ergebnis };
    if (plan.status === "wartend") return { status: "wartend", grund: review.grund };
  }
  if (plan.status !== "anfordern") return { status: plan.status, grund: plan.grund };
  if (lage.trocken) return { status: "wartend", grund: "Trockenlauf: nativer Review würde angefordert; keine unabhängige Prüfung" };
  await anfordern(codexAnforderungsText(lage.stand));
  return { status: "wartend", grund: "Nativer Review einmalig angefordert; unabhängiges Ergebnis ausstehend" };
}
