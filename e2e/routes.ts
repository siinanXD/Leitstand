// SIN-1031: jede Seite unter src/app mit der Adresse, die der Testnutzer-Lauf besucht.
// Der Abdeckungstest (src/lib/testnutzer/routen.test.ts) schlägt fehl, wenn eine page.tsx hier fehlt.
export type Route = {
  /** Datei relativ zu src/app, immer mit Schrägstrich. */
  datei: string;
  /** Adresse für den Besuch; dynamische Segmente mit Beispiel-Kennung. */
  pfad: string;
  /** Nur gesetzt, wenn die Seite nicht besucht wird: Begründung. */
  ausnahme?: string;
};

export const ROUTEN: readonly Route[] = [
  { datei: "page.tsx", pfad: "/" },
  { datei: "abhaengigkeiten/page.tsx", pfad: "/abhaengigkeiten" },
  { datei: "ablauf/page.tsx", pfad: "/ablauf" },
  { datei: "abnahme/page.tsx", pfad: "/abnahme" },
  { datei: "anmelden/page.tsx", pfad: "/anmelden", ausnahme: "Der eingeloggte Testnutzer wird von hier weggeleitet; die Seite prüft e2e/startseite.spec.ts." },
  // Beispiel-ID: ein echtes Linear-Issue dieses Projekts; die Seite lädt es aus loop_events.
  { datei: "aufgabe/[id]/page.tsx", pfad: "/aufgabe/SIN-1031" },
  { datei: "auswertung/page.tsx", pfad: "/auswertung" },
  { datei: "auth/callback/page.tsx", pfad: "/auth/callback", ausnahme: "Magic-Link-Rückkehr: ohne Code im Link gibt es nichts zu zeigen, und ein Besuch würde die Sitzung ändern." },
  { datei: "datenbank/page.tsx", pfad: "/datenbank" },
  { datei: "details/page.tsx", pfad: "/details" },
  { datei: "einstellungen/page.tsx", pfad: "/einstellungen" },
  { datei: "entscheidungen/page.tsx", pfad: "/entscheidungen" },
  { datei: "freigabe/page.tsx", pfad: "/freigabe" },
  { datei: "freigabe/werbemittel/page.tsx", pfad: "/freigabe/werbemittel" },
  { datei: "kosten/page.tsx", pfad: "/kosten" },
  // Beispiel-ID: Produkt-ID aus src/lib/projekte.ts.
  { datei: "projekt/[id]/page.tsx", pfad: "/projekt/leitstand" },
  { datei: "projekte/page.tsx", pfad: "/projekte" },
  { datei: "team/page.tsx", pfad: "/team" },
  { datei: "werkzeuge/page.tsx", pfad: "/werkzeuge" },
  { datei: "wochen-check/page.tsx", pfad: "/wochen-check" },
];
