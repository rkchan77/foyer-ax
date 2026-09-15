import { isBotUserAgent, vendorForUserAgent } from "../bots.js";
import type { AgentEvent, SecFetch } from "../events.js";

// Pure capture: no framework, no I/O. Adapters (Node, Next, edge) normalize
// their request into CapturedRequest and hand it here.

// Header map with lowercased keys and array values collapsed to a string.
export type Headers = Record<string, string>;

export interface CapturedRequest {
  method: string;
  path: string; // includes query string, leading slash
  headers: Headers;
  ip: string;
  timestampMs: number;
  status: number;
  bytes: number;
  sessionId: string;
  httpVersion?: string | null;
}

// Lowercase keys and collapse array-valued headers to a comma-joined string.
export function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): Headers {
  const out: Headers = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

function parseSecFetch(h: Headers): SecFetch | null {
  const site = h["sec-fetch-site"] ?? null;
  const mode = h["sec-fetch-mode"] ?? null;
  const dest = h["sec-fetch-dest"] ?? null;
  const user = h["sec-fetch-user"];
  // A real browser sends these on navigation. Absent entirely => a client that
  // isn't a browser (most SDK/tool HTTP clients and many fetch-based agents).
  if (site === null && mode === null && dest === null && user === undefined) {
    return null;
  }
  return { site, mode, dest, user: user === "?1" };
}

export function captureRequest(req: CapturedRequest): AgentEvent {
  const h = req.headers;
  const userAgent = h["user-agent"] ?? "";

  const declaredBot = isBotUserAgent(userAgent);
  const signatureAgent = h["signature-agent"] ?? null;
  const signed = "signature" in h && "signature-input" in h;

  const accept = h.accept ?? "";
  const acceptsHtml = accept.includes("text/html");
  const hasAcceptLanguage = "accept-language" in h;
  const hasCookie = "cookie" in h;
  const secFetch = parseSecFetch(h);
  const chUa = h["sec-ch-ua"] ?? "";
  const clientHints = "sec-ch-ua" in h || "sec-ch-ua-platform" in h;
  const headlessHint = /headless/i.test(userAgent) || /headless/i.test(chUa);

  // Reasons, in the same spirit as classifier signals. Cheap booleans here;
  // the classifier decides how to weigh them. Order: identity first.
  const signals: string[] = [];
  if (declaredBot) signals.push("declared-bot-ua");
  if (signatureAgent)
    signals.push(signed ? "web-bot-auth-signed" : "signature-agent-claim");
  if (secFetch === null) signals.push("no-sec-fetch");
  if (req.method === "GET" && !acceptsHtml) signals.push("non-html-accept");
  if (!hasAcceptLanguage) signals.push("no-accept-language");
  if (!hasCookie) signals.push("no-cookie");
  if (headlessHint) signals.push("headless-hint");

  return {
    ip: req.ip,
    timestampMs: req.timestampMs,
    method: req.method,
    path: req.path,
    status: req.status,
    bytes: req.bytes,
    referer: h.referer ?? null,
    userAgent,
    sessionId: req.sessionId,
    declaredBot,
    vendor: declaredBot ? vendorForUserAgent(userAgent) : null,
    signatureAgent,
    signed,
    httpVersion: req.httpVersion ?? null,
    hasCookie,
    acceptsHtml,
    hasAcceptLanguage,
    secFetch,
    clientHints,
    headlessHint,
    signals,
  };
}
