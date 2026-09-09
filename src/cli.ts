#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };
import { updateBots } from "./botsUpdater.js";
import { loadFlowConfigFile } from "./config.js";
import { analyze, formatReport } from "./pipeline.js";
import { parseVercelLog } from "./vercel.js";

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
  .action((logfile: string, options: { flows?: string }) => {
    const records = parseVercelLog(readFileSync(logfile, "utf8"));
    const flows = options.flows ? loadFlowConfigFile(options.flows) : [];
    console.log(formatReport(analyze(records, flows)));
  });

cli
  .command("update-bots", "Refresh the vendored AI-bot list from ai-robots-txt")
  .action(async () => {
    const { count, path } = await updateBots();
    console.log(`Wrote ${count} bots to ${path}`);
  });

cli.help();
cli.version(pkg.version);

cli.parse();
