import { createClient } from "@supabase/supabase-js";
import { istArt, type Speicher, type Werbemittel } from "./werbemittel";

const BUCKET = "werbemittel";
const URL_SEKUNDEN = 3600;

type Zeile = {
  id: string;
  produkt: string;
  art: string;
  text_inhalt: string | null;
  storage_pfad: string | null;
  dauer_sekunden: number | string | null;
  kosten_eur: number | string | null;
  modell: string | null;
  mit_ki: boolean | null;
  mit_ton: boolean | null;
  ki_kennzeichnung: string | null;
  quelle_url: string | null;
  run_url: string | null;
  created_at: string;
};

const zahl = (v: number | string | null): number | null => (v === null || Number.isNaN(Number(v)) ? null : Number(v));

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/** Speicher auf `public.werbemittel` mit dem Service-Role-Key. Null, wenn die Umgebung fehlt. */
export function werbemittelSpeicher(): Speicher | null {
  const db = client();
  if (!db) return null;
  return {
    async setze(id, von, aenderung) {
      const { data, error } = await db.from("werbemittel").update(aenderung).eq("id", id).eq("status", von).select("id");
      if (error) throw new Error("werbemittel setzen fehlgeschlagen");
      return (data?.length ?? 0) > 0;
    },
  };
}

/** Wartende Werbemittel, älteste zuerst; Videos mit signierter URL (privater Bucket). Null, wenn die Umgebung fehlt. */
export async function wartendeWerbemittel(): Promise<Werbemittel[] | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db
    .from("werbemittel")
    .select("id,produkt,art,text_inhalt,storage_pfad,dauer_sekunden,kosten_eur,modell,mit_ki,mit_ton,ki_kennzeichnung,quelle_url,run_url,created_at")
    .eq("status", "wartet_auf_freigabe")
    .order("created_at", { ascending: true });
  if (error) throw new Error("werbemittel lesen fehlgeschlagen");
  const zeilen = ((data ?? []) as Zeile[]).filter((z) => istArt(z.art));
  return Promise.all(
    zeilen.map(async (z): Promise<Werbemittel> => {
      const signiert = z.storage_pfad ? await db.storage.from(BUCKET).createSignedUrl(z.storage_pfad, URL_SEKUNDEN) : null;
      return {
        id: z.id,
        produkt: z.produkt,
        art: z.art as Werbemittel["art"],
        textInhalt: z.text_inhalt,
        videoUrl: signiert?.data?.signedUrl ?? null,
        dauerSekunden: zahl(z.dauer_sekunden),
        kostenEur: zahl(z.kosten_eur),
        modell: z.modell,
        mitKi: z.mit_ki === true,
        mitTon: z.mit_ton === true,
        kiKennzeichnung: z.ki_kennzeichnung,
        quelleUrl: z.quelle_url,
        runUrl: z.run_url,
        erstelltAm: z.created_at,
      };
    }),
  );
}
