export const dynamic = "force-dynamic";

/** Lebenszeichen für die Abnahme-Probe (SIN-626): ohne Anmeldung, ohne Daten. */
export const GET = () => Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
