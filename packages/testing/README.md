# @leogriel/testing

Experimental behavioral-testing internals for pre-1.0 Leogriel. The API, YAML schema details, and runner contracts may change before 1.0. Plugins and consumers must not treat this package as stable.

The package executes agent runners and trusted test commands as user code. Isolation limits configuration leakage but is not an absolute security sandbox.

`leogriel test <skill> --compare <git-ref>` uses the same current test YAML for an immutable copy of the skill at the resolved commit and the current working-tree candidate. The result records the ref, commit, and both integrity hashes.

Codex runs use API-key authentication by default. Opt-in live runs can use a dedicated ChatGPT subscription profile by setting `LEOGRIEL_CODEX_AUTH_MODE=chatgpt` and an explicit `LEOGRIEL_CODEX_AUTH_HOME` previously authenticated with `codex login`. The runner checks `codex login status`, does not select `~/.codex` automatically, and keeps that profile out of workspaces, artifacts, logs, and agent tool subprocesses.

Claude Code is the second experimental runner. It requires Claude Code 2.1.187 or newer, `ANTHROPIC_API_KEY`, and macOS, Linux, or WSL2. It uses bare mode, an isolated configuration directory, fail-closed OS sandboxing, default-deny tool networking, disabled WebFetch/WebSearch, and credential removal from subprocesses. Native Windows and unsupported sandbox/network configurations are rejected without a weaker fallback. Because bare mode disables skill discovery, the exact staged `SKILL.md` is injected explicitly into the runner prompt and its directory remains available for references and assets.

`LEOGRIEL_LIVE_DEBUG=1` enables redacted live diagnostics. `LEOGRIEL_LIVE_KEEP_WORKSPACE=1` retains only the failed workspace in the Git-ignored artifact directory; authentication and isolated HOME/XDG data are never retained. The live smoke does not retry.

Run the second opt-in smoke with `LEOGRIEL_LIVE_CLAUDE=1`, `LEOGRIEL_LIVE_CLAUDE_MODEL=<exact-model-id>`, and `ANTHROPIC_API_KEY=[SEGRETO RIMOSSO]`. It is excluded from the standard suite.

See the repository’s `docs/public-contracts.md` and `docs/validation-matrix.md` before treating the runner API as an RC candidate.
