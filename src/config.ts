import { readFileSync } from "node:fs";
import type { Flow, FlowStep } from "./types.js";

function isFlowStep(v: unknown): v is FlowStep {
  if (typeof v !== "object" || v === null) return false;
  const step = v as Record<string, unknown>;
  if (typeof step.path !== "string" || step.path.length === 0) return false;
  if (
    "method" in step &&
    step.method !== undefined &&
    typeof step.method !== "string"
  )
    return false;
  return true;
}

function isFlow(v: unknown): v is Flow {
  if (typeof v !== "object" || v === null) return false;
  const flow = v as Record<string, unknown>;
  if (typeof flow.name !== "string" || flow.name.length === 0) return false;
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) return false;
  return flow.steps.every(isFlowStep);
}

/**
 * Parse + validate a foyer flow-config document (an array of `Flow`).
 * Throws with a message naming the offending flow/step on malformed input.
 */
export function parseFlowConfig(jsonText: string): Flow[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `invalid flow config: not valid JSON (${(err as Error).message})`,
    );
  }

  if (!Array.isArray(data)) {
    throw new Error("invalid flow config: expected a JSON array of flows");
  }

  data.forEach((flow, i) => {
    if (isFlow(flow)) return;
    const name =
      typeof (flow as Record<string, unknown>)?.name === "string"
        ? (flow as { name: string }).name
        : `#${i}`;
    throw new Error(
      `invalid flow config: flow "${name}" needs a non-empty "name" and a non-empty "steps" array, each step with a non-empty "path" and an optional string "method"`,
    );
  });

  return data as Flow[];
}

/** Read + parse a flow-config file (e.g. `foyer.config.json`) from disk. */
export function loadFlowConfigFile(path: string): Flow[] {
  return parseFlowConfig(readFileSync(path, "utf8"));
}
