import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Sender, Speicher } from "./push";

/** Speicher auf `public.leitstand_push_abos`, nur mit dem Service-Role-Key. */
export function supabaseSpeicher(url: string, serviceKey: string): Speicher {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    async speichern(abo) {
      const { error } = await db.from("leitstand_push_abos").upsert({ endpoint: abo.endpoint, p256dh: abo.p256dh, auth: abo.auth }, { onConflict: "endpoint" });
      if (error) throw new Error("abo speichern fehlgeschlagen");
    },
    async loeschen(endpoint) {
      const { error } = await db.from("leitstand_push_abos").delete().eq("endpoint", endpoint);
      if (error) throw new Error("abo löschen fehlgeschlagen");
    },
    async alle() {
      const { data, error } = await db.from("leitstand_push_abos").select("endpoint, p256dh, auth");
      if (error) throw new Error("abos lesen fehlgeschlagen");
      return data ?? [];
    },
  };
}

/** Sender mit VAPID-Schlüsseln aus der Umgebung; null, wenn eine Angabe fehlt. */
export function vapidSender(): Sender | null {
  const oeffentlich = process.env.VAPID_PUBLIC_KEY;
  const privat = process.env.VAPID_PRIVATE_KEY;
  const betreff = process.env.VAPID_SUBJECT;
  if (!oeffentlich || !privat || !betreff) return null;
  const optionen = { vapidDetails: { subject: betreff, publicKey: oeffentlich, privateKey: privat }, TTL: 3600 };
  return async (abo, nachricht) => {
    try {
      const res = await webpush.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } }, JSON.stringify(nachricht), optionen);
      return res.statusCode;
    } catch (fehler) {
      const status = (fehler as { statusCode?: unknown }).statusCode;
      if (typeof status === "number") return status;
      throw fehler;
    }
  };
}
