# skillctl

Universal, package-manager-style CLI for managing **Agent Skills** across AI coding agents.

`skillctl` provides a single canonical store at `~/.skillctl/skills/` and automatically materializes skills (via symlinks, junctions on Windows, or copies) into the directories used by Claude Code, Cursor, OpenCode, Gemini CLI, Codex, and dozens of other agents (via the Agent Skills open standard at agentskills.io).

> **Status**: v0.1 release candidate. See [CHANGELOG.md](./CHANGELOG.md), [skillctl-design.md](./skillctl-design.md), and full test matrix in CI.

## Installation

```bash
npm install -g @skillctl/cli
# or
pnpm add -g @skillctl/cli
# or use without global
npx @skillctl/cli --help
```

After install, the `skillctl` command is available (via bin shim in the scoped package).

**Scoped package note (Key Decision #1)**: Primary package is `@skillctl/cli`. Unscoped `skillctl` on npm is left unclaimed to avoid collision with existing Python `skillctl` packages. `npm i -g @skillctl/cli` still provides the `skillctl` command UX.

## Key Decision #1: Scoped npm Publication

See Installation above + "Release & npm publish" section. Primary: `@skillctl/cli` (with `"bin": {"skillctl": ...}`).

## Quick Start & Examples

```bash
# Initialize a project manifest
skillctl init

# Add skills from multiple sources (github shorthand, npm, local, skills.sh)
skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl add ./local-skills/my-review
skillctl add skills.sh/playwright

# Full install from manifest + lock (uses performance cache)
skillctl install

# Or step-wise
skillctl add owner/repo
skillctl sync

# List, doctor (includes coexistence detection), remove
skillctl list
skillctl list --json
skillctl doctor
skillctl remove my-skill
skillctl rm my-skill --purge   # also deletes from canonical (careful)

# Environment
SKILLCTL_PARALLEL=4 skillctl install   # limit concurrency (PR12)
```

Project files (committed):
- `agent-skills.json` (like package.json)
- `agent-skills.lock` (reproducible YAML lock, like pnpm-lock.yaml)

Canonical store: `~/.skillctl/skills/<name>/SKILL.md` + optional scripts/, references/.

## Commands (v0.1)

- `init` — Create starter `agent-skills.json`
- `add <spec>` — Add from github:, npm:, skills.sh/, file:/local, shorthands. Updates manifest+lock. Resolves + materializes to canonical.
- `install` (alias `i`) — Ensure all from manifest/lock are in store (fast path via cache + lock integrity). Then optional sync.
- `list [--json]` — Show skills from lock + manifest summary.
- `sync [--dry-run]` — Materialize links (symlink/junction/copy) from canonical to all detected agent targets via adapters.
- `remove <name>` (alias `rm`) [--purge] — Remove from manifest/lock + unlink. --purge also removes canonical copy.
- `doctor [--json]` — Environment, links, config, coexistence markers (npx skills, python skillctl, .agents/skills, skills-lock.json), adapters, issues. Exit codes: warnings=1, errors=2.
- `--version` / `--help` and per-command help.

All commands respect `~/.skillctl/config.json` (defaultMode, enabled agents).

## Configuration & Environment

`~/.skillctl/config.json` (auto-created on use; editable):

```json
{
  "version": 1,
  "store": "~/.skillctl/skills",
  "defaultMode": "symlink",   // or "junction" (win), "copy"
  "agents": { "claude-code": true, "cursor": true, ... },
  "trustedSources": ["github:vercel-labs/*", "skills.sh/*"]
}
```

Env:
- `SKILLCTL_PARALLEL=4` (default 6, max 16) — limits concurrent fetches (rate limit protection + perf).
- GitHub token recommended for heavy use: `GITHUB_TOKEN=...` (used by registry for API).

## Performance Cache & Notes (PR12)

- **Content-addressable cache**: `~/.skillctl/cache/<integrity-sha>/` stores extracted skill trees keyed by sha256 integrity. Reused across installs/adds when trees match (identical content).
- **Download cache**: raw tarballs cached under `cache/downloads/` keyed by shasum/integrity/url-hash.
- **Fast path**: `stat` (mtime+size+count) + stored lock integrity before expensive full recursive SHA256 in `computeDirIntegrity`.
- **Limited parallelism**: controlled concurrency for network (github tarballs, npm).
- Targets: <150ms sync for 200 skills (SSD); validated in large-scale CI sims (20-50+ skills matrix).
- Bottlenecks: network on first fetch, Windows FS for junctions/copies. Mitigations: tarball shallow, cache, batch.

Run with `SKILLCTL_PARALLEL=2` for restricted envs. Use `doctor` for cache hints.

See design "Performance & Scale Considerations".

## Coexistence & Migration Strategy

`skillctl` **detects** (via `doctor` + `scanCoexistence`):
- `.agents/skills` (universal, used by npx skills)
- `skills-lock.json` (vercel/npx format)
- `~/.skillctl` (may overlap Python skillctl)
- Other markers

**Recommendations** (printed by doctor):
- Use `skillctl import --from-npx` (future) or manually adopt.
- Prefer `skillctl` for lock/manifest layer; let it manage targets via adapters.
- Avoid double management of same canonical.

**Warnings**:
- Name collision risk on CLI (`skillctl`) and `~/.skillctl/`.
- Install only via `@skillctl/cli`.
- On Windows: junctions preferred (no Dev Mode needed); falls back to copy with warning. Test with `doctor`.
- Project manifest wins over global for resolution.

Migration: `skillctl init` + `add` your existing; lock will record provenance. Use `remove --purge` + re-add if needed.

See full "Coexistence & Migration Strategy" + "Prior Art" in [skillctl-design.md](./skillctl-design.md).

## Prior Art & Name/Layout Collision Notice

This project acknowledges existing tools in the Agent Skills space:

- **Python `skillctl`** (direct name and `~/.skillctl/` collision): https://skillctl.xyz/ (PyPI `skillctl`), GitHub [dvlshah/skillctl](https://github.com/dvlshah/skillctl) and [r3b1s/skillctl](https://github.com/r3b1s/skillctl). Uses `~/.skillctl/repos/`, clone + symlink + manifest flows.
- **`npx skills`** (vercel-labs/skills, also antfu/skills-cli): Primary distribution mechanism today. Implements sophisticated multi-agent detection, symlink/copy logic (including Windows junctions), `skills-lock.json`, and support for 60+ agents via `.agents/skills` de-facto layout and per-agent dirs (`.claude/skills/`, `.cursor/skills/`, etc.).
- Other: `gh skill`, agent-skills-cli, skillbook, openskills, npm-agentskills.

`skillctl` (this project) is positioned as a **complementary management layer**:
- Adds declarative `agent-skills.json` + pnpm-style YAML `agent-skills.lock` for reproducibility.
- Stronger provenance, audit, plugin extensibility.
- Single canonical `~/.skillctl/skills/` source of truth (while supporting `.agents/skills` and others as *targets* via adapters).
- Does **not** aim to replace `npx skills` or Python skillctl; it detects and offers import/migration paths.

**Warning for users**: Name collision risk exists on the command line and `~/.skillctl/`. Install via the scoped package (`@skillctl/cli`) and review `doctor` output for detected prior installs.

## Windows Notes (Expanded in PR5 + PR12 CI)

- Default link mode: junction on win32 (broader compat than symlink).
- Hardening: realpath verification, ELOOP/parent checks, force copy fallback on EPERM.
- CI: full matrix on windows-latest (Node 20/22) + coexistence scenarios (none / npx-hint / python-hint / mixed) + large-scale sim.
- Recommendation: Enable Windows Developer Mode for best symlink support if desired; `config.defaultMode` override.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm -r lint

# Run CLI (local)
node packages/cli/bin/skillctl.js --help
pnpm --filter @skillctl/cli exec -- node ./bin/skillctl.js doctor

# With cache/parallel
SKILLCTL_PARALLEL=4 node packages/cli/bin/skillctl.js install
```

Monorepo: pnpm workspaces, packages/{cli,core,registry,adapters,link-manager,manifest,lockfile}.

## Release & npm publish (v0.1 RC)

- Version: packages bumped to 0.1.0 (or -rc).
- `pnpm --filter @skillctl/cli pack --dry-run` exercised in CI (publish-dry-run job).
- Real publish: after tag, from packages/cli: `npm publish --access public`.
- Notes: scoped package; bin shim tested; README + CHANGELOG updated; coexistence tested.
- Post-publish: `npx @skillctl/cli@latest --version` and global install verification.

Dry-run + matrix ensure safe v0.1.

## Full Test Matrix (PR12)

- OS: ubuntu, macos, windows-latest
- Node: 20, 22
- Coexistence scenarios (4 variants on Windows)
- Large-scale (sim 20+ skills, timing + cache)
- Functional smoke: init/add/install/sync/list/doctor/remove on every run
- Performance: parallel env, cache population checks
- Publish dry-run

See `.github/workflows/ci.yml`.

## License

MIT

## Contributing

See design doc for architecture. Issues/PRs welcome (adapters, more sources, plugin system in future).

This is the final polish PR for v0.1 release candidate.
