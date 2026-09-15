// Public API — the package's stable contract. Anything not re-exported here
// is an internal implementation detail and may change without notice.
//
// This is the pure/edge-safe entry point: every module reachable from here is
// free of node:* imports and browser globals, so it can run on the Vercel
// Edge runtime. Node-only functionality (file/network I/O, node:http adapters)
// lives behind the separate "./node" entry point — see src/node.ts.

export { computeFunnel, matchFlow } from "./analyze/flows.js";
export { detectFriction } from "./analyze/friction.js";
export type { ReportMeta } from "./analyze/html.js";
export { renderHtmlReport } from "./analyze/html.js";
export type {
  AnalysisReport,
  FlowFunnel,
  SessionAnalysis,
} from "./analyze/pipeline.js";
export { analyze, formatReport } from "./analyze/pipeline.js";
export { sessionize } from "./analyze/sessionize.js";
export { parseVercelLog } from "./analyze/vercel.js";
export { isBotUserAgent, vendorForUserAgent } from "./bots.js";
export { classify } from "./capture/classifier.js";
export { parseFlowConfig } from "./config.js";
export type {
  Classification,
  Flow,
  FlowMatch,
  FlowStep,
  FrictionFinding,
  FrictionReport,
  FunnelResult,
  Medium,
  MediumSession,
  MediumStats,
  RequestRecord,
  Session,
  SessionLabel,
} from "./types.js";
