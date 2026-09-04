import type { RequestRecord, Session, Classification, SessionLabel } from "./types.js";
import { isBotUserAgent } from "./bots.js";

const ASSETS_DIR = "/assets";
const NO_ASSETS_WEIGHT = 0.3;
const REGULAR_TIMING_WEIGHT = 0.35;
const AGENT_THRESHOLD = 0.5;
const DECLARED_AGENT_CONFIDENCE = 0.95;
const REGULARITY_CV_THRESHOLD = 0.1;

function hasBotUserAgent(records: RequestRecord[]): boolean {
    return records.some((r) => isBotUserAgent(r.userAgent));
}
function hasNoAssets(records: RequestRecord[]): boolean {
    return !records.some((r) => r.path.includes(ASSETS_DIR));
}
function hasMechanicalTiming(records: RequestRecord[]): boolean {
    if (records.length < 3) return false;
    const gaps: number[] = [];
    for (let i = 1; i < records.length; i++) gaps.push(records[i].timestampMs - records[i - 1].timestampMs);
    const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    if (mean <= 0) return true;
    const variance = gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
    return Math.sqrt(variance) / mean < REGULARITY_CV_THRESHOLD;
}

export function classify(session: Session): Classification {
    const { records } = session;
    if (records.length === 0) return { label: "unknown", confidence: 0, signals: [] };

    const botUa = hasBotUserAgent(records);
    const noAssets = hasNoAssets(records);
    const regularTiming = hasMechanicalTiming(records);

    const signals: string[] = [];
    if (botUa) signals.push("bot-ua");
    if (noAssets) signals.push("no-assets");
    if (regularTiming) signals.push("regular-timing");

    if (botUa) return { label: "declared-agent", confidence: DECLARED_AGENT_CONFIDENCE, signals };

    const agentScore = (noAssets ? NO_ASSETS_WEIGHT : 0) + (regularTiming ? REGULAR_TIMING_WEIGHT : 0);
    const label: SessionLabel = agentScore > AGENT_THRESHOLD ? "likely-agent" : "human";
    const confidence = label === "likely-agent" ? agentScore : 1 - agentScore;
    return { label, confidence, signals };
}
