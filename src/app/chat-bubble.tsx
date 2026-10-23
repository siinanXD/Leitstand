"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { aufruf } from "@/lib/aktionen-client";
import { browserClient } from "@/lib/browser-client";
import "./chat.css";

type Nachricht = { id: string; rolle: "sinan" | "leitstand"; text: string };

const FADEN_SCHLUESSEL = "leitstand-chat-faden";

function fadenId(): string {
  const alt = localStorage.getItem(FADEN_SCHLUESSEL);
  if (alt) return alt;
  const neu = crypto.randomUUID();
  localStorage.setItem(FADEN_SCHLUESSEL, neu);
  return neu;
}

/** Chatbubble auf jeder Seite (SIN-865): Faden aus `chat_nachrichten` mit Realtime, Senden über `/api/chat`. Statusfragen antwortet der Server sofort ohne Modell. */
export function ChatBubble() {
  const id = useId();
  const [offen, setOffen] = useState(false);
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([]);
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const ende = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const client = browserClient();
    if (!offen || !client) return;
    const faden = fadenId();
    const dazu = (n: Nachricht) => setNachrichten((alt) => (alt.some((x) => x.id === n.id) ? alt : [...alt, n]));
    void Promise.resolve(client.from("chat_nachrichten").select("id, rolle, text").eq("faden", faden).order("created_at", { ascending: true }).limit(200)).then((r) => {
      if (Array.isArray(r.data)) r.data.forEach((n) => dazu(n as Nachricht));
    });
    const kanal = client
      .channel(`chat_${faden}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_nachrichten", filter: `faden=eq.${faden}` }, (nutzlast) => dazu(nutzlast.new as Nachricht))
      .subscribe();
    return () => void client.removeChannel(kanal);
  }, [offen]);

  useEffect(() => ende.current?.scrollIntoView({ block: "end" }), [nachrichten]);

  async function senden(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await aufruf("/api/chat", "POST", { faden: fadenId(), text });
      if (res.ok) setText("");
      else setFehler("Nachricht konnte nicht gesendet werden.");
    } catch {
      setFehler("Keine Verbindung.");
    }
    setLaeuft(false);
  }

  return (
    <aside className="chat" aria-label="Chat">
      {offen && (
        <section id={`${id}-fenster`} className="chat-fenster" aria-label="Chat mit dem Leitstand">
          <ul className="chat-faden" aria-live="polite">
            {nachrichten.length === 0 && <li className="chat-leer">Frag nach dem Stand, zum Beispiel „Wie steht SIN-865?“.</li>}
            {nachrichten.map((n) => (
              <li key={n.id} className={`chat-nachricht ${n.rolle}`}>
                <span className="chat-wer">{n.rolle === "sinan" ? "Du" : "Leitstand"}</span> {n.text}
              </li>
            ))}
            <li ref={ende} aria-hidden="true" />
          </ul>
          <form className="chat-form" onSubmit={(ev) => void senden(ev)}>
            <label htmlFor={`${id}-text`}>Nachricht</label>
            <input id={`${id}-text`} type="text" required maxLength={2000} autoComplete="off" value={text} onChange={(ev) => setText(ev.target.value)} />
            <button type="submit" className="knopf aktiv" disabled={laeuft || text.trim() === ""}>
              Senden
            </button>
          </form>
          {fehler && (
            <p className="meldung" role="alert">
              {fehler}
            </p>
          )}
        </section>
      )}
      <button type="button" className="knopf aktiv chat-knopf" aria-expanded={offen} aria-controls={`${id}-fenster`} onClick={() => setOffen(!offen)}>
        {offen ? "Chat schließen" : "Chat"}
      </button>
    </aside>
  );
}
