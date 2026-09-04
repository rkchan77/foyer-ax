import { describe, it, expect } from "vitest";
import { classify } from "../src/classifier.js";
import { generateSession } from "../src/generator.js";
import type { Session } from "../src/types.js";

describe("classify — obvious sessions", () => {
  it("labels a declared-agent (bot UA) session", () => {
    const s = generateSession({ kind: "agent", ip: "198.51.100.7", startMs: 1788270936000 });
    const c = classify(s);
    expect(c.label).toBe("declared-agent");
    expect(c.confidence).toBeGreaterThan(0.8);
    expect(c.signals).toContain("bot-ua");
  });

  it("labels a normal human session as human", () => {
    const s = generateSession({ kind: "human", ip: "203.0.113.9", startMs: 1788270936000 });
    const c = classify(s);
    expect(c.label).toBe("human");
    expect(c.signals).not.toContain("bot-ua");
  });

  it("returns unknown with 0 confidence for an empty session", () => {
    const c = classify({ ip: "203.0.113.1", records: [] });
    expect(c.label).toBe("unknown");
    expect(c.confidence).toBe(0);
  });

  it("always reports which signals fired", () => {
    const s = generateSession({ kind: "agent", ip: "198.51.100.7", startMs: 1788270936000 });
    expect(Array.isArray(classify(s).signals)).toBe(true);
  });
});