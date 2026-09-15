// Node-only entry point ("./node"). Everything re-exported here imports a
// node:* builtin somewhere in its graph (fs, http, crypto) and therefore
// cannot run on the Vercel Edge runtime — import from "." instead for the
// pure/edge-safe core (analyze, classify, parseVercelLog, ...).

export type { MiddlewareOptions } from "./node/adapters.js";
export { ensureSessionId, foyerMiddleware } from "./node/adapters.js";
export { loadFlowConfigFile } from "./node/config.js";
export { createJsonlSink } from "./node/sink.js";
