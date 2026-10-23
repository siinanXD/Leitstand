// Register der Produkte und Kontingente je Produkt (SIN-1049). Rein; Netz und Datei in scripts/kontingent/sammler.ts.
import type { Quota } from "../uebersicht";

/** Ein erwartetes Secret: nur Name und Anleitung, nie ein Wert (SIN-1051). */
export type SecretSoll = { name: string; environment: string; zweck: string; wo_holen: string };

export type Produkt = {
  id: string;
  repo: string;
  infisicalOrdner: string;
  langfuse: { projekt: string | null; getrennt: boolean | null };
  sentry: { projekt: string | null };
  vercel: { projekt: string | null };
  supabase: { projekt: string | null };
  /** Soll-Liste der Secrets; die Werte stehen in Infisical im Ordner des Produkts. */
  secrets: SecretSoll[];
};

/** Ein gemessener Wert. `konto`: Das Limit gilt für das ganze Konto, nicht je Produkt (z. B. Vercel-Deployments pro Tag). */
export type Messwert = { produkt: string; name: string; used: number; limit: number; konto?: boolean };

export type Sammlung = { je_produkt: Record<string, Quota[]>; konto: Quota[] };

const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
/** Sieht ein Wert wie ein Schlüssel aus? Präfix sk-/pk- oder lange Zufallsfolge ohne Leerzeichen. */
export const siehtNachSchluesselAus = (s: string) => /^(sk|pk)-/i.test(s) || /^[A-Za-z0-9+/_=-]{32,}$/.test(s);

/** Fehler im Register, leer wenn in Ordnung: doppelte Kennungen, Secret-Namen in falscher Form, schlüsselähnliche Werte. */
export function pruefeRegister(produkte: Produkt[]): string[] {
  const fehler: string[] = [];
  const ids = new Set<string>();
  for (const p of produkte) {
    if (ids.has(p.id)) fehler.push(`${p.id}: doppelt`);
    ids.add(p.id);
    if (!p.infisicalOrdner.startsWith("/")) fehler.push(`${p.id}: infisicalOrdner muss mit / beginnen`);
    for (const s of p.secrets) if (!SECRET_NAME.test(s.name)) fehler.push(`${p.id}: Secret-Name „${s.name}“ ist kein Name`);
    for (const wert of [p.repo, p.infisicalOrdner, p.langfuse.projekt, p.sentry.projekt, p.vercel.projekt, p.supabase.projekt])
      if (wert && siehtNachSchluesselAus(wert)) fehler.push(`${p.id}: Wert sieht wie ein Schlüssel aus`);
  }
  return fehler;
}

/** Produkte, deren Langfuse-Projekt unbekannt ist oder mit einem anderen übereinstimmt: Anlass für die gebündelte `sinan`-Aufgabe. */
export function langfuseLuecken(produkte: Produkt[]): string[] {
  const proProjekt = new Map<string, string[]>();
  for (const p of produkte) if (p.langfuse.projekt) proProjekt.set(p.langfuse.projekt, [...(proProjekt.get(p.langfuse.projekt) ?? []), p.id]);
  return produkte.flatMap((p) => {
    if (!p.langfuse.projekt) return [`${p.id}: Langfuse-Projekt unbekannt`];
    const geteilt = proProjekt.get(p.langfuse.projekt) ?? [];
    return geteilt.length > 1 ? [`${p.id}: teilt Langfuse-Projekt mit ${geteilt.filter((x) => x !== p.id).join(", ")}`] : [];
  });
}

/** Messwerte → je Produkt eine Quota-Liste (jedes Register-Produkt hat einen Eintrag) und je konto-weitem Limit eine Summe über alle Produkte. */
export function sammle(produkte: Produkt[], messwerte: Messwert[]): Sammlung {
  const je_produkt: Record<string, Quota[]> = Object.fromEntries(produkte.map((p) => [p.id, []]));
  const summen = new Map<string, Quota>();
  for (const m of messwerte) {
    if (!(m.produkt in je_produkt) || !(m.limit > 0) || m.used < 0) continue;
    const schaetzung = /claude/i.test(m.name);
    je_produkt[m.produkt].push({ name: m.name, used: m.used, limit: m.limit, schaetzung });
    if (m.konto) summen.set(m.name, { name: m.name, used: (summen.get(m.name)?.used ?? 0) + m.used, limit: m.limit, schaetzung });
  }
  return { je_produkt, konto: [...summen.values()].map((q) => ({ ...q, name: `${q.name} (alle Produkte)` })) };
}

/** Neue Messwerte in vorhandene quotas einer Zeile mischen (gleicher Name wird ersetzt, Rest bleibt), damit andere Sammler (status.mjs) nichts verlieren. */
export function mischeQuotas(alt: unknown, neu: Quota[]): unknown[] {
  const vorher = Array.isArray(alt) ? alt : [];
  const namen = new Set(neu.map((q) => q.name));
  return [...vorher.filter((q) => !(q && typeof q === "object" && namen.has((q as { name?: unknown }).name as string))), ...neu];
}
