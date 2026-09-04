import type { RequestRecord, Session } from "./types.js";

const DEFAULT_GAP_MS = 30 * 60 * 1000; // 30 min of inactivity starts a new session

export function sessionize(records: RequestRecord[], gapMs = DEFAULT_GAP_MS): Session[] {
  const sorted = [...records].sort((a, b) => a.timestampMs - b.timestampMs);

  const byVisitor = new Map<string, RequestRecord[]>();
  for (const r of sorted) {
    const key = `${r.ip}|${r.userAgent}`;
    (byVisitor.get(key) ?? byVisitor.set(key, []).get(key)!).push(r);
  }

  const sessions: Session[] = [];
  for (const recs of byVisitor.values()) {
    let current: RequestRecord[] = [];
    for (const r of recs) {
      const prev = current[current.length - 1];
      if (prev && r.timestampMs - prev.timestampMs > gapMs) {
        sessions.push({ ip: current[0].ip, records: current });
        current = [];
      }
      current.push(r);
    }
    if (current.length) sessions.push({ ip: current[0].ip, records: current });
  }
  return sessions;
}
