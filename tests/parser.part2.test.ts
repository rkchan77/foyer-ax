// ── PART 2 — do not open until every Part 1 test is green. ─────────
// New requirement: the same tool must now also ingest JSON-lines logs
// (one JSON object per line, Vercel/Cloudflare style). Field names and
// the timestamp format differ from nginx, but the OUTPUT RequestRecord
// shape must be identical. Extend parse()/parseLine() to take
// format: "json" WITHOUT breaking any Part 1 behavior.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse, parseLine } from "../src/parser.js";

const jsonLog = readFileSync(new URL("../fixtures/access.json.log", import.meta.url), "utf8");

describe("part 2 — JSON-lines format", () => {
  it("maps differing field names + ISO timestamp onto the same RequestRecord shape", () => {
    const line =
      `{"timestamp":"2026-09-01T13:55:36.000Z","clientIp":"203.0.113.5","method":"GET","path":"/pricing","status":200,"bytes":5324,"referer":"https://example.com/","userAgent":"UA"}`;
    const rec = parseLine(line, "json");
    expect(rec?.ip).toBe("203.0.113.5");
    expect(rec?.timestampMs).toBe(1788270936000); // same instant as the nginx row
    expect(rec?.method).toBe("GET");
    expect(rec?.path).toBe("/pricing");
    expect(rec?.status).toBe(200);
    expect(rec?.bytes).toBe(5324);
    expect(rec?.referer).toBe("https://example.com/");
    expect(rec?.userAgent).toBe("UA");
  });

  it("preserves an explicit null referer", () => {
    const line =
      `{"timestamp":"2026-09-01T13:55:40.000Z","clientIp":"198.51.100.22","method":"POST","path":"/api/signup","status":422,"bytes":88,"referer":null,"userAgent":"ClaudeBot/1.0"}`;
    expect(parseLine(line, "json")?.referer).toBeNull();
  });

  it("skips blank lines, non-JSON lines, and JSON missing required fields", () => {
    const records = parse(jsonLog, "json");
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.ip)).toEqual(["203.0.113.5", "198.51.100.22"]);
  });

  it("a nginx row and its JSON equivalent produce the same normalized record", () => {
    const nginxLine =
      `203.0.113.5 - - [01/Sep/2026:13:55:36 +0000] "GET /pricing HTTP/1.1" 200 5324 "https://example.com/" "UA"`;
    const jsonLine =
      `{"timestamp":"2026-09-01T13:55:36.000Z","clientIp":"203.0.113.5","method":"GET","path":"/pricing","status":200,"bytes":5324,"referer":"https://example.com/","userAgent":"UA"}`;
    expect(parseLine(jsonLine, "json")).toEqual(parseLine(nginxLine, "nginx"));
  });
});
