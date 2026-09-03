# agentscope — stage 1 (log parser)

## Setup
```
npm install
```

## The drill
1. Read `SPEC.md`.
2. Start a 45–60 min timer. **Editor + docs + terminal only — no AI assistant.**
3. Implement `src/parser.ts` until `npm test` is green.
   - Part 1 first (`npm run test:part1`).
   - Only then open Part 2 (`npm run test:part2`).
4. Narrate your thinking as you code.
5. When green (or when time's up), come back and I review it like a Stripe interviewer.

## Commands
- `npm test` — run everything
- `npm run test:part1` / `npm run test:part2` — one part
- `npm run test:watch` — re-run on save

## Layout
- `src/types.ts` — given types (don't change)
- `src/parser.ts` — **you implement these two functions**
- `tests/` — the spec, as failing tests
- `fixtures/` — sample logs
