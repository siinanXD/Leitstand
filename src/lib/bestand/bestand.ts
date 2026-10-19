// Bestandsabgleich (SIN-858): sammelt vor der Planung Evidenz zu einem Feature aus Gedächtnis, Code, Linear und PRs.
// Rein, kein Netz: `scripts/bestand/bestand.ts` übergibt die Lader. Entscheidet nicht über Fertigstellung, nennt nur Belege und Lücken.
import { mitGeheimnis } from "../gedaechtnis/gedaechtnis";

/** `begriffe` ersetzt die Wörter aus `feature`, wenn Dateien anders heißen als das Feature (z. B. "bestand" statt "Bestandsabgleich"). */
export type Anfrage = { produkt: string; bereich: string; feature: string; begriffe?: string[] };
export type QuellArt = "gedaechtnis" | "code" | "linear" | "prs";
export type Fund = { titel: string; url: string; /** Linear-Status-Typ bzw. PR-Zustand. */ zustand?: string; sha?: string; /** Nur im Speicher zum Suchen, nie im Bericht. */ inhalt?: string; inhalt_sha256?: string };
/** `ref` = Repo, Vault oder Linear-Projekt; `sha` = Commit-SHA bzw. Vault-SHA, `null` wenn die Quelle keine hat (Linear). PRs tragen den Head im Fund. */
export type Gelesen = { ref: string; sha: string | null; eintraege: Fund[] };
export type Lader = Record<QuellArt, () => Promise<Gelesen>>;
export type Quelle = { art: QuellArt; ref: string | null; sha: string | null; status: "ok" | "fehler"; anzahl: number };
export type Baustein = Fund & { quelle: QuellArt };
export type Bestand = {
  produkt: string;
  bereich: string;
  feature: string;
  quellen: Quelle[];
  vorhandene_bausteine: Baustein[];
  offene_arbeit: Baustein[];
  fehlende_nachweise: string[];
  quellfehler: string[];
};

const ARTEN: QuellArt[] = ["gedaechtnis", "code", "linear", "prs"];
const ERLEDIGT = new Set(["completed", "canceled", "closed", "merged"]);
const TEST = /\.test\.|(^|\/)tests?\//;
/** Wörter unter 4 Zeichen (SIN, feat, 1/3) treffen zu viel. */
export const stichwoerter = (feature: string) => feature.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 4);
export const passt = (f: Fund, wörter: string[]) => wörter.some((w) => `${f.titel} ${f.url} ${f.inhalt ?? ""}`.toLowerCase().includes(w));

/** Liest Seite für Seite, bis eine Seite kürzer als `proSeite` ist. Fehler oder Überlauf liefern nie eine Teilmenge. */
export async function holeSeiten<T>(seite: (nummer: number) => Promise<T[]>, proSeite: number, maxSeiten = 50): Promise<T[]> {
  const alle: T[] = [];
  for (let n = 1; n <= maxSeiten; n++) {
    const teil = await seite(n);
    alle.push(...teil);
    if (teil.length < proSeite) return alle;
  }
  throw new Error(`mehr als ${maxSeiten} Seiten, Abbruch`);
}

type Ergebnis = { art: QuellArt; g: Gelesen } | { art: QuellArt; fehler: string };

/** Eine Anfrage: jede Quelle einzeln, ein Fehler dort lässt die anderen stehen. */
export async function sammle(anfrage: Anfrage, lader: Lader): Promise<Bestand> {
  const wörter = (anfrage.begriffe ?? stichwoerter(anfrage.feature)).map((w) => w.toLowerCase());
  if (!wörter.length || wörter.some((w) => !/^[a-zäöüß0-9_-]{4,60}$/i.test(w))) throw new Error("Gezielte Suchbegriffe ab 4 Zeichen erforderlich");
  const b: Bestand = { produkt: anfrage.produkt, bereich: anfrage.bereich, feature: anfrage.feature, quellen: [], vorhandene_bausteine: [], offene_arbeit: [], fehlende_nachweise: [], quellfehler: [] };
  const ergebnisse: Ergebnis[] = await Promise.all(
    ARTEN.map((art) => lader[art]().then(
      (g): Ergebnis => (mitGeheimnis({ x: JSON.stringify({ ...g, eintraege: g.eintraege.map(({ inhalt: _inhalt, ...metadaten }) => { void _inhalt; return metadaten; }) }) }).length ? { art, fehler: "Geheimnis im Treffer, verworfen" } : { art, g }),
      (): Ergebnis => ({ art, fehler: "Quelle nicht lesbar" }),
    )),
  );
  for (const r of ergebnisse) {
    if ("fehler" in r) {
      b.quellen.push({ art: r.art, ref: null, sha: null, status: "fehler", anzahl: 0 });
      b.quellfehler.push(`${r.art}: ${r.fehler}`);
      b.fehlende_nachweise.push(`${r.art} nicht lesbar: keine Aussage über ${r.art} möglich`);
      continue;
    }
    const treffer = r.g.eintraege.filter((f) => passt(f, wörter));
    b.quellen.push({ art: r.art, ref: r.g.ref, sha: r.g.sha, status: "ok", anzahl: treffer.length });
    for (const f of treffer) {
      const { inhalt: _inhalt, ...metadaten } = f;
      void _inhalt;
      const x = { quelle: r.art, ...metadaten };
      if ((r.art === "linear" || r.art === "prs") && !ERLEDIGT.has(f.zustand ?? "")) b.offene_arbeit.push(x);
      else b.vorhandene_bausteine.push(x);
    }
  }
  const lesbar = (art: QuellArt) => b.quellen.find((q) => q.art === art)?.status === "ok";
  const code = b.vorhandene_bausteine.filter((x) => x.quelle === "code");
  if (lesbar("code") && !code.length) b.fehlende_nachweise.push("Kein Code gefunden");
  if (code.length && !code.some((x) => TEST.test(x.titel))) b.fehlende_nachweise.push("Code ohne Test gefunden");
  if (lesbar("gedaechtnis") && !b.vorhandene_bausteine.some((x) => x.quelle === "gedaechtnis")) b.fehlende_nachweise.push("Keine Gedächtnis-Notiz gefunden");
  return b;
}

/** Mehrere Bereiche: jeder für sich, ein Ausfall betrifft nur seinen Bericht. */
export const sammleAlle = (anfragen: Anfrage[], lader: (a: Anfrage) => Lader): Promise<Bestand[]> => Promise.all(anfragen.map((a) => sammle(a, lader(a))));
