import type { RequestRecord, Session, Classification, FrictionReport } from "./types.js";
import { sessionize } from "./sessionize.js";
import { classify } from "./classifier.js";
import { detectFriction } from "./friction.js";
import { vendorForUserAgent } from "./bots.js";

export interface SessionAnalysis {
  session: Session;
  classification: Classification;
  friction: FrictionReport;
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
}

const AGENT_LABELS = new Set(["declared-agent", "likely-agent"]);

export function analyze(records: RequestRecord[]): AnalysisReport {
  const sessions = sessionize(records);
  const analyses = sessions.map((session) => ({
    session,
    classification: classify(session),
    friction: detectFriction(session),
  }));

  const byLabel: Record<string, number> = {};
  const vendors: Record<string, number> = {};
  const frictionByKind: Record<string, number> = {};
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
      for (const f of a.friction.findings) frictionByKind[f.kind] = (frictionByKind[f.kind] ?? 0) + 1;
    }
  }

  return {
    totalRequests: records.length,
    totalSessions: sessions.length,
    byLabel,
    agentSessionPct: sessions.length ? (agentSessions / sessions.length) * 100 : 0,
    vendors,
    sessionsWithFriction,
    frictionByKind,
    analyses,
  };
}

// Renders a "label  count" table sorted by count desc, e.g. the byLabel,
// vendors, and frictionByKind sections below.
function pushCountTable(lines: string[], counts: Record<string, number>): void {
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${name.padEnd(16)} ${n}`);
  }
}

export function formatReport(r: AnalysisReport): string {
  const lines: string[] = [];
  lines.push("═══ AgentScope report ═══");
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
  return lines.join("\n");
}
