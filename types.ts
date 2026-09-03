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

export type LogFormat = "nginx" | "json";
