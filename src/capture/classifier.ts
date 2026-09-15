import { isBotUserAgent } from "../bots.js";
import type { AgentEvent, SessionSignals } from "../events.js";
import type {
  Classification,
  RequestRecord,
  Session,
  SessionLabel,
} from "../types.js";

const ASSETS_DIR = "/assets";
const NO_ASSETS_WEIGHT = 0.3;
const REGULAR_TIMING_WEIGHT = 0.35;
const AGENT_THRESHOLD = 0.5;
const DECLARED_AGENT_CONFIDENCE = 0.95;
const REGULARITY_CV_THRESHOLD = 0.1;

// ── shared low-level signal helpers (used by both classifiers) ──────
function mechanicalTiming(timestamps: number[]): boolean {
  if (timestamps.length < 3) return false;
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++)
    gaps.push(timestamps[i] - timestamps[i - 1]);
  const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  if (mean <= 0) return true;
  const variance =
    gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance) / mean < REGULARITY_CV_THRESHOLD;
}
function hasNoAssetsPaths(paths: string[]): boolean {
  return !paths.some((p) => p.includes(ASSETS_DIR));
}

function hasBotUserAgent(records: RequestRecord[]): boolean {
  return records.some((r) => isBotUserAgent(r.userAgent));
}
function hasNoAssets(records: RequestRecord[]): boolean {
  return hasNoAssetsPaths(records.map((r) => r.path));
}
function hasMechanicalTiming(records: RequestRecord[]): boolean {
  return mechanicalTiming(records.map((r) => r.timestampMs));
}

// ── v1 classifier: RequestRecord-only (Vercel-log grade). Unchanged. ──
export function classify(session: Session): Classification {
  const { records } = session;
  if (records.length === 0)
    return { label: "unknown", confidence: 0, signals: [] };

  const botUa = hasBotUserAgent(records);
  const noAssets = hasNoAssets(records);
  const regularTiming = hasMechanicalTiming(records);

  const signals: string[] = [];
  if (botUa) signals.push("bot-ua");
  if (noAssets) signals.push("no-assets");
  if (regularTiming) signals.push("regular-timing");

  if (botUa)
    return {
      label: "declared-agent",
      confidence: DECLARED_AGENT_CONFIDENCE,
      signals,
    };

  const agentScore =
    (noAssets ? NO_ASSETS_WEIGHT : 0) +
    (regularTiming ? REGULAR_TIMING_WEIGHT : 0);
  const label: SessionLabel =
    agentScore > AGENT_THRESHOLD ? "likely-agent" : "human";
  const confidence = label === "likely-agent" ? agentScore : 1 - agentScore;
  return { label, confidence, signals };
}

// ── v2 classifier: fuses the SDK's identity / header / client layers ──
// Evidence weights toward "agent". Positive = more agent-like; the human
// interaction signal is negative because a real, human-shaped event stream is
// the strongest evidence *against* an agent. Tuned so each family lands right:
// declared -> short-circuit; fetch/API -> header + no-JS; agentic browser ->
// JS-ran-but-no-interaction (the case v1 is structurally blind to).
const W = {
  noJsExecuted: 0.6, // beacon never fired on a document response
  webdriver: 0.7, // navigator.webdriver === true
  noInteraction: 0.55, // JS ran, but zero pointer/scroll/key over the session
  humanInteraction: -0.6, // a real interaction stream
  headless: 0.5,
  noSecFetch: 0.3, // client sent no Sec-Fetch-* (not a browser)
  nonHtmlAccept: 0.15,
  noCookie: 0.15,
  browserNav: -0.15, // navigated like a browser (only credited if it interacted)
  regularTiming: 0.3,
  noAssets: 0.2,
  noLanguages: 0.1,
} as const;

function looksLikeDocument(e: AgentEvent): boolean {
  if (e.method !== "GET" || e.status < 200 || e.status >= 400) return false;
  const path = e.path.split("?")[0];
  if (path.startsWith("/api") || path.includes(ASSETS_DIR)) return false;
  if (/\.\w{2,5}$/.test(path)) return false; // has a file extension => asset
  return true;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function classifySignals(s: SessionSignals): Classification {
  const { events, client } = s;
  if (events.length === 0)
    return { label: "unknown", confidence: 0, signals: [] };

  const signals = new Set<string>();

  // ── identity layer: cooperative self-identification is decisive ──
  const declaredUa = events.some((e) => e.declaredBot);
  const signed = events.some((e) => e.signed);
  const sigClaim = events.some((e) => e.signatureAgent !== null && !e.signed);
  if (declaredUa) signals.add("declared-bot-ua");
  if (signed) signals.add("web-bot-auth-signed");
  if (sigClaim) signals.add("signature-agent-claim");
  if (declaredUa || signed) {
    // NOTE: `signed` is presence of Signature headers, not a verified
    // signature — verifying against the key directory is a follow-on.
    const confidence = declaredUa && signed ? 0.98 : signed ? 0.9 : 0.95;
    return { label: "declared-agent", confidence, signals: [...signals] };
  }

  // ── behavioural + header layers for undeclared clients ──
  let score = 0;

  const servedDocument = events.some(looksLikeDocument);
  if (client === null && servedDocument) {
    score += W.noJsExecuted;
    signals.add("no-js-executed");
  }

  const interacted =
    client !== null &&
    (client.pointerMoves > 0 || client.scrolls > 0 || client.keyDowns > 0);
  if (client !== null) {
    if (client.webdriver) {
      score += W.webdriver;
      signals.add("webdriver");
    }
    if (interacted) {
      score += W.humanInteraction;
      signals.add("human-interaction");
    } else {
      score += W.noInteraction;
      signals.add("no-interaction-entropy");
    }
    if (client.languages === 0) {
      score += W.noLanguages;
      signals.add("no-languages");
    }
  }

  if (events.some((e) => e.headlessHint)) {
    score += W.headless;
    signals.add("headless-hint");
  }

  const n = events.length;
  const frac = (p: (e: AgentEvent) => boolean): number =>
    events.filter(p).length / n;
  if (frac((e) => e.secFetch === null) > 0.8) {
    score += W.noSecFetch;
    signals.add("no-sec-fetch");
  }
  if (frac((e) => e.method === "GET" && !e.acceptsHtml) > 0.8) {
    score += W.nonHtmlAccept;
    signals.add("non-html-accept");
  }
  if (!events.some((e) => e.hasCookie)) {
    score += W.noCookie;
    signals.add("no-cookie");
  }
  const browserNav = events.some((e) => e.secFetch?.mode === "navigate");
  if (browserNav && interacted) {
    score += W.browserNav;
    signals.add("browser-navigation");
  }
  if (mechanicalTiming(events.map((e) => e.timestampMs))) {
    score += W.regularTiming;
    signals.add("regular-timing");
  }
  if (hasNoAssetsPaths(events.map((e) => e.path))) {
    score += W.noAssets;
    signals.add("no-assets");
  }

  const clamped = Math.max(0, Math.min(1, score));
  const T = AGENT_THRESHOLD;
  let label: SessionLabel;
  let confidence: number;
  if (clamped > T) {
    label = "likely-agent";
    confidence = round2(Math.min(0.99, 0.5 + (0.49 * (clamped - T)) / (1 - T)));
  } else if (interacted || browserNav) {
    label = "human";
    confidence = round2(Math.min(0.99, 0.6 + (0.35 * (T - clamped)) / T));
  } else {
    label = "unknown";
    confidence = 0.3;
  }
  return { label, confidence, signals: [...signals] };
}
