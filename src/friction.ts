import type { RequestRecord, Session, FrictionFinding, FrictionReport } from "./types.js";

/**
 * Detect agent-friction signals over one session's request trace.
 * There's no "rage click" for agents — the signals are HTTP-shaped.
 * Return every finding you detect; hadFriction is just findings.length > 0.
 *
 * Detects these four kinds:
 *  - "retry-storm"  : the SAME path hit 3+ times in a row (agent hammering
 *                     one endpoint). Reports the path + how many times.
 *  - "4xx-cluster"  : 3+ client-error (400–499) responses anywhere in the
 *                     session (agent guessing your schema wrong).
 *  - "auth-wall"    : 2+ auth failures (401/403) anywhere in the session.
 *  - "abandonment"  : the session's LAST request was an error (status >= 400)
 *                     — it ended on a failure, not a success.
 */

const RETRY_STORM_THRESHOLD = 3;
const CLUSTER_4XX_THRESHOLD = 3;
const AUTH_WALL_THRESHOLD = 2;

function isClientError(status: number): boolean {
  return status >= 400 && status < 500;
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function isError(status: number): boolean {
  return status >= 400;
}

interface RetryStorm {
  found: boolean;
  path: string;
  method: string;
  count: number;
}

// Longest run of consecutive requests to the same path.
function findRetryStorm(records: RequestRecord[]): RetryStorm {
  let runStartIdx = 0;
  let longestRun = 1;
  let longestRunRecord = records[0];

  for (let i = 1; i < records.length; i++) {
    if (records[i].path !== records[i - 1].path) {
      runStartIdx = i;
      continue;
    }
    const runLength = i - runStartIdx + 1;
    if (runLength > longestRun) {
      longestRun = runLength;
      longestRunRecord = records[i];
    }
  }

  return {
    found: longestRun >= RETRY_STORM_THRESHOLD,
    path: longestRunRecord.path,
    method: longestRunRecord.method,
    count: longestRun,
  };
}

interface StatusMatch {
  count: number;
  worst?: RequestRecord;
}

// How many records match anywhere in the session, plus the highest-status
// (most severe) one to use as the representative example in the detail.
function countMatching(records: RequestRecord[], matches: (status: number) => boolean): StatusMatch {
  const hits = records.filter((r) => matches(r.status));
  const worst = hits.reduce<RequestRecord | undefined>(
    (max, r) => (!max || r.status > max.status ? r : max),
    undefined
  );
  return { count: hits.length, worst };
}

export function detectFriction(session: Session): FrictionReport {
  const { records } = session;
  if (records.length === 0) {
    return { findings: [], hadFriction: false };
  }

  const findings: FrictionFinding[] = [];

  const retryStorm = findRetryStorm(records);
  if (retryStorm.found) {
    findings.push({
      kind: "retry-storm",
      detail: `${retryStorm.count}× ${retryStorm.method} ${retryStorm.path}`,
      path: retryStorm.path,
    });
  }

  const cluster4xx = countMatching(records, isClientError);
  if (cluster4xx.count >= CLUSTER_4XX_THRESHOLD && cluster4xx.worst) {
    findings.push({
      kind: "4xx-cluster",
      detail: `${cluster4xx.count}× 4xx, worst was ${cluster4xx.worst.status} ${cluster4xx.worst.method} ${cluster4xx.worst.path}`,
      path: cluster4xx.worst.path,
    });
  }

  const authWall = countMatching(records, isAuthFailure);
  if (authWall.count >= AUTH_WALL_THRESHOLD && authWall.worst) {
    findings.push({
      kind: "auth-wall",
      detail: `${authWall.count}× auth failure (${authWall.worst.status} ${authWall.worst.method} ${authWall.worst.path})`,
      path: authWall.worst.path,
    });
  }

  const lastRecord = records[records.length - 1];
  if (isError(lastRecord.status)) {
    findings.push({
      kind: "abandonment",
      detail: `session ended on ${lastRecord.status} ${lastRecord.method} ${lastRecord.path}`,
      path: lastRecord.path,
    });
  }

  return { findings, hadFriction: findings.length > 0 };
}
