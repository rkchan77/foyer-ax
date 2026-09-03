// ── PART 2 — the anti-mirror tests. Open after Part 1 is green. ─────
// These sessions are ones your GENERATOR would never produce, so they
// check your classifier weighs multiple signals instead of keying on a
// single giveaway. Build a browser-UA record by hand (not via the
// generator) so you control the adversarial shape.

import { describe, it, expect } from "vitest";
import { classify } from "../src/classifier.js";
import type { RequestRecord, Session } from "../src/types.js";

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

function rec(path: string, ms: number, ua: string): RequestRecord {
  return { ip: "203.0.113.5", timestampMs: ms, method: "GET", path, status: 200, bytes: 1000, referer: null, userAgent: ua };
}

describe("part 2 — adversarial (anti-mirror) cases", () => {
  // A real human with JS disabled loads no assets. "no-assets" alone must
  // NOT be enough to call it an agent.
  it("does NOT call a browser-UA, no-assets, human-paced session an agent", () => {
    const s: Session = {
      ip: "203.0.113.5",
      records: [
        rec("/", 1788270936000, CHROME),
        rec("/pricing", 1788270951000, CHROME),   // +15s, human-paced
        rec("/features", 1788270979000, CHROME),  // +28s
      ],
    };
    const c = classify(s);
    expect(c.label).not.toBe("declared-agent");
    expect(c.label).not.toBe("likely-agent");
  });

  // An agent that DOES fetch assets but still has a bot UA is clearly an agent —
  // the bot UA must dominate the (contradicting) asset signal.
  it("still flags a bot-UA session even if it loads assets", () => {
    const s: Session = {
      ip: "203.0.113.5",
      records: [
        rec("/", 1788270936000, "GPTBot/1.2 (+https://openai.com/gptbot)"),
        rec("/assets/app.js", 1788270937000, "GPTBot/1.2 (+https://openai.com/gptbot)"),
        rec("/pricing", 1788270938000, "GPTBot/1.2 (+https://openai.com/gptbot)"),
      ],
    };
    expect(classify(s).label).toBe("declared-agent");
  });

  // A browser-UA session with NO bot signature but tight, dead-regular timing
  // and no assets should read as suspicious (agent-ish), not confidently human.
  it("flags a browser-UA session with mechanical timing + no assets as not-human", () => {
    const s: Session = {
      ip: "203.0.113.5",
      records: [
        rec("/", 1788270936000, CHROME),
        rec("/pricing", 1788270937000, CHROME),   // +1s
        rec("/features", 1788270938000, CHROME),  // +1s
        rec("/blog", 1788270939000, CHROME),      // +1s  (dead regular)
      ],
    };
    expect(classify(s).label).not.toBe("human");
  });
});