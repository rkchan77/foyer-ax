// Public API — the package's stable contract. Anything not re-exported here
// is an internal implementation detail and may change without notice.

export { isBotUserAgent, vendorForUserAgent } from "./bots.js";
export { classify } from "./classifier.js";
export { loadFlowConfigFile, parseFlowConfig } from "./config.js";
export { computeFunnel, matchFlow } from "./flows.js";
export { detectFriction } from "./friction.js";
export type { ReportMeta } from "./html.js";
export { renderHtmlReport } from "./html.js";
export type {
  AnalysisReport,
  FlowFunnel,
  SessionAnalysis,
} from "./pipeline.js";
export { analyze, formatReport } from "./pipeline.js";
export { sessionize } from "./sessionize.js";
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
export { parseVercelLog } from "./vercel.js";
