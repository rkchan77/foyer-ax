// Refreshes the local AI-bot list from the community-maintained
// ai-robots-txt project. Run: `npm run update-bots`. Writes a small
// vendored JSON so the classifier stays offline + deterministic at runtime
// (and tests never hit the network); re-run periodically to stay current.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE = "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "bots.data.json");

// "[OpenAI](https://openai.com)" -> "OpenAI"; plain strings pass through.
function cleanOperator(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "Unknown";
  const m = raw.match(/\[([^\]]+)\]/);
  return (m ? m[1] : raw).trim();
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const raw = (await res.json()) as Record<string, { operator?: string }>;

const operators: Record<string, string> = {};
for (const [name, meta] of Object.entries(raw)) operators[name] = cleanOperator(meta?.operator);

const data = { updatedAt: new Date().toISOString(), source: SOURCE, operators };
writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(`Wrote ${Object.keys(operators).length} bots to data/bots.data.json`);
