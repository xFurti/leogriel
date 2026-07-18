# Workflows

## New project

```bash
leogriel init --with-skill
leogriel add <specifier>
leogriel install
git add agent-skills.json agent-skills.lock .leogriel/skills
```

Or use `leogriel init` without the meta-skill.

## Existing skills in agent folders

```bash
leogriel import --dry-run
leogriel import --select
# or import everything after reviewing the plan
leogriel import
```

Plain import discovers enabled agent directories, deduplicates identical content, and copies selected skills into `.leogriel/skills/`. Same-name content conflicts require `--interactive` or abort without changing project state.

## Team member clone

```bash
git clone <repo> && cd <repo>
leogriel install --frozen
leogriel sync --project
```

Remote entries are restored from immutable lock resolutions. Local/imported entries are restored from the committed `.leogriel/skills/<name>` content.

## Personal/global skills

```bash
leogriel add -g <specifier>
leogriel list -g
leogriel doctor -g
leogriel sync --global
```

Global state is machine-specific and is not a replacement for committed project dependencies.

## CI pipeline

```bash
npm install -g @leogriel/cli@1.0.0-beta.2
leogriel install --frozen
leogriel audit --strict --json
```

Exit codes are 0 for success, 1 for warnings/partial results, and 2 for fatal or validation failures.

## Behavioral test workflow (experimental)

```bash
leogriel test init my-skill
leogriel test validate
leogriel test my-skill --runs 3 --model <model> --json
leogriel test my-skill --compare main --runs 3 --model <model> --json
```

Tests are sequential and pair a clean baseline with the skill variant. With `--compare`, the baseline is the same skill from the exact commit resolved from the Git ref; the result records both integrity hashes. Network and web search are denied by default. Command assertions require an interactive confirmation or `--trust-tests` in non-interactive use; that flag does not sandbox commands or enable network access. Keep-workspace output may contain sensitive generated files.

For pull requests, `xFurti/leogriel@v1` can perform a frozen restore, run the regression, write the GitHub Job Summary, upload JSON/Markdown/HTML and badge reports, and optionally update one marked PR comment. Pin an exact prerelease tag before the stable `v1` tag exists, check out full history for `--compare`, and pass authentication through the job environment rather than an action input.

For GitHub code scanning, emit pure SARIF:

```bash
leogriel audit --format sarif --output results.sarif
```

## Discover and update

```bash
leogriel search typescript
leogriel info skills.sh/vercel-labs/skills/find-skills
leogriel outdated
leogriel update --dry-run
leogriel update selected-skill
```

Crossing an npm constraint is explicit: `leogriel update name --latest --save --yes`.

## Replace one unmanaged target

```bash
leogriel sync --project --agent codex --skill selected-skill --replace-unmanaged --dry-run
leogriel sync --project --agent codex --skill selected-skill --replace-unmanaged --yes
```

The original target is backed up under `.leogriel/backups/sync/` and restored automatically if replacement fails.

## Remove stale managed targets

```bash
leogriel sync --project --agent codex --prune --dry-run
leogriel sync --project --agent codex --prune
```

Prune never removes unverified user-managed directories.

## Run a behavioral regression

```bash
leogriel test selected-skill --compare main --agent codex --runs 3 --model <exact-model-id> --json
leogriel test selected-skill --compare main --agent claude --runs 3 --model <exact-model-id> --json
```

Codex is the primary runner. Claude Code is experimental and requires version 2.1.187 or newer on macOS, Linux, or WSL2. Tests remain sequential and network-denied by default. Do not enable `--trust-tests` unless the test YAML and command assertions have been reviewed.

## Add the leogriel meta-skill

```bash
leogriel add github:xFurti/leogriel#skills/leogriel
leogriel install
```

While developing this repository, use `leogriel add file:./skills/leogriel` and commit the refreshed manifest, lock, and `.leogriel/skills/leogriel` copy.
