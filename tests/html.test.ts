import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../src/html.js";
import { analyze } from "../src/pipeline.js";
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

const META = {
  source: "shop.example.com",
  adapter: "vercel",
  version: "0.1.0",
  generatedAt: "2026-01-01",
};

describe("renderHtmlReport", () => {
  const records = [
    rec("203.0.113.1", "GET", "/", 200, CHROME),
    rec("203.0.113.1", "GET", "/assets/app.js", 200, CHROME),
    rec("203.0.113.1", "GET", "/cart", 200, CHROME),
    rec("203.0.113.1", "GET", "/checkout", 200, CHROME),
    rec("203.0.113.1", "POST", "/api/order", 201, CHROME),
    rec("203.0.113.2", "GET", "/", 200, GPTBOT),
    rec("203.0.113.2", "GET", "/cart", 200, GPTBOT),
    rec("203.0.113.2", "GET", "/checkout", 200, GPTBOT),
    rec("203.0.113.2", "GET", "/account", 401, GPTBOT),
    rec("203.0.113.2", "GET", "/account", 403, GPTBOT),
  ];

  it("produces a well-formed, self-contained HTML document", () => {
    const html = renderHtmlReport(analyze(records, [CHECKOUT]), META);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("shop.example.com");
    expect(html).toContain("checkout");
  });

  it("reflects the report's real numbers, not placeholders", () => {
    const report = analyze(records, [CHECKOUT]);
    const html = renderHtmlReport(report, META);
    expect(html).toContain(`>${report.totalRequests}<`);
    expect(html).toContain(`>${report.totalSessions}<`);
    expect(html).toContain(report.agentSessionPct.toFixed(1));
  });

  it("escapes HTML-unsafe characters from dynamic content", () => {
    const evil = [
      rec(
        "203.0.113.9",
        "GET",
        '/<script>alert("x")</script>',
        200,
        '"><img src=x onerror=alert(1)>',
      ),
    ];
    const html = renderHtmlReport(analyze(evil), META);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x onerror");
  });

  it("renders without a funnel section when no flows are configured", () => {
    const html = renderHtmlReport(analyze(records), META);
    expect(html).not.toContain('<div class="funnel-wrap">');
  });

  it("omits the friction section when nothing has friction", () => {
    const clean = [rec("203.0.113.3", "GET", "/", 200, CHROME)];
    const html = renderHtmlReport(analyze(clean), META);
    expect(html).not.toContain(">Friction<");
  });

  it("labels the parity-gap step using the flow's actual method + path", () => {
    const html = renderHtmlReport(analyze(records, [CHECKOUT]), META);
    expect(html).toContain("POST /api/order");
  });
});
