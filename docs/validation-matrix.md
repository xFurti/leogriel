# Leogriel 1.0 validation matrix

This is the evidence checklist for `1.0.0-rc.1` and stable. A checked implementation item is not equivalent to a completed external validation.

## Current evidence

| Area | Evidence in the current repository | Status |
|---|---|---|
| Standard build/type/test | Windows local gates and cross-platform CI definition for Node 22.13/24 | Implemented; rerun required after final commits |
| Packed/npm smoke | Pre-publish tarball smoke and post-publish registry smoke on Windows, macOS, Linux | Implemented; beta.2 registry run completed |
| JSON contracts | First-party commands, subcommands, errors, invalid options, completion payload | Automated |
| Release idempotency | SRI comparison, partial-publication continuation, conflict refusal | Automated |
| Git comparison | Safe immutable materialization plus paired reference/candidate tests | Automated locally; external repository pending |
| GitHub Action | Report renderer, Job Summary, artifacts, badge data, comment upsert, fail-after-report ordering | Automated locally; hosted workflow pending |
| Codex runner | Fake-process contracts for flags, strict config, JSONL, timeout, process tree, stdin, environment, redaction | Automated; current post-change live matrix pending |
| Claude runner | Fake-process contracts for version/platform, sandbox settings, credential filtering, JSONL, stdin, redaction, failure semantics | Automated; real macOS/Linux/WSL2 runs pending |
| External repositories | None documented after the new runner/action changes | Pending |

## Mandatory RC matrix

Record the exact repository, commit, OS image, Node version, Leogriel commit/package version, runner CLI version, exact model ID, test integrity, skill integrity, result artifact, and workflow URL for every cell.

| Scenario | Ubuntu | macOS | Windows |
|---|---:|---:|---:|
| Standard gates, Node 22.13 | Required | Required | Required |
| Standard gates, Node 24 | Required | Required | Required |
| Codex live smoke, network deny | Required | Required | Required |
| Claude live smoke, network deny | Required | Required | Not supported; fail-closed detection required |
| Git comparison on an external repository | Required | At least one of macOS/Windows | At least one of macOS/Windows |
| Official Action with JSON/Markdown/HTML artifact | Required | Optional | Optional |
| Pull-request comment update | Required once on a controlled repository | Optional | Optional |
| Packed tarball smoke | Required | Required | Required |
| Post-publish npm smoke | Required | Required | Required |

At least two external repositories must be used:

1. one small fixture-style Agent Skill repository;
2. one real repository not maintained as part of Leogriel.

Mixed results, unavailable runner features, unpinned models, missing final events, timeouts, or incomplete reports do not satisfy a cell.

## Stable-release gate

`1.0.0` remains blocked until:

- every mandatory RC cell has retained evidence;
- `1.0.0-rc.1` has been used in external repositories;
- both runners have successful real paired runs;
- public-contract and migration docs match the shipped package;
- no unresolved severity-error audit finding exists;
- release rerun behavior has been exercised after a controlled partial publication;
- RC feedback has no unresolved compatibility blocker.

Fixes may ship as additional beta or RC builds. The project does not skip directly from the current beta to stable.
