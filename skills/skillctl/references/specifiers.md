# Specifiers

Grammar (manifest + lock): must start with one of:

| Prefix | Example | Notes |
|--------|---------|-------|
| `github:` | `github:owner/repo#skills/foo` | Subpath after `#` |
| `skills.sh/` | `skills.sh/owner/repo` | Alias to GitHub resolver |
| `npm:` | `npm:@scope/pkg@^1.0` | Extracts skill from package |
| `file:` | `file:./skills/my-skill` | Project-relative preferred |
| `local:imported/` | `local:imported/my-skill` | Canonical store reference |

**Normalization on `add`:**

- `file:<abs-in-project>` → `file:./<relative>`
- `file:<abs-outside-project>` → `local:imported/<name>` (auto-import to store)
- Lock `specifier` and `resolved` match manifest for local skills

**Avoid:** `file:/Users/...`, `local:/absolute/path` in committed files.