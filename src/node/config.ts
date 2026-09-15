import { readFileSync } from "node:fs";
import { parseFlowConfig } from "../config.js";
import type { Flow } from "../types.js";

// Read + parse a flow-config file (e.g. `foyer.config.json`) from disk.
export function loadFlowConfigFile(path: string): Flow[] {
  return parseFlowConfig(readFileSync(path, "utf8"));
}
