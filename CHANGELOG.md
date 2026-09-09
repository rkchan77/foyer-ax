# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - Unreleased

Initial public release.

- Vercel log adapter, sessionizer, human/agent classifier, and friction
  detector (retry storms, 4xx clusters, auth walls, abandonment).
- Agent-vs-human task-success funnels: define named flows (`{ name, steps }`)
  and get per-medium completion rates plus the step where agents fall behind,
  via `computeFunnel` / a `foyer.config.json` flow config.
- `foyer` CLI with `analyze <logfile> [--flows <path>]` and `update-bots`
  subcommands.
- Library entry point (`import { analyze } from "foyer-ax"`) exporting the
  adapter, engine, and presentation functions.
- Bundled build (tsup) shipping ESM + type declarations; the vendored AI-bot
  list is inlined into the build, so the classifier needs no network access
  or filesystem lookups at runtime.
