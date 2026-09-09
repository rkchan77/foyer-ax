import { describe, expect, it } from "vitest";
import { analyze, formatReport } from "../src/pipeline.js";
import type { Flow, RequestRecord } from "../src/types.js";

let t = 1788270936000;
function rec(
  ip: string,
  method: string,
  path: string,
  status: number,
  ua: string,
): RequestRecord {
  t += 1000;
  return {
    ip,
    timestampMs: t,
    method,
    path,
    status,
    bytes: 100,
    referer: null,
    userAgent: ua,
  };
}

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const GPTBOT = "GPTBot/1.2 (+https://openai.com/gptbot)";

const CHECKOUT: Flow = {
  name: "checkout",
  steps: [
    { path: "/cart" },
    { path: "/checkout" },
    { method: "POST", path: "/api/order" },
  ],
};

describe("analyze — funnel wiring", () => {
  // A human session that completes checkout (browses assets, human pacing)
  // and an agent session that stalls right before ordering.
  const humanRecords = [
    rec("203.0.113.1", "GET", "/", 200, CHROME),
    rec("203.0.113.1", "GET", "/assets/app.js", 200, CHROME),
    rec("203.0.113.1", "GET", "/cart", 200, CHROME),
    rec("203.0.113.1", "GET", "/checkout", 200, CHROME),
    rec("203.0.113.1", "POST", "/api/order", 201, CHROME),
  ];
  const agentRecords = [
    rec("203.0.113.2", "GET", "/", 200, GPTBOT),
    rec("203.0.113.2", "GET", "/cart", 200, GPTBOT),
    rec("203.0.113.2", "GET", "/checkout", 200, GPTBOT),
  ];
  const records = [...humanRecords, ...agentRecords];

  it("computes a funnel per configured flow, split by classified medium", () => {
    const report = analyze(records, [CHECKOUT]);
    expect(report.funnels).toHaveLength(1);
    const { flow, result } = report.funnels[0];
    expect(flow.name).toBe("checkout");
    expect(result.human.total).toBe(1);
    expect(result.human.completionRate).toBe(1);
    expect(result.agent.total).toBe(1);
    expect(result.agent.completionRate).toBe(0);
    expect(result.parityGapStep).toBe(2);
  });

  it("defaults to no funnels when no flows are configured", () => {
    const report = analyze(records);
    expect(report.funnels).toEqual([]);
  });

  it("formatReport prints the flow line with the parity-gap step label", () => {
    const report = analyze(records, [CHECKOUT]);
    const text = formatReport(report);
    expect(text).toContain("checkout: agents 0% vs humans 100%");
    expect(text).toContain("step 3 (POST /api/order)");
  });

  it("omits the flows section entirely when no flows are configured", () => {
    const text = formatReport(analyze(records));
    expect(text).not.toContain("Flows (agent vs human task success)");
  });
});
