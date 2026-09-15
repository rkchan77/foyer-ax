import { describe, expect, it } from "vitest";
import { captureRequest, normalizeHeaders } from "../src/capture/capture.js";
import { classifySignals } from "../src/capture/classifier.js";
import type { ClientSignal, SessionSignals } from "../src/events.js";

const req = (
  sessionId: string,
  raw: Record<string, string>,
  over: Partial<{ method: string; path: string; status: number }> = {},
) =>
  captureRequest({
    method: over.method ?? "GET",
    path: over.path ?? "/product/42",
    ip: "203.0.113.9",
    timestampMs: 1_700_000_000_000,
    status: over.status ?? 200,
    bytes: 900,
    sessionId,
    headers: normalizeHeaders(raw),
  });

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const browserHeaders = {
  "user-agent": CHROME,
  accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  cookie: "foyer_sid=x",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
  "sec-fetch-user": "?1",
};

const humanClient = (over: Partial<ClientSignal> = {}): ClientSignal => ({
  sessionId: "x",
  ts: Date.now(),
  webdriver: false,
  pointerMoves: 42,
  scrolls: 6,
  keyDowns: 10,
  firstInteractionMs: 700,
  visibilityHidden: false,
  viewport: { w: 1440, h: 900 },
  dpr: 2,
  languages: 2,
  hardwareConcurrency: 8,
  ...over,
});

function session(
  events: SessionSignals["events"],
  client: ClientSignal | null,
): SessionSignals {
  return { sessionId: events[0]?.sessionId ?? "x", events, client };
}

describe("classifySignals", () => {
  it("declared crawler -> declared-agent, high confidence", () => {
    const s = session(
      [req("c", { "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)" })],
      null,
    );
    const c = classifySignals(s);
    expect(c.label).toBe("declared-agent");
    expect(c.confidence).toBeGreaterThan(0.9);
    expect(c.signals).toContain("declared-bot-ua");
  });

  it("Web Bot Auth signed -> declared-agent", () => {
    const s = session(
      [
        req("w", {
          "user-agent": "Mozilla/5.0 SomeAgent",
          "signature-agent":
            "https://api.example/.well-known/http-message-signatures-directory",
          signature: "sig1=:abc:",
          "signature-input": 'sig1=("@authority");alg="ed25519"',
        }),
      ],
      null,
    );
    const c = classifySignals(s);
    expect(c.label).toBe("declared-agent");
    expect(c.signals).toContain("web-bot-auth-signed");
  });

  it("fetch/read agent (HTML served, beacon never fires) -> likely-agent", () => {
    const s = session(
      [req("f", { "user-agent": "node-fetch/3.0", accept: "*/*" })],
      null, // JS never executed
    );
    const c = classifySignals(s);
    expect(c.label).toBe("likely-agent");
    expect(c.signals).toContain("no-js-executed");
    expect(c.signals).toContain("no-sec-fetch");
    expect(c.confidence).toBeGreaterThan(0.8);
  });

  it("API/tool client hitting /api -> likely-agent via header layer", () => {
    const s = session(
      [
        req(
          "a",
          {
            "user-agent": "my-app/1.0",
            accept: "application/json",
            authorization: "Bearer t",
          },
          { method: "POST", path: "/api/checkout", status: 200 },
        ),
      ],
      null,
    );
    const c = classifySignals(s);
    expect(c.label).toBe("likely-agent");
    // /api POST is not a "document", so beacon-silence must NOT be credited
    expect(c.signals).not.toContain("no-js-executed");
  });

  it("real human browser (interaction stream) -> human", () => {
    const s = session([req("h", browserHeaders)], humanClient());
    const c = classifySignals(s);
    expect(c.label).toBe("human");
    expect(c.signals).toContain("human-interaction");
  });

  it("agentic browser (real Chrome, JS runs, zero interaction) -> likely-agent", () => {
    // This is the case v1 is blind to: perfect browser headers, but the beacon
    // reports a full page life with no pointer/scroll/key events.
    const s = session(
      [req("g", browserHeaders)],
      humanClient({
        pointerMoves: 0,
        scrolls: 0,
        keyDowns: 0,
        firstInteractionMs: null,
      }),
    );
    const c = classifySignals(s);
    expect(c.label).toBe("likely-agent");
    expect(c.signals).toContain("no-interaction-entropy");
  });

  it("webdriver flag alone is strong evidence", () => {
    const s = session(
      [req("d", browserHeaders)],
      humanClient({ webdriver: true }),
    );
    const c = classifySignals(s);
    expect(c.signals).toContain("webdriver");
  });

  it("empty session -> unknown", () => {
    expect(
      classifySignals({ sessionId: "e", events: [], client: null }).label,
    ).toBe("unknown");
  });
});
