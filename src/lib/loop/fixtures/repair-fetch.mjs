// Nur expliziter CLI-Test-Preload; unbekannte Endpunkte dürfen niemals das Netz erreichen.
import { readFileSync, writeFileSync } from "node:fs";
const file = process.env.REPAIR_FIXTURE;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input));
  const s = JSON.parse(readFileSync(file, "utf8"));
  const body = init.body ? JSON.parse(init.body) : null;
  s.calls.push({ url: u.href, method: init.method ?? "GET", body });
  let result;
  if (u.hostname === "api.github.com") {
    if (u.pathname.endsWith("/pulls/310")) result = { title: s.title, head: { ref: s.branch }, labels: s.labels.map(name => ({ name })), state: "open" };
    else if (u.pathname.endsWith("/labels")) { s.labels.push(...body.labels); result = []; }
    else if (u.pathname.endsWith("/comments")) { s.comments.push(body.body); result = {}; }
    else throw new Error(`Unbekannter GitHub-Endpunkt: ${u.pathname}`);
  } else if (u.hostname === "fixture.invalid") {
    if (u.pathname.endsWith("/leitstand_aufgaben")) {
      if (init.method === "PATCH") {
        if (u.searchParams.get("claim_revision") !== `eq.${s.row.claim_revision}`) result = [];
        else { Object.assign(s.row, body); result = [s.row]; }
      } else result = [s.row];
    } else if (u.pathname.endsWith("/loop_events")) { s.events.push(body); result = []; }
    else throw new Error(`Unbekannter Speicher-Endpunkt: ${u.pathname}`);
  } else if (u.hostname === "api.linear.app") {
    if (body.query.includes("labels(first")) result = { data: { team: { labels: { nodes: [{ id: "human-label", name: "needs-human" }] } } } };
    else if (body.query.includes("issueUpdate")) { s.linearLabels.push(...body.variables.l); result = { data: { issueUpdate: { success: true } } }; }
    else if (body.query.includes("commentCreate")) { s.linearComments.push(body.variables.b); result = { data: { commentCreate: { success: true } } }; }
    else if (body.query.includes("issue(id:")) result = { data: { issue: { id: "linear-id", team: { id: "team-id" } } } };
    else throw new Error(`Unbekannte Linear-Abfrage: ${body.query}`);
  } else throw new Error(`Netzzugriff im Fixture verboten: ${u.hostname}`);
  writeFileSync(file, JSON.stringify(s));
  return new Response(JSON.stringify(result), { status: 200 });
};
