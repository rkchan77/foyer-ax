import type { RequestRecord, Session, Classification, SessionLabel } from "./types.js";

/**
 * Classify one session as human / agent, with a CONFIDENCE score and the
 * list of signals that fired. Not a boolean — "how sure" is the product.
 *
 * Approach: each signal is evaluated once over the WHOLE session (these are
 * session-level questions — "did this visitor load any assets at all?" —
 * not something to re-decide per record). A self-identifying bot UA is
 * near-certain and short-circuits straight to "declared-agent", winning
 * even over a contradicting signal (e.g. it loaded assets anyway). The
 * remaining signals are weighted so that no single one of them can push a
 * session past the human threshold on its own — it takes multiple
 * agreeing signals.
 */

const BOT_UA_REGEX = /GPTBot|ClaudeBot|PerplexityBot|Googlebot|bingbot|CCBot|Bytespider/i;
const ASSETS_DIR = "/assets";

const NO_ASSETS_WEIGHT = 0.3;
const REGULAR_TIMING_WEIGHT = 0.35;
const AGENT_THRESHOLD = 0.5;

const DECLARED_AGENT_CONFIDENCE = 0.95;

// Coefficient of variation (stddev / mean) below this reads as "mechanically
// even" spacing, the kind a script produces rather than a person.
const REGULARITY_CV_THRESHOLD = 0.1;

function hasBotUserAgent(records: RequestRecord[]): boolean {
    return records.some((r) => BOT_UA_REGEX.test(r.userAgent));
}

function hasNoAssets(records: RequestRecord[]): boolean {
    return !records.some((r) => r.path.includes(ASSETS_DIR));
}

function hasMechanicalTiming(records: RequestRecord[]): boolean {
    if (records.length < 3) return false; // need >=2 gaps to judge regularity

    const gaps: number[] = [];
    for (let i = 1; i < records.length; i++) {
        gaps.push(records[i].timestampMs - records[i - 1].timestampMs);
    }

    const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    if (mean <= 0) return true; // every request landed at the same instant

    const variance = gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;

    return coefficientOfVariation < REGULARITY_CV_THRESHOLD;
}

export function classify(session: Session): Classification {
    const { records } = session;

    if (records.length === 0) {
        return { label: "unknown", confidence: 0, signals: [] };
    }

    const botUa = hasBotUserAgent(records);
    const noAssets = hasNoAssets(records);
    const regularTiming = hasMechanicalTiming(records);

    const signals: string[] = [];
    if (botUa) signals.push("bot-ua");
    if (noAssets) signals.push("no-assets");
    if (regularTiming) signals.push("regular-timing");

    if (botUa) {
        return { label: "declared-agent", confidence: DECLARED_AGENT_CONFIDENCE, signals };
    }

    const agentScore =
        (noAssets ? NO_ASSETS_WEIGHT : 0) + (regularTiming ? REGULAR_TIMING_WEIGHT : 0);

    const label: SessionLabel = agentScore > AGENT_THRESHOLD ? "likely-agent" : "human";
    const confidence = label === "likely-agent" ? agentScore : 1 - agentScore;

    return { label, confidence, signals };
}
 