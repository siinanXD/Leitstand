"use client";

import { useSyncExternalStore } from "react";

// „Für Technik“ (SIN-578): Schalter im Menü, Standard aus, pro Gerät im localStorage.
const SCHLUESSEL = "leitstand-technik";
const hoerer = new Set<() => void>();

const lesen = () => {
  try {
    return localStorage.getItem(SCHLUESSEL) === "an";
  } catch {
    return false;
  }
};

export function setzeTechnik(an: boolean) {
  try {
    localStorage.setItem(SCHLUESSEL, an ? "an" : "aus");
  } catch {
    // shortcut: ohne Speicher gilt der Schalter nur bis zum Neuladen, wann ausbauen: wenn Sinan das meldet
  }
  hoerer.forEach((h) => h());
}

export const useTechnik = () =>
  useSyncExternalStore(
    (f) => {
      hoerer.add(f);
      return () => hoerer.delete(f);
    },
    lesen,
    () => false,
  );
