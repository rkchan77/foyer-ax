import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse, parseLine } from "../src/parser.js";
import type { RequestRecord } from "../src/types.js";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const nginxLog = readFileSync(new URL("../fixtures/access.nginx.log", import.meta.url), "utf8");

describe("part 1 — nginx combined log format", () => {
  it("parses a full valid line into a normalized RequestRecord", () => {
    const line =
      `203.0.113.5 - - [01/Sep/2026:13:55:36 +0000] "GET /pricing HTTP/1.1" 200 5324 "https://example.com/" "${CHROME_UA}"`;
    const rec = parseLine(line, "nginx");
    expect(rec).toEqual<RequestRecord>({
      ip: "203.0.113.5",
      timestampMs: 1788270936000,
      method: "GET",
      path: "/pricing",
      status: 200,
      bytes: 5324,
      referer: "https://example.com/",
      userAgent: CHROME_UA,
    });
  });

  it("resolves a non-UTC timezone offset to correct epoch ms", () => {
    // 06:55:36 -0700 is the same instant as 13:55:36 UTC
    const line =
      `198.51.100.22 - - [01/Sep/2026:06:55:36 -0700] "POST /api/signup HTTP/1.1" 422 88 "-" "ClaudeBot/1.0"`;
    expect(parseLine(line, "nginx")?.timestampMs).toBe(1788270936000);
  });

  it("does not naively split on spaces — an unencoded space in the path is preserved", () => {
    const line =
      `192.0.2.44 - - [01/Sep/2026:13:57:10 +0000] "GET /search?q=hello world HTTP/1.1" 200 1200 "-" "GPTBot/1.2"`;
    const rec = parseLine(line, "nginx");
    expect(rec?.method).toBe("GET");
    expect(rec?.path).toBe("/search?q=hello world");
    expect(rec?.status).toBe(200);
  });

  it('treats a "-" bytes field as 0', () => {
    const line =
      `203.0.113.5 - - [01/Sep/2026:13:58:00 +0000] "GET /favicon.ico HTTP/1.1" 304 - "https://example.com/pricing" "${CHROME_UA}"`;
    const rec = parseLine(line, "nginx");
    expect(rec?.status).toBe(304);
    expect(rec?.bytes).toBe(0);
  });

  it('treats a "-" referer as null', () => {
    const line =
      `198.51.100.22 - - [01/Sep/2026:06:55:36 -0700] "POST /api/signup HTTP/1.1" 422 88 "-" "ClaudeBot/1.0"`;
    expect(parseLine(line, "nginx")?.referer).toBeNull();
  });

  it("returns null for a malformed line instead of throwing", () => {
    expect(parseLine("this is a malformed line that should be skipped", "nginx")).toBeNull();
  });

  it("parse() skips blank and malformed lines and returns only valid records", () => {
    const records = parse(nginxLog, "nginx");
    expect(records).toHaveLength(5);
    expect(records.map((r) => r.path)).toEqual([
      "/pricing",
      "/api/signup",
      "/assets/app.js",
      "/search?q=hello world",
      "/favicon.ico",
    ]);
  });

  it("parse() never throws on a file containing junk lines", () => {
    expect(() => parse(nginxLog, "nginx")).not.toThrow();
  });
});
