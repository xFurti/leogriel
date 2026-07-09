# Troubleshooting

## Doctor portability warnings

Message like `lock specifier is not portable` — legacy absolute paths from pre-0.3.1.

**Fix:** `skillctl install` rewrites lock from manifest. Re-commit `agent-skills.lock`.

## Integrity mismatch

Canonical store changed but lock unchanged.

**Fix:** `skillctl update <name>` or remove canonical dir and `skillctl install`.

## Mutable legacy resolution

`doctor` reports `mutable-resolution` for a 0.4 lock entry containing a GitHub branch/tag/HEAD or incomplete npm provenance.

**Fix:** run `skillctl update <name>` and commit the additive lock change. Frozen install rejects the mobile entry.

## Lock contention or interrupted transaction

Mutating commands serialize project then store access. `E_LOCK_TIMEOUT` means another operation held a lock for 10 seconds. `doctor` reports transaction journals and lock files older than the 30-second stale threshold; the next mutating command attempts recovery.

## Windows symlinks

Symlinks may require Developer Mode or admin.

**Fix:** Set `defaultMode: "copy"` in `~/.skillctl/config.json`; run `doctor`.

## Coexistence with npx skills / Python skillctl

`doctor` may detect `.agents/skills` or `~/.skillctl/repos`.

**Fix:** `skillctl import from-npx` or `import from-skillctl`; avoid double-managing same dirs.

## Version compatibility

This skill targets **skillctl 0.5.x** (immutable lock, frozen restoration, scoped sync/prune, stable JSON). Locks remain schema 1.0 and 0.4 locks are readable, but mobile remote entries require `update` before frozen use.
