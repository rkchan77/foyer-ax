export const Methods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

// ── Generator fixtures (Part 2) ─────────────────────────────────────

export const HUMAN_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

// One known bot UA per family; a session picks one deterministically from its ip.
export const BOT_USER_AGENTS = [
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
  "ClaudeBot/1.0 (+https://www.anthropic.com/claude-bot)",
  "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
];

export const PAGE_PATHS = ["/", "/pricing", "/features", "/blog", "/about", "/contact"];
export const ASSET_PATHS = ["/assets/app.css", "/assets/app.js", "/assets/logo.png"];