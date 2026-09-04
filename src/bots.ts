import botData from "../data/bots.data.json" with { type: "json" };

// Bots not (yet) in the community list — add your own here
const CUSTOM_BOTS: Record<string, string> = {
  // "SomeNewBot": "SomeVendor",
};

const operators: Record<string, string> = {
  ...(botData?.operators ?? {}),
  ...CUSTOM_BOTS,
};

const entries = Object.entries(operators).map(([name, op]) => [name.toLowerCase(), op] as const);

export function isBotUserAgent(ua: string): boolean {
  const u = ua.toLowerCase();
  return entries.some(([name]) => u.includes(name));
}

export function vendorForUserAgent(ua: string): string {
  const u = ua.toLowerCase();
  const hit = entries.find(([name]) => u.includes(name));
  return hit ? hit[1] : "Other/Unknown";
}

export const botListSize = Object.keys(operators).length;
