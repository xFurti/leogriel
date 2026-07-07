# Troubleshooting

## Doctor portability warnings

Message like `lock specifier is not portable` — legacy absolute paths from pre-0.3.1.

**Fix:** `skillctl install` rewrites lock from manifest. Re-commit `agent-skills.lock`.

## Integrity mismatch

Canonical store changed but lock unchanged.

**Fix:** `skillctl update <name>` or remove canonical dir and `skillctl install`.

## Windows symlinks

Symlinks may require Developer Mode or admin.

**Fix:** Set `defaultMode: "copy"` in `~/.skillctl/config.json`; run `doctor`.

## Coexistence with npx skills / Python skillctl

`doctor` may detect `.agents/skills` or `~/.skillctl/repos`.

**Fix:** `skillctl import from-npx` or `import from-skillctl`; avoid double-managing same dirs.

## Version compatibility

This skill targets **skillctl 0.4.x** (portable lock, Grok adapter, `skill validate`). Older CLIs may write absolute paths — upgrade to 0.3.1+ before relying on portability rules.