# Specifiers

Grammar (manifest + lock): must start with one of:

| Prefix | Example | Notes |
|--------|---------|-------|
| `github:` | `github:owner/repo@main#skills/foo` | Optional ref after `@`, subpath after `#` |
| `skills.sh/` | `skills.sh/owner/repo` | Alias to GitHub resolver |
| `npm:` | `npm:@scope/pkg@^1.0` | Extracts skill from package |
| `file:` | `file:./skills/my-skill` | Project-relative preferred |
| `local:imported/` | `local:imported/my-skill` | Canonical store reference |

**Normalization on `add`:**

- `file:<abs-in-project>` → `file:./<relative>`
- `file:<abs-outside-project>` → `local:imported/<name>` (auto-import to store)
- Lock `specifier` and `resolved` match manifest for local skills
- GitHub shorthand `owner/repo#skills/foo` remains supported
- Legacy lock reads accept `github:owner/repo@sha/skills/foo`; new writes always use `#`
- Branch, tag, and HEAD requests resolve to a full 40-character commit before download
- npm ranges and dist-tags resolve to an exact version and SRI integrity

**Avoid:** `file:/Users/...`, `local:/absolute/path` in committed files.
