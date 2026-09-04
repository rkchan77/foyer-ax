import { describe, it, expect } from "vitest";
import { detectFriction } from "../src/friction.js";
import type { RequestRecord, Session } from "../src/types.js";

let t = 1788270936000;
function rec(method: string, path: string, status: number): RequestRecord {
  t += 1000;
  return { ip: "203.0.113.5", timestampMs: t, method, path, status, bytes: 100, referer: null, userAgent: "GPTBot/1.2" };
}
const session = (records: RequestRecord[]): Session => ({ ip: "203.0.113.5", records });

describe("detectFriction — friction signals", () => {
  it("a clean successful session has no friction", () => {
    const s = session([rec("GET", "/", 200), rec("GET", "/pricing", 200), rec("POST", "/api/order", 200)]);
    const r = detectFriction(s);
    expect(r.hadFriction).toBe(false);
    expect(r.findings).toHaveLength(0);
  });

  it("detects a retry storm (same endpoint hit 3+ times in a row)", () => {
    const s = session([
      rec("GET", "/product/42", 200),
      rec("POST", "/api/checkout", 422),
      rec("POST", "/api/checkout", 422),
      rec("POST", "/api/checkout", 422),
      rec("GET", "/", 200),
    ]);
    const r = detectFriction(s);
    const storm = r.findings.find((f) => f.kind === "retry-storm");
    expect(storm).toBeDefined();
    expect(storm?.path).toBe("/api/checkout");
  });

  it("detects a 4xx cluster", () => {
    const s = session([
      rec("GET", "/a", 400),
      rec("GET", "/b", 404),
      rec("GET", "/c", 422),
      rec("GET", "/d", 200),
    ]);
    expect(detectFriction(s).findings.some((f) => f.kind === "4xx-cluster")).toBe(true);
  });

  it("detects an auth wall (repeated 401/403)", () => {
    const s = session([rec("GET", "/account", 401), rec("GET", "/account", 403)]);
    expect(detectFriction(s).findings.some((f) => f.kind === "auth-wall")).toBe(true);
  });

  it("detects abandonment when the session ends on an error", () => {
    const s = session([rec("GET", "/", 200), rec("POST", "/api/checkout", 422)]);
    expect(detectFriction(s).findings.some((f) => f.kind === "abandonment")).toBe(true);
  });

  it("does NOT flag abandonment when the session ends on success", () => {
    const s = session([rec("POST", "/api/checkout", 422), rec("POST", "/api/checkout", 200)]);
    expect(detectFriction(s).findings.some((f) => f.kind === "abandonment")).toBe(false);
  });

  it("every finding carries a human-readable detail string", () => {
    const s = session([rec("POST", "/x", 422), rec("POST", "/x", 422), rec("POST", "/x", 422)]);
    for (const f of detectFriction(s).findings) {
      expect(typeof f.detail).toBe("string");
      expect(f.detail.length).toBeGreaterThan(0);
    }
  });
});