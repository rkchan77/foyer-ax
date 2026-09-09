# foyer

[![npm](https://img.shields.io/npm/v/foyer-ax)](https://www.npmjs.com/package/foyer-ax)
[![CI](https://github.com/rkchan77/foyer-ax/actions/workflows/ci.yml/badge.svg)](https://github.com/rkchan77/foyer-ax/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/foyer-ax)](./LICENSE)

**Agent-experience analytics for web logs - PostHog for the agent medium.**

Your analytics stack was built to watch humans click around a page. It has
no idea what to do with an AI agent that never renders anything, never fires
a pageview event, and either completes its task in three requests or gets
stuck forever. foyer ingests a **Vercel** log export, sessionizes the raw
requests, classifies each session human vs. AI-agent (with a confidence
score and the signals that fired), detects agent-shaped friction (retry
storms, 4xx clusters, auth walls, abandonment), and computes **agent-vs-human
task-success funnels** for the flows you care about - checkout, signup,
search, whatever a "task" means for your product. The lens is agent task
*success*, not human engagement.

## Install

```
npx foyer-ax analyze <vercel-log-export.json>
```

or install it:

```
npm install -g foyer-ax
```

## CLI usage

```
foyer analyze <logfile> [--flows <path>]
foyer update-bots
foyer --help
foyer --version
```

- `analyze <logfile>` - parse a Vercel log export, sessionize, classify, detect
  friction, and (if `--flows` is given) compute a task-success funnel for each
  configured flow.
- `--flows <path>` - path to a flow-config JSON file (see [Flow config](#flow-config) below).
- `update-bots` - refresh the vendored AI-bot list from the community
  [ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) project.

```
foyer analyze examples/sample-vercel.json --flows examples/foyer.config.json
```

## Library usage

```ts
import { analyze, formatReport, parseVercelLog } from "foyer-ax";
import { readFileSync } from "node:fs";

const records = parseVercelLog(readFileSync("vercel-log-export.json", "utf8"));
const flows = [
  { name: "checkout", steps: [{ path: "/cart" }, { path: "/checkout" }, { method: "POST", path: "/api/order" }] },
];

const report = analyze(records, flows);
console.log(formatReport(report));
// or use `report` directly - byLabel, vendors, frictionByKind, funnels, ...
```

## Flow config

A flow is a named sequence of steps an agent or human is expected to move
through in order (gaps are allowed - other requests in between don't break
the match, but the steps must appear in order). Define flows as a JSON array,
either in `foyer.config.json` (auto-detected) or any file passed via
`--flows`:

```json
[
  {
    "name": "checkout",
    "steps": [
      { "path": "/cart" },
      { "path": "/checkout" },
      { "method": "POST", "path": "/api/order" }
    ]
  }
]
```

- `path` - exact match (query string ignored), or a trailing wildcard like
  `"/product/*"`.
- `method` - optional; omit to match any method.

See [`examples/foyer.config.json`](./examples/foyer.config.json) for a
checkout/signup/search starter set.

## Example output

Running `foyer analyze examples/sample-vercel.json --flows examples/foyer.config.json`
against the bundled example fixture (a mix of human and agent sessions moving
through a checkout flow):

```
═══ foyer report ═══
Requests: 72   Sessions: 13
Agent sessions: 53.8%

By label:
  human            6
  declared-agent   6
  likely-agent     1

Agent vendors:
  OpenAI           1
  Anthropic        1
  Perplexity       1
  Amazon           1
  Common Crawl Foundation 1
  ByteDance        1
  Other/Unknown    1

Sessions with friction: 2
  abandonment      2
  retry-storm      1
  4xx-cluster      1
  auth-wall        1

Flows (agent vs human task success):
  checkout: agents 14% vs humans 83% - agents fall behind at step 3 (POST /api/order)
  signup: agents 0% vs humans 0%
  search: agents 0% vs humans 0%
```

The `checkout` line is the headline: agents reach the cart and checkout pages
about as often as humans do, but almost none of them complete the order -
they fall behind exactly at the `POST /api/order` step, which is where you'd
look first if you wanted agents to be able to complete a purchase on your
site.

## Architecture

```
Vercel log export   →   RequestRecord[]   →   engine                                    →   presentation
(src/vercel.ts)                               sessionize → classify → friction → funnel      report / CLI
```

- **Ingestion** (`src/vercel.ts`) turns a Vercel log export into the shared
  `RequestRecord[]` shape. Format-specific quirks (field names, timestamp
  encoding, the host embedded in the request path) are resolved here and
  nowhere else.
- **The engine** (`sessionize` → `classify` → `detectFriction` →
  `computeFunnel`, wired together by `analyze()`) only ever sees
  `RequestRecord[]`. It doesn't know or care that the data came from Vercel -
  see "Adding another log source" below.
- **Presentation** (`formatReport`, the CLI) turns the engine's output into
  something a person reads.

### Files

| File | Layer | Responsibility |
| --- | --- | --- |
| `src/types.ts` | shared | `RequestRecord`, `Session`, `Classification`, `FrictionReport`, `Flow`, `FunnelResult`, etc. |
| `src/vercel.ts` | ingestion | Vercel's log export (no client IP; host embedded in the request path) |
| `src/sessionize.ts` | engine | groups records into sessions by `ip\|userAgent`, 30-min inactivity gap (degrades to UA-only when IP is absent, e.g. Vercel) |
| `src/classifier.ts` | engine | weighted-signal human/agent classifier (bot-UA short-circuits to `declared-agent`; no single other signal is enough on its own) |
| `src/bots.ts` | engine | known-bot lookup (`isBotUserAgent`, `vendorForUserAgent`), backed by `data/bots.data.json` |
| `src/friction.ts` | engine | the four friction detectors |
| `src/flows.ts` | engine | `matchFlow` (in-order subsequence match) and `computeFunnel` (agent-vs-human completion + parity-gap step) |
| `src/config.ts` | engine | loads + validates a flow-config JSON document |
| `src/pipeline.ts` | engine + presentation | `analyze()` composes the engine stages into a report; `formatReport()` renders it |
| `src/index.ts` | public API | the package's stable exports - see below |
| `src/cli.ts` | presentation | the `foyer` CLI (`analyze`, `update-bots`) |
| `src/botsUpdater.ts` | data | refreshes `data/bots.data.json` from the community [ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) list; shared by `update-bots` (dev script) and `foyer update-bots` (CLI) |
| `data/bots.data.json` | data | vendored bot-list snapshot (see below) |

### Public API

`foyer-ax` exports: `analyze`, `formatReport`, `parseVercelLog`, `sessionize`,
`classify`, `detectFriction`, `matchFlow`, `computeFunnel`, `isBotUserAgent`,
`vendorForUserAgent`, `parseFlowConfig`, `loadFlowConfigFile`, and their
associated types (`RequestRecord`, `Session`, `Classification`, `Flow`,
`FunnelResult`, `AnalysisReport`, ...). Anything not re-exported from
`src/index.ts` is an internal implementation detail and may change without
notice.

### The bot list

`src/bots.ts` reads known AI-bot user agents + their operators from
`data/bots.data.json`, a small vendored snapshot of the community-maintained
[ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) project. It's
committed to the repo (and bundled directly into the built JS) so the
classifier stays offline and deterministic - no network calls at runtime, and
tests never hit the network. Refresh the snapshot with:

```
npm run update-bots     # or: foyer update-bots
```

Anything not (yet) in the community list can be added by hand in the
`CUSTOM_BOTS` map at the top of `src/bots.ts` - it's merged in on top of the
fetched list, so a manual addition survives the next `update-bots` run.

## Adding another log source

The engine only depends on `RequestRecord[]`, so plugging in a new source
(e.g. Cloudflare) means:

1. Write a function that turns the raw export into `RequestRecord[]` (see
   `src/vercel.ts` for a minimal example). Every field on `RequestRecord`
   must be populated - use `"unknown"`, `0`, or `null` for whatever the
   source doesn't carry, matching how `vercel.ts` handles a missing client
   IP.
2. Wire it into `src/cli.ts` (or add a format flag, once there's more than
   one source worth branching on).
3. Nothing downstream (`sessionize`, `classify`, `detectFriction`,
   `computeFunnel`) needs to change - that's the point of keeping ingestion
   separate from the engine.

## Development

```
npm install
npm test              # full suite
npm run test:watch    # re-run on save
npm run typecheck     # strict tsc --noEmit
npm run lint          # biome check
npm run build         # emit dist/ (JS + .d.ts) via tsup

npm run analyze -- <vercel-log-export.json>
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contributor workflow
and release steps.

## Fixtures & examples


- `examples/sample-vercel.json` - a synthetic log with a mix of human and
  agent sessions moving through a checkout flow, some agents stalling before
  ordering. Used in the "Example output" section above and as an end-to-end
  test fixture.
- `examples/foyer.config.json` - a starter flow config (checkout, signup,
  search).

## License

[MIT](./LICENSE)
