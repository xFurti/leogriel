# @skillctl/cli

See the [root README](../../README.md) and [docs site](https://xfurti.github.io/skillctl/) for full documentation.

Universal package manager for [Agent Skills](https://agentskills.io). v0.9.0 adds experimental paired behavioral testing with an isolated Codex runner while retaining the 0.8 lock-compatible parser, backup, audit, artifact, and redaction foundations.

All first-party `--json` commands use the schema-1 skillctl envelope. Release candidates are tested from their packed tarballs and again from npm on Windows, macOS, and Linux.

```bash
skillctl search typescript --provider skills.sh
skillctl info skills.sh/vercel-labs/skills/find-skills
skillctl outdated
skillctl update --dry-run
skillctl audit --format sarif --output results.sarif
skillctl backup list --json
skillctl plugin add npm:@example/plugin@^1 --dry-run
skillctl test init my-skill
skillctl test validate
skillctl test my-skill --runs 3 --model <model> --json
skillctl completion powershell
```
