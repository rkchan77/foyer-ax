import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json";

// "[OpenAI](https://openai.com)" -> "OpenAI"; plain strings pass through.
function cleanOperator(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "Unknown";
  const m = raw.match(/\[([^\]]+)\]/);
  return (m ? m[1] : raw).trim();
}

/**
 * Refreshes the vendored AI-bot list from the community-maintained
 * ai-robots-txt project, writing `data/bots.data.json` next to wherever this
 * module is running from (the repo root in dev, the installed package root
 * once built). Shared by `scripts/update-bots.ts` (dev) and the `foyer
 * update-bots` CLI command.
 */
export async function updateBots(): Promise<{ count: number; path: string }> {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, { operator?: string }>;

  const operators: Record<string, string> = {};
  for (const [name, meta] of Object.entries(raw))
    operators[name] = cleanOperator(meta?.operator);

  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "data",
    "bots.data.json",
  );
  const data = {
    updatedAt: new Date().toISOString(),
    source: SOURCE,
    operators,
  };
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

  return { count: Object.keys(operators).length, path };
}
