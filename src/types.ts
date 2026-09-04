// ── Given. Do not change these types. ──────────────────────────────
// A single parsed HTTP request from an access log, normalized across
// whatever raw log format it came from.

export interface RequestRecord {
  ip: string;           // client IP, e.g. "203.0.113.5"
  timestampMs: number;  // epoch MILLISECONDS, UTC. (offsets must be resolved)
  method: string;       // "GET", "POST", ...
  path: string;         // request target incl. query string, e.g. "/api/x?q=1"
  status: number;       // HTTP status code, e.g. 200
  bytes: number;        // response size in bytes; 0 when the log field is "-"
  referer: string | null; // null when the log field is "-"
  userAgent: string;    // full UA string
}

// ── Given for stage 2 (generator). Do not change. ──────────────────
export interface SessionSpec {
  kind: "human" | "agent";
  ip: string;
  startMs: number; // epoch ms of the session's first request (whole seconds)
}

export interface GeneratedSession {
  kind: "human" | "agent";
  ip: string;
  records: RequestRecord[];
}

export interface GeneratedLog {
  records: RequestRecord[]; // every session's records, in generation order
  labels: { ip: string; kind: "human" | "agent" }[]; // ground truth, one per session
}

// ── Given for stage 3 (classifier). Do not change. ─────────────────
export type SessionLabel = "human" | "likely-agent" | "declared-agent" | "unknown";

export interface Classification {
  label: SessionLabel;
  confidence: number; // 0..1 — how sure we are of `label`
  signals: string[];  // human-readable reasons that fired, e.g. "bot-ua", "no-assets"
}

// A session to classify: the records for one visitor (shared ip), time-ordered.
export interface Session {
  ip: string;
  records: RequestRecord[];
}

// ── Given for stage 4 (friction). Do not change. ───────────────────
export interface FrictionFinding {
  kind: "retry-storm" | "4xx-cluster" | "auth-wall" | "abandonment";
  detail: string;   // human-readable, e.g. "3x POST /api/checkout -> 422"
  path?: string;    // the endpoint most implicated, when there is one
}

export interface FrictionReport {
  findings: FrictionFinding[];
  hadFriction: boolean; // true iff findings.length > 0
}
