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

export type LogFormat = "nginx" | "json";

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
    logText: string;
    labels: { ip: string; kind: "human" | "agent" }[];
  }

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
 