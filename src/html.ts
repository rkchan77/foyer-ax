import type { AnalysisReport, FlowFunnel } from "./pipeline.js";
import { stepLabel } from "./pipeline.js";
import type { Flow, MediumStats, SessionLabel } from "./types.js";

export interface ReportMeta {
  /** Where the traffic came from, e.g. "shop.example.com". */
  source: string;
  /** Which log adapter produced the records, e.g. "vercel". */
  adapter: string;
  /** Human-readable analysis window, e.g. "24h". Falls back to "—". */
  window?: string;
  /** ISO date the report was generated. Defaults to today (UTC). */
  generatedAt?: string;
  /** foyer version for the footer, e.g. "0.1.0". */
  version: string;
}

// declared/likely-agent count as "agent"; unknown/human do not.
const AGENT_LABELS: ReadonlySet<SessionLabel> = new Set([
  "declared-agent",
  "likely-agent",
]);

// ── Composition: fixed display order + palette, so the bar and legend are
// stable across reports regardless of which labels happen to be present.
const COMPOSITION: { label: SessionLabel; name: string; cls: string }[] = [
  { label: "human", name: "Human", cls: "s-human" },
  { label: "declared-agent", name: "Declared agent", cls: "s-declared" },
  { label: "likely-agent", name: "Likely agent", cls: "s-likely" },
  { label: "unknown", name: "Unknown", cls: "s-unknown" },
];

const FRICTION_LABELS: Record<string, string> = {
  "retry-storm": "Retry storm",
  "4xx-cluster": "4xx cluster",
  "auth-wall": "Auth wall",
  abandonment: "Abandonment",
};

/** Escape text bound for HTML — every dynamic string (paths, UAs, vendors,
 * flow names, friction details) passes through here before rendering. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function agentSessionCount(byLabel: Record<string, number>): number {
  let n = 0;
  for (const label of AGENT_LABELS) n += byLabel[label] ?? 0;
  return n;
}

/** Per-step reach as a % of that medium's total sessions (0 when total 0).
 * Consistent with computeFunnel's rate math and parity-gap detection.
 * For a classic "% of those who entered" funnel, divide by
 * reachedPerStep[0] instead of total. */
function stepPcts(stats: MediumStats): number[] {
  if (stats.total === 0) return stats.reachedPerStep.map(() => 0);
  return stats.reachedPerStep.map((r) => (r / stats.total) * 100);
}

function pctText(p: number, total: number): string {
  return total > 0 ? `${Math.round(p)}%` : "n/a";
}

// ── Funnel SVG geometry ────────────────────────────────────────────────────
// Two tapering funnels (human left, agent right). Widths encode reach; the
// pinch where the agent funnel collapses is the whole thesis in one shape.
const TOP_Y = 40;
const STEP_GAP = 92;
const POLY_MAX_HALF = 130; // half-width at 100%
const GUIDE_HALF = 144;
const H_CENTER = 150;
const A_CENTER = 600;
const VB_W = 750;
const PAD_BOTTOM = 34;
const MID_X = (H_CENTER + A_CENTER) / 2; // step-name column

function polygonPoints(center: number, pcts: number[], ys: number[]): string {
  const pts: string[] = [];
  for (let i = 0; i < pcts.length; i++) {
    const half = (pcts[i] / 100) * POLY_MAX_HALF;
    pts.push(`${(center - half).toFixed(1)},${ys[i]}`);
  }
  for (let i = pcts.length - 1; i >= 0; i--) {
    const half = (pcts[i] / 100) * POLY_MAX_HALF;
    pts.push(`${(center + half).toFixed(1)},${ys[i]}`);
  }
  return pts.join(" ");
}

// A percent label sits centered *inside* the funnel when it fits; when the band
// is too narrow (small values on arbitrary data) it flips to dark ink just
// outside the funnel so it never vanishes on the light paper.
function pctLabel(
  center: number,
  pct: number,
  total: number,
  y: number,
  isLast: boolean,
  onPaper: boolean,
): string {
  const fontSize = isLast ? 18 : 13;
  const cls = `fpct ${isLast ? "flast " : ""}`;
  const txt = pctText(pct, total);
  const half = (pct / 100) * POLY_MAX_HALF;
  const textW = txt.length * fontSize * 0.62;
  const dy = isLast ? -10 : 17;
  const ty = y + dy;
  if (2 * half >= textW + 10) {
    const tone = onPaper ? "agentt" : "humant";
    return `<text x="${center}" y="${ty}" class="${cls}${tone}" text-anchor="middle">${txt}</text>`;
  }
  // too narrow — dark ink, anchored just right of the funnel edge
  const x = (center + half + 8).toFixed(1);
  return `<text x="${x}" y="${ty}" class="${cls}humant" text-anchor="start">${txt}</text>`;
}

function funnelSvg(flow: Flow, ff: FlowFunnel): string {
  const n = ff.result.steps;
  const ys = Array.from({ length: n }, (_, i) => TOP_Y + i * STEP_GAP);
  const vbH = ys[n - 1] + PAD_BOTTOM;
  const hPct = stepPcts(ff.result.human);
  const aPct = stepPcts(ff.result.agent);
  const hTotal = ff.result.human.total;
  const aTotal = ff.result.agent.total;

  const guides: string[] = [];
  const names: string[] = [];
  const hLabels: string[] = [];
  const aLabels: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = ys[i];
    const last = i === n - 1;
    guides.push(
      `<line x1="${H_CENTER - GUIDE_HALF}" y1="${y}" x2="${H_CENTER + GUIDE_HALF}" y2="${y}" class="guide"/>` +
        `<line x1="${A_CENTER - GUIDE_HALF}" y1="${y}" x2="${A_CENTER + GUIDE_HALF}" y2="${y}" class="guide"/>`,
    );
    names.push(
      `<text x="${MID_X}" y="${y + 4}" class="stepname" text-anchor="middle">${esc(stepLabel(flow, i))}</text>`,
    );
    hLabels.push(pctLabel(H_CENTER, hPct[i], hTotal, y, last, false));
    aLabels.push(pctLabel(A_CENTER, aPct[i], aTotal, y, last, true));
  }

  return `<svg viewBox="0 0 ${VB_W} ${vbH}" class="funnel-svg" role="img" aria-label="${esc(flow.name)} funnel: human versus agent completion by step">
    ${guides.join("\n    ")}
    <text x="${H_CENTER}" y="20" class="ftitle" text-anchor="middle">Human</text>
    <text x="${A_CENTER}" y="20" class="ftitle" text-anchor="middle">Agent</text>
    <polygon points="${polygonPoints(H_CENTER, hPct, ys)}" class="fpoly human"/>
    <polygon points="${polygonPoints(A_CENTER, aPct, ys)}" class="fpoly agent"/>
    ${names.join("\n    ")}
    ${hLabels.join("\n    ")}
    ${aLabels.join("\n    ")}
  </svg>`;
}

// One-sentence read of the funnel, composed from the numbers. If a friction
// finding lands on the parity-gap endpoint, its detail is appended verbatim
// (escaped) as the concrete reason — no fabricated interpretation.
function funnelCallout(
  report: AnalysisReport,
  flow: Flow,
  ff: FlowFunnel,
): string {
  const a = ff.result.agent;
  const h = ff.result.human;
  if (a.total === 0 || h.total === 0) return "";
  const aPct = Math.round(a.completionRate * 100);
  const hPct = Math.round(h.completionRate * 100);
  let s = `Agents complete ${esc(flow.name)} at <b>${aPct}%</b> versus <b>${hPct}%</b> for humans`;

  const gap = ff.result.parityGapStep;
  if (gap !== null) {
    s += `, falling behind at <b>${esc(stepLabel(flow, gap))}</b>`;
    const gapPath = flow.steps[gap]?.path;
    const finding = report.analyses
      .flatMap((x) => x.friction.findings)
      .find((f) => f.path && f.path === gapPath);
    if (finding) s += ` — ${esc(finding.detail)}`;
  }
  return `<div class="callout">${s}.</div>`;
}

// ── Section builders ────────────────────────────────────────────────────────
function metaRow(k: string, v: string, mono = false): string {
  return `<div><div class="k">${k}</div><div class="v${mono ? " data" : ""}">${esc(v)}</div></div>`;
}

function composition(report: AnalysisReport): string {
  const total = report.totalSessions;
  const present = COMPOSITION.filter((c) => (report.byLabel[c.label] ?? 0) > 0);
  const bar = present
    .map((c) => {
      const w = total ? ((report.byLabel[c.label] ?? 0) / total) * 100 : 0;
      return `<span class="${c.cls}" style="width:${w.toFixed(1)}%"></span>`;
    })
    .join("");
  const legend = present
    .map(
      (c) =>
        `<div class="item"><span class="sw ${c.cls}"></span>${c.name}<span class="c data">${report.byLabel[c.label] ?? 0}</span></div>`,
    )
    .join("");
  return `<section>
    <div class="label">Composition</div>
    <div class="compbar">${bar}</div>
    <div class="legend">${legend}</div>
  </section>`;
}

function vendors(report: AnalysisReport): string {
  const rows = Object.entries(report.vendors).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return "";
  const max = rows[0][1] || 1;
  const body = rows
    .map(
      ([name, n]) =>
        `<div class="vrow"><div class="vn">${esc(name)}</div><div class="vc data">${n}</div><div class="vbar" style="width:${((n / max) * 100).toFixed(0)}%"></div></div>`,
    )
    .join("\n    ");
  return `<section>
    <div class="label">Agent vendors</div>
    ${body}
  </section>`;
}

function funnelSection(report: AnalysisReport): string {
  if (report.funnels.length === 0) return "";
  return report.funnels
    .map((ff) => {
      const flow = ff.flow;
      return `<section>
    <div class="label">${esc(flow.name)}</div>
    <div class="funnel-wrap">${funnelSvg(flow, ff)}</div>
    ${funnelCallout(report, flow, ff)}
  </section>`;
    })
    .join("\n  ");
}

function friction(report: AnalysisReport): string {
  // Aggregate findings by (kind, path) so the ×N is a real occurrence count.
  const groups = new Map<
    string,
    { kind: string; detail: string; count: number }
  >();
  for (const a of report.analyses) {
    for (const f of a.friction.findings) {
      const key = `${f.kind}|${f.path ?? f.detail}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { kind: f.kind, detail: f.detail, count: 1 });
    }
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r) =>
        `<div class="frow"><div class="fk">${esc(FRICTION_LABELS[r.kind] ?? r.kind)}</div><div class="fd"><span class="data">${esc(r.detail)}</span></div><div class="fm data">×${r.count}</div></div>`,
    )
    .join("\n    ");
  return `<section>
    <div class="label">Friction</div>
    ${body}
  </section>`;
}

/** Render a complete, self-contained editorial HTML report. */
export function renderHtmlReport(
  report: AnalysisReport,
  meta: ReportMeta,
): string {
  const generatedAt = meta.generatedAt ?? new Date().toISOString().slice(0, 10);
  const window = meta.window ?? "—";
  const agentSessions = agentSessionCount(report.byLabel);
  const vendorsSeen = Object.keys(report.vendors).length;
  const heroPct = report.agentSessionPct.toFixed(1);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>foyer — agent experience report (${esc(meta.source)})</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#F4F0E8; --paper-inset:#ECE7DB; --ink:#1C1A17; --ink-dim:#57534B;
    --ink-faint:#928C81; --rule:#DAD3C4; --agent:#2F5249; --human:#B4AC9C; --pewter:#96907D; --unknown:#C7BFAE;
 --disp:"Space Mono",ui-monospace,monospace; --body:"Newsreader",Georgia,serif; --data:"Space Mono",ui-monospace,monospace;}
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body{background:var(--paper);color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.55;padding:0 24px}
  .data{font-family:var(--data);font-feature-settings:"tnum" 1;font-variant-numeric:tabular-nums}
  .disp{font-family:var(--disp)}
  .wrap{max-width:940px;margin:0 auto;padding:56px 0 110px}

  .masthead{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:14px;border-bottom:1.5px solid var(--ink)}
  .wordmark{font-family:var(--disp);font-size:22px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
  .wordmark i{font-style:normal;color:var(--pewter)}
  .doctype{text-align:right;font-size:13px;color:var(--ink-faint);line-height:1.5}
  .doctype b{color:var(--ink-dim);font-weight:400}

  .meta{display:grid;grid-template-columns:repeat(4,1fr);margin-top:16px;gap:26px}
  .meta .k{font-size:12px;color:var(--ink-faint);margin-bottom:4px}
  .meta .v{font-size:14px;color:var(--ink-dim)}
  .meta .v.data{font-family:var(--data)}

  .hero{padding:72px 0 60px}
  .hero .figure{font-family:var(--data);font-variant-numeric:tabular-nums;font-size:140px;line-height:.86;font-weight:700;color:var(--agent);letter-spacing:-.04em}
  .hero .figure .pct{font-size:58px;vertical-align:24px;font-weight:400}
  .hero .verdict{margin-top:28px;max-width:26ch;font-family:var(--disp);font-size:30px;line-height:1.3;color:var(--ink);font-weight:400}
  .hero .sub{margin-top:18px;font-size:15px;color:var(--ink-dim);max-width:58ch;line-height:1.6}

  .band{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--rule)}
  .band .cell{padding:22px 22px 22px 0}
  .band .n{font-family:var(--data);font-size:30px;font-weight:500;color:var(--ink)}
  .band .n.agent{color:var(--agent)}
  .band .l{margin-top:8px;font-size:13px;color:var(--ink-faint)}

  section{padding:46px 0;border-bottom:1px solid var(--rule)}
  .label{font-family:var(--disp);font-size:15px;font-weight:500;color:var(--pewter);margin-bottom:28px}

  .compbar{display:flex;height:7px;width:100%;margin-bottom:18px;gap:2px}
  .compbar span{display:block;height:100%}
  .s-human{background:var(--human)} .s-declared{background:var(--agent)} .s-likely{background:var(--pewter)} .s-unknown{background:var(--unknown)}
  .legend{display:flex;gap:30px;flex-wrap:wrap}
  .legend .item{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--ink-dim)}
  .legend .sw{width:9px;height:9px;flex:none}
  .legend .c{font-family:var(--data);color:var(--ink);margin-left:4px}

  .vrow{display:grid;grid-template-columns:150px 46px 1fr;align-items:center;gap:18px;padding:12px 0;border-top:1px solid var(--rule)}
  .vrow:first-child{border-top:0}
  .vrow .vn{color:var(--ink);font-size:15px}
  .vrow .vc{font-family:var(--data);color:var(--ink-dim);font-size:13px;text-align:right}
  .vrow .vbar{height:2px;background:var(--agent)}

  .funnel-wrap{width:100%;overflow:visible}
  .funnel-svg{width:100%;height:auto;display:block}
  .funnel-svg .guide{stroke:var(--rule);stroke-width:1}
  .funnel-svg .fpoly.human{fill:var(--human)}
  .funnel-svg .fpoly.agent{fill:var(--agent)}
  .funnel-svg .ftitle{font-family:var(--disp);font-size:14px;font-weight:500;fill:var(--ink-dim)}
  .funnel-svg .stepname{font-family:var(--data);font-size:13px;fill:var(--ink)}
  .funnel-svg .fpct{font-family:var(--data);font-size:13px}
  .funnel-svg .humant{fill:var(--ink)}
  .funnel-svg .agentt{fill:var(--paper)}
  .funnel-svg .flast{font-size:18px;font-weight:700}
  .callout{margin-top:30px;padding-left:22px;border-left:2px solid var(--agent);font-size:16px;color:var(--ink-dim);line-height:1.6;max-width:66ch}
  .callout b{color:var(--agent);font-weight:500;font-family:var(--data)}

  .frow{display:grid;grid-template-columns:140px 1fr auto;gap:20px;align-items:baseline;padding:15px 0;border-top:1px solid var(--rule)}
  .frow:first-child{border-top:0}
  .frow .fk{font-family:var(--disp);font-size:13px;color:var(--pewter)}
  .frow .fd{color:var(--ink-dim);font-size:15px}
  .frow .fd .data{font-family:var(--data);color:var(--ink)}
  .frow .fm{font-family:var(--data);font-size:13px;color:var(--ink-faint);text-align:right}

  .foot{display:flex;justify-content:space-between;padding-top:30px;font-size:13px;color:var(--ink-faint)}
  .foot .data{font-family:var(--data)}

  @media (max-width:720px){.meta,.band{grid-template-columns:repeat(2,1fr);gap:18px}.hero .figure{font-size:92px}.vrow{grid-template-columns:110px 40px 1fr}}
  @media (prefers-reduced-motion:no-preference){.fpoly{animation:fade .9s ease both}@keyframes fade{from{opacity:0}to{opacity:1}}}
</style></head>
<body><div class="wrap">
  <header class="masthead">
    <div class="wordmark">foyer<i>.</i></div>
    <div class="doctype">Agent Experience Report<br><b>Editorial · v${esc(meta.version)}</b></div>
  </header>
  <div class="meta">
    ${metaRow("Source", meta.source)}
    ${metaRow("Adapter", meta.adapter)}
    ${metaRow("Window", window, true)}
    ${metaRow("Generated", generatedAt, true)}
  </div>
  <div class="hero">
    <div class="figure">${heroPct}<span class="pct">%</span></div>
    <div class="verdict">of sessions were AI agents — traffic your product analytics never recorded.</div>
    <div class="sub">Agents don't run client-side JavaScript, so pixel-based analytics miss them entirely. foyer reads them at the edge and measures whether they complete what they came to do.</div>
  </div>
  <div class="band">
    <div class="cell"><div class="n data">${report.totalRequests.toLocaleString("en-US")}</div><div class="l">Requests</div></div>
    <div class="cell"><div class="n data">${report.totalSessions.toLocaleString("en-US")}</div><div class="l">Sessions</div></div>
    <div class="cell"><div class="n data agent">${agentSessions.toLocaleString("en-US")}</div><div class="l">Agent sessions</div></div>
    <div class="cell"><div class="n data">${vendorsSeen}</div><div class="l">Vendors seen</div></div>
  </div>
  ${composition(report)}
  ${vendors(report)}
  ${funnelSection(report)}
  ${friction(report)}
  <div class="foot"><div>Generated by <span class="data">foyer-ax ${esc(meta.version)}</span></div><div>Agent-experience analytics</div></div>
</div></body></html>`;
}
