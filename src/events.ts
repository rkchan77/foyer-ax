import type { RequestRecord } from "./types.js";

// Which interaction layer a piece of evidence was observed at.
export type SignalLayer = "network" | "http" | "identity" | "client";

// The four Sec-Fetch-* metadata headers real browsers attach to requests.
export interface SecFetch {
  site: string | null; // same-origin | same-site | cross-site | none
  mode: string | null; // navigate | cors | no-cors | ...
  dest: string | null; // document | empty | image | ...
  user: boolean; // Sec-Fetch-User: ?1 — set only on user-activated navigation
}

// Superset of RequestRecord enriched beyond RequestRecord with the
// * header- and identity-layer evidence a log export throws away.
export interface AgentEvent extends RequestRecord {
  // RequestRecord-compatible core (populated for real, not "unknown")
  ip: string;
  timestampMs: number;
  method: string;
  path: string;
  status: number;
  bytes: number;
  referer: string | null;
  userAgent: string;

  // Correlation
  sessionId: string; // stable across a visit; ties server events to the beacon

  // Identity
  declaredBot: boolean; // UA matches a known crawler/agent token
  vendor: string | null; // e.g. "OpenAI", "Anthropic" — only when declaredBot
  signatureAgent: string | null; // Web Bot Auth: the Signature-Agent URL, if sent
  signed: boolean; // Signature + Signature-Input both present (a signing claim)

  // Http Layer
  httpVersion: string | null; // "1.1" | "2" | "3"
  hasCookie: boolean;
  acceptsHtml: boolean; // Accept lists text/html (browsers do; JSON tools don't)
  hasAcceptLanguage: boolean;
  secFetch: SecFetch | null; // null when the client omitted every Sec-Fetch-* header
  clientHints: boolean; // any sec-ch-ua* header present
  headlessHint: boolean; // UA / client hints reveal Headless or automation

  signals: string[]; // human-readable reasons that fired (cf. Classification.signals)
}

// Client-side evidence, reported by the beacon.
export interface ClientSignal {
  sessionId: string;
  ts: number; // epoch ms the beacon was sent
  webdriver: boolean; // navigator.webdriver
  pointerMoves: number; // distinct pointermove events
  scrolls: number;
  keyDowns: number;
  firstInteractionMs: number | null; // load -> first pointer/scroll/key, or null
  visibilityHidden: boolean; // page was backgrounded/never visible
  viewport: { w: number; h: number };
  dpr: number; // devicePixelRatio
  languages: number; // navigator.languages.length
  hardwareConcurrency: number;
}

// All evidence for one visit
export interface SessionSignals {
  sessionId: string;
  events: AgentEvent[];
  client: ClientSignal | null;
}

// Narrow an AgentEvent to the RequestRecord the offline pipeline expects.
export function toRequestRecord(e: AgentEvent): RequestRecord {
  return {
    ip: e.ip,
    timestampMs: e.timestampMs,
    method: e.method,
    path: e.path,
    status: e.status,
    bytes: e.bytes,
    referer: e.referer,
    userAgent: e.userAgent,
  };
}

// Group captured events by session and attach each session's client signal.
export function mergeSessionSignals(
  events: AgentEvent[],
  clients: ClientSignal[],
): SessionSignals[] {
  const clientBySession = new Map<string, ClientSignal>();
  for (const c of clients) clientBySession.set(c.sessionId, c);

  const eventsBySession = new Map<string, AgentEvent[]>();
  for (const e of events) {
    const list = eventsBySession.get(e.sessionId);
    if (list) list.push(e);
    else eventsBySession.set(e.sessionId, [e]);
  }

  const out: SessionSignals[] = [];
  for (const [sessionId, evs] of eventsBySession) {
    out.push({
      sessionId,
      events: evs,
      client: clientBySession.get(sessionId) ?? null,
    });
  }
  return out;
}
