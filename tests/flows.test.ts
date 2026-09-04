import { describe, it, expect } from "vitest";
import { matchFlow } from "../src/flows.js";
import type { RequestRecord, Flow } from "../src/types.js";

let t = 1788270936000;
const rec = (method: string, path: string): RequestRecord => ({
  ip: "203.0.113.5", timestampMs: (t += 1000), method, path, status: 200, bytes: 1, referer: null, userAgent: "x",
});
const CHECKOUT: Flow = {
  name: "checkout",
  steps: [{ path: "/cart" }, { path: "/checkout" }, { method: "POST", path: "/api/order" }],
};

describe("part 1 — matchFlow (subsequence)", () => {
  it("completes on a clean in-order session", () => {
    const m = matchFlow(CHECKOUT, [rec("GET", "/cart"), rec("GET", "/checkout"), rec("POST", "/api/order")]);
    expect(m.reached).toBe(3);
    expect(m.completed).toBe(true);
  });

  it("completes even with unrelated requests interleaved (gaps allowed)", () => {
    const m = matchFlow(CHECKOUT, [
      rec("GET", "/cart"), rec("GET", "/product/42"), rec("GET", "/checkout"),
      rec("GET", "/api/shipping"), rec("POST", "/api/order"),
    ]);
    expect(m.completed).toBe(true);
    expect(m.reached).toBe(3);
  });

  it("reports the furthest step reached on a partial session", () => {
    const m = matchFlow(CHECKOUT, [rec("GET", "/cart"), rec("GET", "/checkout")]);
    expect(m.reached).toBe(2);
    expect(m.completed).toBe(false);
  });

  it("enforces order — steps seen out of order do not all count", () => {
    const m = matchFlow(CHECKOUT, [rec("GET", "/checkout"), rec("GET", "/cart")]);
    expect(m.reached).toBe(1); // only /cart matches (as step 0); /checkout came too early
  });

  it("respects a step's method constraint", () => {
    const getOrder = matchFlow(CHECKOUT, [rec("GET", "/cart"), rec("GET", "/checkout"), rec("GET", "/api/order")]);
    expect(getOrder.completed).toBe(false); // GET does not satisfy the POST step
    expect(getOrder.reached).toBe(2);
  });

  it("matches a trailing wildcard step and ignores query strings", () => {
    const flow: Flow = { name: "browse", steps: [{ path: "/product/*" }, { path: "/checkout" }] };
    const m = matchFlow(flow, [rec("GET", "/product/42?ref=home"), rec("GET", "/checkout?step=1")]);
    expect(m.completed).toBe(true);
  });

  it("reaches 0 on an empty session", () => {
    expect(matchFlow(CHECKOUT, []).reached).toBe(0);
  });
});