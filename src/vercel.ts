import type { RequestRecord } from "./types.js";

// Vercel's log export is a JSON array of entries with its own field names.
// Notably: it carries NO client IP, timestamps are epoch ms (timestampInMs),
// and requestPath includes the host ("www.nomah.world/auth/signin").
interface VercelEntry {
  timestampInMs?: number;
  requestMethod?: string;
  requestPath?: string;
  requestQueryString?: string;
  responseStatusCode?: number;
  requestUserAgent?: string;
}

function toRecord(e: VercelEntry): RequestRecord | null {
  if (
    typeof e.timestampInMs !== "number" ||
    typeof e.requestMethod !== "string" ||
    typeof e.requestPath !== "string" ||
    typeof e.responseStatusCode !== "number"
  ) {
    return null;
  }
  // Strip the host prefix: "www.nomah.world/auth/signin" -> "/auth/signin"
  const slash = e.requestPath.indexOf("/");
  let path = slash >= 0 ? e.requestPath.slice(slash) : "/";
  if (e.requestQueryString) path += `?${e.requestQueryString}`;

  return {
    ip: "unknown", // Vercel export has no client IP
    timestampMs: e.timestampInMs,
    method: e.requestMethod,
    path,
    status: e.responseStatusCode,
    bytes: 0, // not present in this export
    referer: null, // not present in this export
    userAgent: typeof e.requestUserAgent === "string" ? e.requestUserAgent : "",
  };
}

export function parseVercelLog(jsonText: string): RequestRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: RequestRecord[] = [];
  for (const entry of data) {
    const rec = toRecord(entry as VercelEntry);
    if (rec) out.push(rec);
  }
  return out;
}
