#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };
import { updateBots } from "./botsUpdater.js";
import { loadFlowConfigFile } from "./config.js";
import { renderHtmlReport } from "./html.js";
import { analyze, formatReport } from "./pipeline.js";
import type { RequestRecord } from "./types.js";
import { parseVercelLog } from "./vercel.js";

// Rough analysis window from the record timestamps, e.g. "24h" / "3d".
function deriveWindow(records: RequestRecord[]): string {
  if (records.length === 0) return "—";
  let min = Infinity;
  let max = -Infinity;
  for (const r of records) {
    if (r.timestampMs < min) min = r.timestampMs;
    if (r.timestampMs > max) max = r.timestampMs;
  }
  const hours = (max - min) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round((max - min) / 60_000))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// Prints a clean one-line message instead of letting a raw exception (with
// its Node stack trace) reach the terminal.
function fail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

const cli = cac("foyer");

cli
  .command(
    "analyze <logfile>",
    "Analyze a Vercel log export for agent traffic and task-success funnels",
  )
  .option(
    "--flows <path>",
    "Path to a flow-config JSON file (see examples/foyer.config.json)",
  )
  .option("--html <path>", "Write an HTML report to <path> instead of stdout")
  .option(
    "--source <name>",
    "Source label shown in the report header (defaults to the log filename)",
  )
  .action(
    (
      logfile: string,
      options: { flows?: string; html?: string; source?: string },
    ) => {
      try {
        const records = parseVercelLog(readFileSync(logfile, "utf8"));
        const flows = options.flows ? loadFlowConfigFile(options.flows) : [];
        const report = analyze(records, flows);

        if (options.html) {
          const html = renderHtmlReport(report, {
            source: options.source ?? basename(logfile),
            adapter: "vercel",
            window: deriveWindow(records),
            version: pkg.version,
          });
          try {
            writeFileSync(options.html, html);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "EISDIR") {
              throw new Error(
                `--html expects a file path, but "${options.html}" is a directory. Try e.g. --html ${options.html}/report.html`,
              );
            }
            throw err;
          }
          console.log(`Wrote HTML report to ${options.html}`);
          return;
        }

        console.log(formatReport(report));
      } catch (err) {
        fail(err);
      }
    },
  );

cli
  .command("update-bots", "Refresh the vendored AI-bot list from ai-robots-txt")
  .action(async () => {
    try {
      const { count, path } = await updateBots();
      console.log(`Wrote ${count} bots to ${path}`);
    } catch (err) {
      fail(err);
    }
  });

cli.help();
cli.version(pkg.version);

cli.parse();
