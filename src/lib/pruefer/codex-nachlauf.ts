import { codexAntwortHash, istCodexBot, type Anforderung, type NativeReview } from "./codex";

/** Nur neue authentische Antwortversionen auf einen vorhandenen aktuellen Request erneut lesen; kein periodischer Neustart. */
export function brauchtCodexNachlauf(head: string, fragen: Anforderung[], gelesen: string, antworten: NativeReview[]): boolean {
  return fragen.some(f => f.head === head) && antworten.some(a => istCodexBot(a.user)) && codexAntwortHash(antworten) !== gelesen;
}
