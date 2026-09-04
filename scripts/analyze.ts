import { readFileSync } from "node:fs";
import { parseVercelLog } from "../src/vercel.js";
import { analyze, formatReport } from "../src/pipeline.js";

const path = process.argv[2];

if (!path) {
  console.error("usage: tsx scripts/analyze.ts <vercel-log-export.json>");
  process.exit(1);
}

const text = readFileSync(path, "utf8");
const records = parseVercelLog(text);

console.log(formatReport(analyze(records)));
