// Refreshes the local AI-bot list from the community-maintained
// ai-robots-txt project. Run: `npm run update-bots`. Writes a small
// vendored JSON so the classifier stays offline + deterministic at runtime
// (and tests never hit the network); re-run periodically to stay current.
import { updateBots } from "../src/botsUpdater.js";

const { count, path } = await updateBots();
console.log(`Wrote ${count} bots to ${path}`);
