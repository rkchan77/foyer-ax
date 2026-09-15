import { describe, expect, it } from "vitest";
import { parseBeacon } from "../src/capture/beacon.js";
import { captureRequest, normalizeHeaders } from "../src/capture/capture.js";
import type { AgentEvent, ClientSignal } from "../src/events.js";
import { mergeSessionSignals, toRequestRecord } from "../src/events.js";

const base = {
  method: "GET",
  path: "/product/42",
  ip: "203.0.113.5",
  timestampMs: 1_700_000_000_000,
  status: 200,
  bytes: 1234,
  sessionId: "s1",
};

// A real Chrome-based browser (this is what an agentic browser like Comet or
// Claude-in-Chrome looks like at the header layer — it does not declare itself).
const humanHeaders = normalizeHeaders({
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,image/avif,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  cookie: "foyer_sid=s1",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
  "sec-fetch-user": "?1",
  "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24"',
  referer: "https://shop.example/",
});

describe("captureRequest", () => {
  it("flags a declared crawler by user-agent and names the vendor", () => {
    const ev = captureRequest({
      ...base,
      headers: normalizeHeaders({
        "user-agent":
          "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
        accept: "*/*",
      }),
    });
    expect(ev.declaredBot).toBe(true);
    expect(ev.vendor).toBeTruthy();
    expect(ev.signals).toContain("declared-bot-ua");
  });

  it("recognizes a Web Bot Auth signed request", () => {
    const ev = captureRequest({
      ...base,
      headers: normalizeHeaders({
        "user-agent": "Mozilla/5.0 SomeAgent",
        "signature-agent":
          "https://api.example/.well-known/http-message-signatures-directory",
        signature: "sig1=:abc:",
        "signature-input":
          'sig1=("@authority" "signature-agent");alg="ed25519"',
      }),
    });
    expect(ev.signed).toBe(true);
    expect(ev.signatureAgent).toContain(".well-known");
    expect(ev.signals).toContain("web-bot-auth-signed");
  });

  it("treats an unresolved Signature-Agent as a claim, not a signature", () => {
    const ev = captureRequest({
      ...base,
      headers: normalizeHeaders({ "signature-agent": "https://x.example/dir" }),
    });
    expect(ev.signed).toBe(false);
    expect(ev.signals).toContain("signature-agent-claim");
  });

  it("marks an SDK/tool client: no Sec-Fetch, JSON-only Accept, no cookie", () => {
    const ev = captureRequest({
      ...base,
      headers: normalizeHeaders({
        "user-agent": "node-fetch/3.0",
        accept: "application/json",
      }),
    });
    expect(ev.secFetch).toBeNull();
    expect(ev.acceptsHtml).toBe(false);
    expect(ev.signals).toEqual(
      expect.arrayContaining([
        "no-sec-fetch",
        "non-html-accept",
        "no-accept-language",
        "no-cookie",
      ]),
    );
  });

  it("leaves a real browser request clean of agent signals", () => {
    const ev = captureRequest({ ...base, headers: humanHeaders });
    expect(ev.declaredBot).toBe(false);
    expect(ev.secFetch).not.toBeNull();
    expect(ev.secFetch?.user).toBe(true);
    expect(ev.acceptsHtml).toBe(true);
    expect(ev.signals).not.toContain("no-sec-fetch");
    expect(ev.signals).not.toContain("no-cookie");
  });

  it("detects a headless automation hint in the UA", () => {
    const ev = captureRequest({
      ...base,
      headers: normalizeHeaders({
        "user-agent": "Mozilla/5.0 HeadlessChrome/140.0",
      }),
    });
    expect(ev.headlessHint).toBe(true);
    expect(ev.signals).toContain("headless-hint");
  });
});

describe("toRequestRecord", () => {
  it("narrows an AgentEvent to the pipeline's RequestRecord shape", () => {
    const ev = captureRequest({ ...base, headers: humanHeaders });
    const rec = toRequestRecord(ev);
    expect(rec).toEqual({
      ip: base.ip,
      timestampMs: base.timestampMs,
      method: base.method,
      path: base.path,
      status: base.status,
      bytes: base.bytes,
      referer: "https://shop.example/",
      userAgent: humanHeaders["user-agent"],
    });
    expect(Object.keys(rec)).not.toContain("signals");
  });
});

describe("beacon + session merge", () => {
  it("parses a valid beacon body and rejects garbage", () => {
    const good = parseBeacon(
      JSON.stringify({
        sessionId: "s1",
        pointerMoves: 12,
        viewport: { w: 1440, h: 900 },
      }),
    );
    expect(good?.sessionId).toBe("s1");
    expect(good?.pointerMoves).toBe(12);
    expect(parseBeacon("not json")).toBeNull();
    expect(parseBeacon(JSON.stringify({ nope: 1 }))).toBeNull();
  });

  it("marks a session whose beacon never fired as client:null", () => {
    const events: AgentEvent[] = [
      captureRequest({ ...base, sessionId: "human", headers: humanHeaders }),
      captureRequest({
        ...base,
        sessionId: "reader",
        headers: normalizeHeaders({
          "user-agent": "node-fetch/3.0",
          accept: "*/*",
        }),
      }),
    ];
    const clients: ClientSignal[] = [
      {
        sessionId: "human",
        ts: Date.now(),
        webdriver: false,
        pointerMoves: 30,
        scrolls: 5,
        keyDowns: 8,
        firstInteractionMs: 800,
        visibilityHidden: false,
        viewport: { w: 1440, h: 900 },
        dpr: 2,
        languages: 2,
        hardwareConcurrency: 8,
      },
    ];
    const merged = mergeSessionSignals(events, clients);
    const human = merged.find((m) => m.sessionId === "human");
    const reader = merged.find((m) => m.sessionId === "reader");
    expect(human?.client).not.toBeNull();
    expect(reader?.client).toBeNull(); // HTML served, JS never ran
  });
});
