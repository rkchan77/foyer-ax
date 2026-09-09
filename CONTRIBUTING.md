# Contributing

## Setup

```
npm install
npm test
```

## Workflow

- `npm test` - full vitest suite; keep it green.
- `npm run typecheck` - strict `tsc --noEmit`.
- `npm run lint` - Biome (lint + format check).
- `npm run build` - emits `dist/` (ESM + `.d.ts`) via tsup.

Run `npm test`, `npm run typecheck`, and `npm run lint` before opening a PR.
CI (`.github/workflows/ci.yml`) runs typecheck, test, and build on Node 20.

## Architecture

Keep the adapter → engine → presentation separation described in the
[README](./README.md#architecture) intact:

- Ingestion (`src/vercel.ts`) is the only place that knows about Vercel's log
  format. A new log source gets its own adapter that outputs `RequestRecord[]`
  - nothing downstream should need to change.
- The engine (`sessionize`, `classify`, `detectFriction`, `computeFunnel`)
  only ever sees `RequestRecord[]` / `Session[]`. Classifier weights, friction
  thresholds, and funnel math are intentionally tuned values - changing them
  is a product decision, not a refactor, so open an issue first if you think
  one needs to move.
- `src/index.ts` is the public API surface. Anything not re-exported there is
  an internal implementation detail; feel free to change it without a major
  version bump.

## Updating the bot list

```
npm run update-bots
```

Refreshes `data/bots.data.json` from the community
[ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) list. It's
committed to the repo (and bundled directly into `dist/`), so re-run this and
commit the diff periodically rather than relying on it at runtime. Anything
not yet in the upstream list can be added by hand in `CUSTOM_BOTS` at the top
of `src/bots.ts`.

## Releasing (maintainers)

Publishing is manual - nothing in CI publishes automatically.

1. Make sure `main` is green: `npm run typecheck && npm test && npm run lint && npm run build`.
2. Bump the version (this also runs `prepublishOnly`, which repeats
   typecheck/test/build):
   ```
   npm version <patch|minor|major>
   ```
3. Push the commit and tag:
   ```
   git push && git push --tags
   ```
4. Publish:
   ```
   npm publish --access public
   ```
5. Update [CHANGELOG.md](./CHANGELOG.md) with the released version's notes if
   you haven't already.

Sanity-check what will actually ship before publishing:

```
npm pack --dry-run   # or `npm pack` and inspect the tarball directly
```

The tarball should contain `dist/` (with `.d.ts` files and the bundled bot
data), `README.md`, and `LICENSE` - not `src/`, `tests/`, or `examples/`.
