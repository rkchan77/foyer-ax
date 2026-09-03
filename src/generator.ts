import type { RequestRecord, SessionSpec, GeneratedSession, GeneratedLog } from "./types.js";
import { HUMAN_USER_AGENT, BOT_USER_AGENTS, PAGE_PATHS, ASSET_PATHS } from "./constants.js";

const SECOND_MS = 1000;

// Shared defaults so each call site only spells out what makes it distinct.
function makeRecord(
  fields: Pick<RequestRecord, "ip" | "timestampMs" | "path" | "userAgent"> &
    Partial<RequestRecord>
): RequestRecord {
  return {
    method: "GET",
    status: 200,
    bytes: 4096,
    referer: null,
    ...fields,
  };
}

// A session's bot family is picked from its ip so the same ip always renders
// the same UA (deterministic, no Date.now()/Math.random() involved).
function pickBotUserAgent(ip: string): string {
  const hash = [...ip].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return BOT_USER_AGENTS[hash % BOT_USER_AGENTS.length];
}

function generateHumanSession(spec: SessionSpec): GeneratedSession {
  const { ip, startMs } = spec;
  const records: RequestRecord[] = [];
  let clock = startMs;
  let previousPage: string | null = null;

  const pagesVisited = PAGE_PATHS.slice(0, 3);

  pagesVisited.forEach((page, i) => {
    if (i > 0) {
      // "thinking time" between page loads — irregular, growing gaps, unlike
      // an agent's tight fixed interval.
      clock += (10 + i * 9) * SECOND_MS;
    }
    records.push(
      makeRecord({
        ip,
        timestampMs: clock,
        path: page,
        userAgent: HUMAN_USER_AGENT,
        bytes: 8192,
        referer: previousPage && `https://example.com${previousPage}`,
      })
    );

    // The browser immediately fetches the page's assets, each a beat apart.
    for (const [j, asset] of ASSET_PATHS.entries()) {
      clock += (1 + j) * SECOND_MS;
      records.push(
        makeRecord({
          ip,
          timestampMs: clock,
          path: asset,
          userAgent: HUMAN_USER_AGENT,
          bytes: 2048,
          referer: `https://example.com${page}`,
        })
      );
    }

    previousPage = page;
  });

  return { kind: "human", ip, records };
}

function generateAgentSession(spec: SessionSpec): GeneratedSession {
  const { ip, startMs } = spec;
  const userAgent = pickBotUserAgent(ip);
  const CRAWL_INTERVAL_MS = 2 * SECOND_MS; // tight, regular spacing

  const records = PAGE_PATHS.map((page, i) =>
    makeRecord({
      ip,
      timestampMs: startMs + i * CRAWL_INTERVAL_MS,
      path: page,
      userAgent,
      bytes: 16384, // bots fetch raw HTML only, no assets
    })
  );

  return { kind: "agent", ip, records };
}

/**
 * PART 1 — Render a RequestRecord back into ONE nginx combined-log line.
 * This is the exact inverse of parseNginxLine. The output must parse back
 * to an equal record (round-trip). Details that matter:
 *   - timestamp formatted as [DD/Mon/YYYY:HH:MM:SS +0000] in UTC
 *   - the two unused fields render as: - -
 *   - request renders as: "METHOD PATH HTTP/1.1"
 *   - bytes === 0 renders as "-"      (parser maps "-" -> 0)
 *   - referer === null renders as "-" (parser maps "-" -> null)
 *   - referer and userAgent are wrapped in double quotes
 */
export function renderNginxLine(r: RequestRecord): string {
    const date = new Date(r.timestampMs);

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const pad = (n: number) => String(n).padStart(2, "0");

    const timestamp =
        `${pad(date.getUTCDate())}/` +
        `${months[date.getUTCMonth()]}/` +
        `${date.getUTCFullYear()}:` +
        `${pad(date.getUTCHours())}:` +
        `${pad(date.getUTCMinutes())}:` +
        `${pad(date.getUTCSeconds())} +0000`;

    return `${r.ip} - - [${timestamp}] "${r.method} ${r.path} HTTP/1.1" ${r.status} ${r.bytes === 0 ? "-" : r.bytes} "${r.referer === null ? "-" : r.referer}" "${r.userAgent}"`;
}

/**
 * PART 2 — Generate one labeled SESSION: a visitor's ordered request
 * sequence. Human vs agent must differ in ways a classifier can key on:
 *   - human: a browser (Mozilla/...) user-agent, and loads page assets
 *            (paths under /assets/), with human-ish spacing
 *   - agent: a known bot UA (e.g. GPTBot/ClaudeBot/PerplexityBot), visits
 *            pages only (NO /assets/ requests), tightly/regularly spaced
 * All records in a session share the session's ip; timestamps only ever
 * increase. Keep timestamps on whole seconds so they round-trip.
 */
export function generateSession(spec: SessionSpec): GeneratedSession {
  return spec.kind === "human" ? generateHumanSession(spec) : generateAgentSession(spec);
}

/**
 * PART 2 — Generate a whole labeled log from many session specs:
 *   - render every session's records to nginx lines, joined by "\n"
 *   - return one ground-truth label { ip, kind } per session, in order
 */
export function generateLog(specs: SessionSpec[]): GeneratedLog {
  const sessions = specs.map(generateSession);

  const logText = sessions
    .flatMap((session) => session.records.map(renderNginxLine))
    .join("\n");

  const labels = sessions.map(({ ip, kind }) => ({ ip, kind }));

  return { logText, labels };
}