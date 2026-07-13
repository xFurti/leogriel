# skillctl commands

| Command | Purpose |
|---------|---------|
| `init` | Create `agent-skills.json`; `--with-skill` adds the first-party meta-skill |
| `add <spec>` | Resolve and vendor a project skill; update manifest and lock |
| `add -g <spec>` | Install and sync an explicit personal/global skill |
| `install` / `i` | Install project manifest dependencies into `.skillctl/skills`; sync by default |
| `sync` | Refresh managed agent targets; filter scope/agent and optionally prune |
| `list` / `list -g` | Show project or global entries |
| `remove <name>` | Remove a project entry; `--purge` also deletes its vendored content |
| `remove -g <name>` | Remove a global entry and personal agent targets |
| `update [names...]` | Re-fetch project dependencies from their manifest specifiers |
| `doctor` / `doctor -g` | Diagnose project or global state, links, config, coexistence, and audit summary |
| `audit` | Security scan project skills (`--json`, `--strict`) |
| `import` | Discover, deduplicate, select, and vendor skills from project agent directories |
| `import from-npx` | Migrate from the `npx skills` layout |
| `import from-skillctl` | Migrate from Python skillctl repositories |
| `skill validate [path]` | Lint a `SKILL.md` directory |

Common flags: `install --frozen`, `install --prod`, `install --no-sync`, `doctor --fix`, `import --dry-run`, `import --select`, `import --interactive`, `sync --project`, `sync --global`, `sync --agent codex`, `sync --prune`, `sync --dry-run`.

Commands exposing `--json` emit one stable envelope and use exit code 0 for success, 1 for warnings/partial results, and 2 for fatal or validation errors.
