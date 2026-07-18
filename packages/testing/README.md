# @leogriel/testing

Experimental behavioral-testing internals for leogriel 0.9. The API, YAML schema details, and runner contracts may change before 1.0. Plugins and consumers must not treat this package as stable.

The package executes agent runners and trusted test commands as user code. Isolation limits configuration leakage but is not an absolute security sandbox.

Codex runs use API-key authentication by default. Opt-in live runs can use a dedicated ChatGPT subscription profile by setting `LEOGRIEL_CODEX_AUTH_MODE=chatgpt` and an explicit `LEOGRIEL_CODEX_AUTH_HOME` previously authenticated with `codex login`. The runner checks `codex login status`, does not select `~/.codex` automatically, and keeps that profile out of workspaces, artifacts, logs, and agent tool subprocesses.

`LEOGRIEL_LIVE_DEBUG=1` enables redacted live diagnostics. `LEOGRIEL_LIVE_KEEP_WORKSPACE=1` retains only the failed workspace in the Git-ignored artifact directory; authentication and isolated HOME/XDG data are never retained. The live smoke does not retry.
