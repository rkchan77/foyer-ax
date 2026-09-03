# Stage 1 — Log Parser  (target: 45–60 min, timed, no AI)

You're building the ingestion layer of an agent-traffic analyzer. Everything
downstream (sessionizing, classifying agents, detecting friction) reads the
`RequestRecord[]` you produce here. Get this shape right and clean and the rest
of the MVP has a solid floor.

## Task

Implement the two functions in `src/parser.ts` so the whole test suite passes:

- `parseLine(line, format): RequestRecord | null`
- `parse(content, format): RequestRecord[]`

`RequestRecord` and `LogFormat` are given in `src/types.ts` — do not change them.

## Part 1 — nginx  (do this first)

Parse the **combined log format**. One sample line:

```
203.0.113.5 - - [01/Sep/2026:13:55:36 +0000] "GET /pricing HTTP/1.1" 200 5324 "https://example.com/" "Mozilla/5.0 ... Safari/537.36"
```

Requirements the tests pin down:
- `timestampMs` is epoch **milliseconds, UTC** — you must resolve the `+0000` /
  `-0700` offset, not ignore it.
- The request target can contain spaces (`/search?q=hello world`). Parse method
  and path without assuming a naive space-split.
- A `-` in the bytes field means `0`. A `-` in the referer field means `null`.
- Blank lines and unparseable ("malformed") lines are **skipped**, never thrown on.

Run just this part:  `npm run test:part1`

## Part 2 — JSON lines  (⚠ open ONLY after Part 1 is fully green)

`tests/parser.part2.test.ts` carries a new requirement. Don't read it until Part 1
passes — part of this drill is handling a requirement that arrives *after* you've
committed to a design. When you're ready:  `npm run test:part2`, then `npm test`.

## How you're being scored (Stripe-style)

- Readable, maintainable code: descriptive names, small helpers, clear seams.
- Clean abstraction: Part 2 should slot in without rewriting Part 1.
- Edge-case handling and "never throw on junk input."
- Talk through your reasoning out loud as you go (yes, even alone).

Speed is not the metric — a well-structured solution that a stranger could extend is.
