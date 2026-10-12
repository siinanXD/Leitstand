"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";

type Zustand = "pruefe" | "nicht-unterstuetzt" | "nur-home-bildschirm" | "aus" | "an" | "verweigert";

const istIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const istHomeApp = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** VAPID-Schlüssel (URL-sicheres Base64) als Bytes für `pushManager.subscribe`. */
function schluessel(base64: string): Uint8Array<ArrayBuffer> {
  const roh = atob(base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
}

async function kopf(): Promise<Record<string, string>> {
  const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" };
}

async function aktuellesAbo(): Promise<PushSubscription | null> {
  const registrierung = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await registrierung?.pushManager.getSubscription()) ?? null;
}

/** Schalter „Mitteilungen“ (SIN-425): Erlaubnis nur nach Tippen (iOS verlangt eine Nutzer-Geste), Abo speichern, Testmitteilung. */
export function Mitteilungen() {
  const [zustand, setZustand] = useState<Zustand>("pruefe");
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const unterstuetzt = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let neu: Zustand;
      if (!unterstuetzt) neu = istIos() && !istHomeApp() ? "nur-home-bildschirm" : "nicht-unterstuetzt";
      else if (Notification.permission === "denied") neu = "verweigert";
      else neu = (await aktuellesAbo().catch(() => null)) && Notification.permission === "granted" ? "an" : "aus";
      if (aktiv) setZustand(neu);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  async function einschalten() {
    // Die Erlaubnis muss direkt im Tippen angefragt werden, vor jedem anderen await.
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== "granted") {
      setZustand(erlaubnis === "denied" ? "verweigert" : "aus");
      return;
    }
    const header = await kopf();
    const schluesselAntwort = await fetch("/api/push", { headers: header });
    if (!schluesselAntwort.ok) throw new Error("Push ist nicht eingerichtet.");
    const { publicKey } = (await schluesselAntwort.json()) as { publicKey: string };
    const registrierung = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const abo = (await registrierung.pushManager.getSubscription()) ?? (await registrierung.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluessel(publicKey) }));
    const res = await fetch("/api/push", { method: "POST", headers: header, body: JSON.stringify(abo.toJSON()) });
    if (!res.ok) throw new Error("Abo konnte nicht gespeichert werden.");
    setZustand("an");
    setMeldung({ text: "Mitteilungen sind an.", fehler: false });
  }

  async function ausschalten() {
    const abo = await aktuellesAbo();
    if (abo) {
      const res = await fetch("/api/push", { method: "DELETE", headers: await kopf(), body: JSON.stringify({ endpoint: abo.endpoint }) });
      if (!res.ok) throw new Error("Abo konnte nicht gelöscht werden.");
      await abo.unsubscribe();
    }
    setZustand("aus");
    setMeldung({ text: "Mitteilungen sind aus.", fehler: false });
  }

  async function umschalten() {
    setArbeitet(true);
    setMeldung(null);
    try {
      await (zustand === "an" ? ausschalten() : einschalten());
    } catch (fehler) {
      setMeldung({ text: fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.", fehler: true });
    } finally {
      setArbeitet(false);
    }
  }

  async function testen() {
    setArbeitet(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST", headers: await kopf() });
      setMeldung(res.ok ? { text: "Testmitteilung gesendet.", fehler: false } : { text: "Testmitteilung nicht zugestellt. Schalter aus und wieder an versuchen.", fehler: true });
    } catch {
      setMeldung({ text: "Testmitteilung fehlgeschlagen. Keine Verbindung.", fehler: true });
    } finally {
      setArbeitet(false);
    }
  }

  const hinweis: Partial<Record<Zustand, string>> = {
    "nur-home-bildschirm": "Mitteilungen gehen auf dem iPhone erst ab iOS 16.4 und nur, wenn der Leitstand vom Home-Bildschirm geöffnet ist. Im Safari-Menü „Zum Home-Bildschirm“ wählen und die App von dort öffnen.",
    "nicht-unterstuetzt": "Dieser Browser unterstützt keine Mitteilungen.",
    verweigert: "Mitteilungen sind in den Einstellungen des Geräts blockiert. Dort erlauben und die Seite neu laden.",
  };
  const bedienbar = zustand === "aus" || zustand === "an";

  return (
    <section className="tile kopplung" aria-labelledby="mitteilungen-titel">
      <h2 id="mitteilungen-titel" className="mono-label">
        Mitteilungen
      </h2>
      <p>Mitteilungen aufs Gerät, auch wenn der Leitstand zu ist. Tippen öffnet die passende Seite.</p>
      {hinweis[zustand] && <p className="meldung">{hinweis[zustand]}</p>}
      {bedienbar && (
        <>
          <button type="button" className={zustand === "an" ? "knopf" : "knopf aktiv"} aria-pressed={zustand === "an"} onClick={() => void umschalten()} disabled={arbeitet}>
            Mitteilungen
          </button>
          {zustand === "an" && (
            <button type="button" className="knopf" onClick={() => void testen()} disabled={arbeitet}>
              Testmitteilung
            </button>
          )}
        </>
      )}
      <div role="status">{meldung && <p className={meldung.fehler ? "meldung fehler" : "meldung"}>{meldung.text}</p>}</div>
    </section>
  );
}
