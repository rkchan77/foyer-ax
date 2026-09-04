// ── PART 2 — open after Part 1 is green. ───────────────────────────
// The business layer: aggregate matchFlow across sessions, split by medium,
// to get agent-vs-human completion and the step where agents fall behind.
import { describe, it, expect } from "vitest";
import { computeFunnel } from "../src/flows.js";
import type { RequestRecord, Flow, MediumSession } from "../src/types.js";

let t = 1788270936000;
const rec = (method: string, path: string): RequestRecord => ({
  ip: "1.1.1.1", timestampMs: (t += 1000), method, path, status: 200, bytes: 1, referer: null, userAgent: "x",
});
const CHECKOUT: Flow = {
  name: "checkout",
  steps: [{ path: "/cart" }, { path: "/checkout" }, { method: "POST", path: "/api/order" }],
};
const complete = () => [rec("GET", "/cart"), rec("GET", "/checkout"), rec("POST", "/api/order")];
const stallAtOrder = () => [rec("GET", "/cart"), rec("GET", "/checkout")]; // reaches 2, never orders

describe("part 2 — computeFunnel (agent vs human)", () => {
  // 4 humans all complete; 4 agents all stall right before ordering.
  const sessions: MediumSession[] = [
    ...Array.from({ length: 4 }, () => ({ medium: "human" as const, records: complete() })),
    ...Array.from({ length: 4 }, () => ({ medium: "agent" as const, records: stallAtOrder() })),
  ];
  const f = computeFunnel(CHECKOUT, sessions);

  it("counts totals per medium", () => {
    expect(f.human.total).toBe(4);
    expect(f.agent.total).toBe(4);
  });

  it("computes completion rate per medium", () => {
    expect(f.human.completionRate).toBe(1);
    expect(f.agent.completionRate).toBe(0);
  });

  it("tracks reach per step (cumulative, in order)", () => {
    expect(f.human.reachedPerStep).toEqual([4, 4, 4]);
    expect(f.agent.reachedPerStep).toEqual([4, 4, 0]); // agents reach cart+checkout, never order
  });

  it("identifies the parity-gap step (where humans out-reach agents most)", () => {
    expect(f.parityGapStep).toBe(2); // the POST /api/order step
  });

  it("handles a medium with zero sessions without dividing by zero", () => {
    const onlyHumans = computeFunnel(CHECKOUT, [{ medium: "human", records: complete() }]);
    expect(onlyHumans.agent.total).toBe(0);
    expect(onlyHumans.agent.completionRate).toBe(0);
    expect(onlyHumans.parityGapStep).toBeNull(); // no agents -> no gap
  });
});