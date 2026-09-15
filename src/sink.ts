import type { AgentEvent } from "./events.js";

// Where captured events go. Kept behind an interface so the capture path
// doesn't care whether events are buffered, written to disk, or shipped to an
// ingest endpoint.

export interface Sink {
  write(event: AgentEvent): void | Promise<void>;
}

// Buffers events in memory. Useful for tests and short-lived jobs.
export class MemorySink implements Sink {
  readonly events: AgentEvent[] = [];
  write(event: AgentEvent): void {
    this.events.push(event);
  }
  drain(): AgentEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

// Fans one event out to several sinks; a failing sink never blocks the rest.
export function multiSink(...sinks: Sink[]): Sink {
  return {
    async write(event: AgentEvent): Promise<void> {
      await Promise.allSettled(sinks.map((s) => s.write(event)));
    },
  };
}
