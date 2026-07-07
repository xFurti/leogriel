# Manifest and lock

## agent-skills.json

Project-level declarative dependencies (like `package.json`):

```json
{
  "agentSkills": {
    "dependencies": {
      "my-skill": "github:owner/repo#path/to/skill"
    }
  }
}
```

Skill name keys are canonical lowercase-hyphen names.

## agent-skills.lock

Reproducible YAML lock (like `pnpm-lock.yaml`). Key fields per skill:

- `specifier` — mirrors manifest (portable)
- `resolved` — canonical resolved form (same as specifier for local skills)
- `integrity` — `sha256:` tree hash of canonical copy
- `canonicalPath` — `~/.skillctl/skills/<name>` (portable; expanded at runtime)
- `provenance` — source metadata (`github`, `local`, `npm`, etc.)

Commit both files for team workflows. Machine-local agent symlinks (`.claude/skills`, `.grok/skills`, …) are **not** committed.