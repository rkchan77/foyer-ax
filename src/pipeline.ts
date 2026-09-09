import { vendorForUserAgent } from "./bots.js";
import { classify } from "./classifier.js";
import { computeFunnel } from "./flows.js";
import { detectFriction } from "./friction.js";
import { sessionize } from "./sessionize.js";
import type {
  Classification,
  Flow,
  FrictionReport,
  FunnelResult,
  Medium,
  MediumSession,
  RequestRecord,
  Session,
  SessionLabel,
} from "./types.js";

export interface SessionAnalysis {
  session: Session;
  classification: Classification;
  friction: FrictionReport;
}

// A funnel result alongside the flow it was computed from, so presentation
// can label the parity-gap step (e.g. "POST /api/order") without
// `FunnelResult` itself having to carry the flow definition.
export interface FlowFunnel {
  flow: Flow;
  result: FunnelResult;
}

export interface AnalysisReport {
  totalRequests: number;
  totalSessions: number;
  byLabel: Record<string, number>;
  agentSessionPct: number;
  vendors: Record<string, number>;
  sessionsWithFriction: number;
  frictionByKind: Record<string, number>;
  analyses: SessionAnalysis[];
  funnels: FlowFunnel[];
}

const AGENT_LABELS = new Set(["declared-agent", "likely-agent"]);

// declared/likely-agent -> "agent", human -> "human"; "unknown" sessions
// don't have a clear medium, so they're excluded from the funnel entirely.
function mediumForLabel(label: SessionLabel): Medium | null {
  if (AGENT_LABELS.has(label)) return "agent";
  if (label === "human") return "human";
  return null;
}

export function analyze(
  records: RequestRecord[],
  flows: Flow[] = [],
): AnalysisReport {
  const sessions = sessionize(records);
  const analyses = sessions.map((session) => ({
    session,
    classification: classify(session),
    friction: detectFriction(session),
  }));

  const byLabel: Record<string, number> = {};
  const vendors: Record<string, number> = {};
  const frictionByKind: Record<string, number> = {};
  const mediumSessions: MediumSession[] = [];
  let agentSessions = 0;
  let sessionsWithFriction = 0;

  for (const a of analyses) {
    const label = a.classification.label;
    byLabel[label] = (byLabel[label] ?? 0) + 1;
    if (AGENT_LABELS.has(label)) {
      agentSessions++;
      const vendor = vendorForUserAgent(a.session.records[0].userAgent);
      vendors[vendor] = (vendors[vendor] ?? 0) + 1;
    }
    if (a.friction.hadFriction) {
      sessionsWithFriction++;
      for (const f of a.friction.findings)
        frictionByKind[f.kind] = (frictionByKind[f.kind] ?? 0) + 1;
    }
    const medium = mediumForLabel(label);
    if (medium) mediumSessions.push({ medium, records: a.session.records });
  }

  const funnels: FlowFunnel[] = flows.map((flow) => ({
    flow,
    result: computeFunnel(flow, mediumSessions),
  }));

  return {
    totalRequests: records.length,
    totalSessions: sessions.length,
    byLabel,
    agentSessionPct: sessions.length
      ? (agentSessions / sessions.length) * 100
      : 0,
    vendors,
    sessionsWithFriction,
    frictionByKind,
    analyses,
    funnels,
  };
}

// Renders a "label  count" table sorted by count desc, e.g. the byLabel,
// vendors, and frictionByKind sections below.
function pushCountTable(lines: string[], counts: Record<string, number>): void {
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${name.padEnd(16)} ${n}`);
  }
}

function formatPct(stats: { total: number; completionRate: number }): string {
  return stats.total > 0
    ? `${(stats.completionRate * 100).toFixed(0)}%`
    : "n/a";
}

function stepLabel(flow: Flow, stepIndex: number): string {
  const step = flow.steps[stepIndex];
  return step.method ? `${step.method.toUpperCase()} ${step.path}` : step.path;
}

function pushFunnelLines(lines: string[], funnels: FlowFunnel[]): void {
  for (const { flow, result: f } of funnels) {
    const agentPct = formatPct(f.agent);
    const humanPct = formatPct(f.human);
    let line = `  ${f.flow}: agents ${agentPct} vs humans ${humanPct}`;
    if (f.parityGapStep !== null) {
      line += ` — agents fall behind at step ${f.parityGapStep + 1} (${stepLabel(flow, f.parityGapStep)})`;
    }
    lines.push(line);
  }
}

export function formatReport(r: AnalysisReport): string {
  const lines: string[] = [];
  lines.push("═══ foyer report ═══");
  lines.push(`Requests: ${r.totalRequests}   Sessions: ${r.totalSessions}`);
  lines.push(`Agent sessions: ${r.agentSessionPct.toFixed(1)}%`);
  lines.push("");
  lines.push("By label:");
  pushCountTable(lines, r.byLabel);
  if (Object.keys(r.vendors).length) {
    lines.push("");
    lines.push("Agent vendors:");
    pushCountTable(lines, r.vendors);
  }
  lines.push("");
  lines.push(`Sessions with friction: ${r.sessionsWithFriction}`);
  pushCountTable(lines, r.frictionByKind);
  if (r.funnels.length) {
    lines.push("");
    lines.push("Flows (agent vs human task success):");
    pushFunnelLines(lines, r.funnels);
  }
  return lines.join("\n");
}
