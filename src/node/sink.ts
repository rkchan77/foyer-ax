import { appendFile } from "node:fs/promises";
import type { AgentEvent } from "../events.js";
import type { Sink } from "../sink.js";

//  Appends one JSON object per line. This is the on-disk format the CLI can
//  ingest, so the SDK and the offline pipeline meet at a file.
export function createJsonlSink(path: string): Sink {
  return {
    async write(event: AgentEvent): Promise<void> {
      await appendFile(path, `${JSON.stringify(event)}\n`);
    },
  };
}
