# AgentScope

Agent-traffic analytics for web logs — "PostHog for AI agents." AgentScope
ingests Vercel log exports, groups requests into sessions, classifies each
session as human vs. AI-agent (with a confidence score and the signals that
fired), detects agent friction (retry storms, 4xx clusters, auth walls,
abandonment), and reports what fraction of your traffic is agents, which
vendors, and where they got stuck. The lens is agent task-success, not human
engagement.

## Architecture

```
Vercel log export   →   RequestRecord[]   →   engine                         →   presentation
(src/vercel.ts)                               sessionize → classify → friction    report / CLI
```

- **Ingestion** (`src/vercel.ts`) turns a Vercel log export into the shared
  `RequestRecord[]` shape. Format-specific quirks (field names, timestamp
  encoding, the host embedded in the request path) are resolved here and
  nowhere else.
- **The engine** (`sessionize` → `classify` → `detectFriction`, wired
  together by `analyze()`) only ever sees `RequestRecord[]`. It doesn't know
  or care that the data came from Vercel — see "Adding another log source"
  below.
- **Presentation** (`formatReport`, the CLI) turns the engine's output into
  something a person reads.

### Files

| File | Layer | Responsibility |
| --- | --- | --- |
| `src/types.ts` | shared | `RequestRecord`, `Session`, `Classification`, `FrictionReport`, etc. |
| `src/vercel.ts` | ingestion | Vercel's log export (no client IP; host embedded in the request path) |
| `src/sessionize.ts` | engine | groups records into sessions by `ip\|userAgent`, 30-min inactivity gap (degrades to UA-only when IP is absent, e.g. Vercel) |
| `src/classifier.ts` | engine | weighted-signal human/agent classifier (bot-UA short-circuits to `declared-agent`; no single other signal is enough on its own) |
| `src/bots.ts` | engine | known-bot lookup (`isBotUserAgent`, `vendorForUserAgent`), backed by `data/bots.data.json` |
| `src/friction.ts` | engine | the four friction detectors |
| `src/pipeline.ts` | engine + presentation | `analyze()` composes the engine stages into a report; `formatReport()` renders it |
| `src/generator.ts` | test support | synthetic labeled human/agent traffic used as test fixtures |
| `data/bots.data.json` | data | vendored bot-list snapshot (see below) |
| `scripts/analyze.ts` | presentation | the CLI |
| `scripts/update-bots.ts` | data | refreshes `data/bots.data.json` from the community [ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) list |

### The bot list

`src/bots.ts` reads known AI-bot user agents + their operators from
`data/bots.data.json`, a small vendored snapshot of the community-maintained
[ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) project. It's
committed to the repo so the classifier stays offline and deterministic (and
tests never hit the network). Refresh it with:

```
npm run update-bots
```

Anything not (yet) in the community list can be added by hand in the
`CUSTOM_BOTS` map at the top of `src/bots.ts` — it's merged in on top of the
fetched list, so a manual addition survives the next `update-bots` run.

## Running it

```
npm install
npm test              # full suite
npm run test:watch    # re-run on save
npm run typecheck     # strict tsc --noEmit

npm run analyze -- <vercel-log-export.json>
```

Example:

```
npm run analyze -- fixtures/nomah-log.json
```

## Adding another log source

The engine only depends on `RequestRecord[]`, so plugging in a new source
(e.g. Cloudflare) means:

1. Write a function that turns the raw export into `RequestRecord[]` (see
   `src/vercel.ts` for a minimal example). Every field on `RequestRecord`
   must be populated — use `"unknown"`, `0`, or `null` for whatever the
   source doesn't carry, matching how `vercel.ts` handles a missing client
   IP.
2. Point `scripts/analyze.ts` at it (or add a format flag, once there's more
   than one source worth branching on).
3. Nothing downstream (`sessionize`, `classify`, `detectFriction`) needs to
   change — that's the point of keeping ingestion separate from the engine.

## Fixtures

`fixtures/nomah-log.json` is a real (small) Vercel log export from the
author's own site, used by the CLI example and as an end-to-end test case.

## License

[MIT](./LICENSE)
