# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-04

### Added (v0.1 Release Candidate)

- **Comprehensive commands** (polished from stubs): `init`, `add`, `install` (alias `i`), `list`, `sync`, `remove` (alias `rm`), `doctor`. Full integration with manifest/lock/registry/adapters/link-manager.
- **Performance cache (PR12)**: Content-addressable `~/.skillctl/cache/` keyed by integrity (sha256) for extracted skills + download tarball cache under `downloads/`. Reuses identical trees, skips redundant work.
- **Limited parallel fetches**: `SKILLCTL_PARALLEL` env (default 6) with concurrency limiter in RegistryManager. Used for network ops.
- **Fast-path hashing**: `getDirStatSignature` + lock-stored integrity checks before full `computeDirIntegrity` recursive SHA (only rehash on drift/force).
- **Expanded Windows CI + Coexistence matrix**:
  - Full matrix: ubuntu/macos/windows x Node 20/22.
  - Dedicated `windows-coexistence-matrix` job with 4 scenarios (none, npx-hint, python-hint, mixed).
  - Large-scale simulation (20+ skills, timing, cache validation, parallel env).
  - Junctions, links, doctor, install/sync/remove exercised on Windows.
- **npm publish dry-run job** in CI + notes for `@skillctl/cli` scoped publish.
- **Coexistence detection** enhancements surfaced in doctor + tests (`.agents/skills`, skills-lock.json, ~/.skillctl hints, npx markers).
- **Examples** in README + smoke tests in CI.
- New core `cache.ts` (get/put cached skill/download, ensure, clear, stat match helpers). Exported via `@skillctl/core`.

### Changed / Polished

- CLI: functional `install`/`sync`/`remove` (best-effort unlinks, cache fastpaths, purge option); removed "(stub)" notes; init now actually saves manifest.
- Registry: wrapped fetches with limiter; integrated cache checks/populate in materialize + per-source download caches (npm/github).
- README: complete rewrite for v0.1 — all commands, quickstart examples, config, perf/cache details, coexistence/migration warnings + strategy, prior art (Python skillctl + npx skills), Windows notes, development, release/npm publish, full test matrix.
- Version bumped to 0.1.0 across root + all workspace packages.
- CI: smoke tests, coexistence, large-scale, publish-dry-run, parallel env, Windows pwsh specifics.
- Design notes updated in comments for PR12 items (cache, parallel, Windows CI).
- Minor fixes/polish: doctor/list output, add logging, remove path handling, error resilience.

### Documentation

- Comprehensive README.md (commands + warnings + prior art + migration + examples + perf + npm).
- New CHANGELOG.md.
- CI documents the expanded matrix.
- Notes on scoped publish, dry-run, post-publish verification.

### Performance & Scale

- Cache + parallel + stat fastpath implemented per design (Issue 8).
- Validated via CI large-scale job (simulates 50-200 skills targets).
- See README "Performance Cache & Notes".

### Breaking / Migration (from pre-0.1 scaffolding)

- Versions now 0.1.0 (use exact tags).
- More commands available; previous stubs now execute.
- Canonical + cache dirs created on demand.
- Recommend re-running `doctor` after upgrade.

See [skillctl-design.md](./skillctl-design.md) for full v0.1 scope and future (plugins in 0.2+, more adapters, security scanner).

### Known / Notes for RC

- Some adapters limited to 3 (claude,cursor,opencode) + base; more via plugins later.
- npm source / github use live network (first time); cache mitigates repeats.
- Windows: copy fallback surfaced; test links.
- No `import --from-npx` yet (detect only); manual migration via add.
- For production use after RC: pin versions, review locks.

[0.1.0]: https://github.com/skillctl/skillctl/compare/... (v0.1.0 tag)
