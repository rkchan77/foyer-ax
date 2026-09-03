import { describe, it, expect } from "vitest";
import { renderNginxLine } from "../src/generator.js";
import { parseNginxLine } from "../src/parser.js";
import type { RequestRecord } from "../src/types.js";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

describe("part 1 — renderNginxLine (inverse of the parser)", () => {
  it("renders a record to the exact combined-log-format line", () => {
    const r: RequestRecord = {
      ip: "203.0.113.5",
      timestampMs: 1788270936000,
      method: "GET",
      path: "/pricing",
      status: 200,
      bytes: 5324,
      referer: "https://example.com/",
      userAgent: CHROME_UA,
    };
    expect(renderNginxLine(r)).toBe(
      `203.0.113.5 - - [01/Sep/2026:13:55:36 +0000] "GET /pricing HTTP/1.1" 200 5324 "https://example.com/" "${CHROME_UA}"`
    );
  });

  it("renders bytes 0 as '-' and referer null as '-'", () => {
    const r: RequestRecord = {
      ip: "203.0.113.5",
      timestampMs: 1788271080000,
      method: "GET",
      path: "/favicon.ico",
      status: 304,
      bytes: 0,
      referer: null,
      userAgent: CHROME_UA,
    };
    expect(renderNginxLine(r)).toBe(
      `203.0.113.5 - - [01/Sep/2026:13:58:00 +0000] "GET /favicon.ico HTTP/1.1" 304 - "-" "${CHROME_UA}"`
    );
  });

  it("round-trips: parse(render(r)) deep-equals r (whole-second timestamps)", () => {
    const records: RequestRecord[] = [
      { ip: "203.0.113.5", timestampMs: 1788270936000, method: "GET", path: "/pricing",
        status: 200, bytes: 5324, referer: "https://example.com/", userAgent: CHROME_UA },
      { ip: "198.51.100.22", timestampMs: 1788270940000, method: "POST", path: "/api/signup",
        status: 422, bytes: 88, referer: null, userAgent: "ClaudeBot/1.0" },
      { ip: "203.0.113.5", timestampMs: 1788271080000, method: "GET", path: "/favicon.ico",
        status: 304, bytes: 0, referer: null, userAgent: CHROME_UA },
    ];
    for (const r of records) {
      expect(parseNginxLine(renderNginxLine(r))).toEqual(r);
    }
  });
});