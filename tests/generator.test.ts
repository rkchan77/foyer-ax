// ── PART 2 — do not open until every Part 1 test is green. ─────────
// New requirement: generate whole labeled SESSIONS (a visitor's request
// sequence), with human vs agent sessions that differ in the ways your
// future classifier will key on — then combine them into a labeled log.

import { describe, it, expect } from "vitest";
import { generateSession, generateLog, renderNginxLine } from "../src/generator.js";
import { parse } from "../src/parser.js";

describe("part 2 — session generation", () => {
  it("human session: browser UA, loads assets, one shared IP, ordered timestamps", () => {
    const s = generateSession({ kind: "human", ip: "203.0.113.9", startMs: 1788270936000 });
    expect(s.kind).toBe("human");
    expect(s.records.length).toBeGreaterThan(0);
    expect(s.records.every((r) => r.ip === "203.0.113.9")).toBe(true);
    expect(s.records.every((r) => /Mozilla/.test(r.userAgent))).toBe(true);
    expect(s.records.some((r) => r.path.includes("/assets/"))).toBe(true); // humans load assets
    for (let i = 1; i < s.records.length; i++) {
      expect(s.records[i].timestampMs).toBeGreaterThanOrEqual(s.records[i - 1].timestampMs);
    }
  });

  it("agent session: bot UA, NO asset requests, one shared IP, ordered timestamps", () => {
    const s = generateSession({ kind: "agent", ip: "198.51.100.7", startMs: 1788270936000 });
    expect(s.kind).toBe("agent");
    expect(s.records.length).toBeGreaterThan(0);
    expect(s.records.every((r) => r.ip === "198.51.100.7")).toBe(true);
    expect(s.records.every((r) => /GPTBot|ClaudeBot|PerplexityBot/.test(r.userAgent))).toBe(true);
    expect(s.records.some((r) => r.path.includes("/assets/"))).toBe(false); // agents skip assets
    for (let i = 1; i < s.records.length; i++) {
      expect(s.records[i].timestampMs).toBeGreaterThanOrEqual(s.records[i - 1].timestampMs);
    }
  });

  it("generateLog: labels match sessions, and the log parses back to every record", () => {
    const specs = [
      { kind: "human", ip: "203.0.113.9", startMs: 1788270936000 },
      { kind: "agent", ip: "198.51.100.7", startMs: 1788270936000 },
      { kind: "agent", ip: "198.51.100.8", startMs: 1788271000000 },
    ] as const;
    const { logText, labels } = generateLog([...specs]);

    expect(labels).toEqual([
      { ip: "203.0.113.9", kind: "human" },
      { ip: "198.51.100.7", kind: "agent" },
      { ip: "198.51.100.8", kind: "agent" },
    ]);

    const expectedCount =
      generateSession(specs[0]).records.length +
      generateSession(specs[1]).records.length +
      generateSession(specs[2]).records.length;

    const parsed = parse(logText, "nginx");
    expect(parsed).toHaveLength(expectedCount); // everything the generator emits, the parser accepts
  });
});
