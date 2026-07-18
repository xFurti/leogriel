# Leogriel GitHub Action

The repository includes a composite action for reproducible behavioral regressions. It restores project skills with `install --frozen`, runs paired tests, writes the GitHub Job Summary, uploads JSON/Markdown/HTML reports and a Shields endpoint badge document, and optionally creates or updates one marked pull-request comment.

The action does not accept authentication as an input. Provide the runner key through the job environment so GitHub masks it, and scope repository permissions explicitly.

```yaml
name: Agent Skill regression

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  leogriel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: xFurti/leogriel@v1
        with:
          skill: my-skill
          compare: ${{ github.event.pull_request.base.sha }}
          model: <exact-model-id>
          runs: '3'
          comment-on-pr: 'true'
          github-token: ${{ github.token }}
        env:
          CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
```

Use an exact prerelease tag instead of `@v1` until the stable major tag exists. `fetch-depth: 0` is required when `compare` targets history not present in a shallow checkout.

## Outputs and artifacts

The action exposes `verdict`, `result-json`, `markdown-report`, `html-report`, and `badge-json`. The uploaded artifact also includes the frozen-install envelope and original CLI exit code. Regression and inconclusive results preserve the reports before the action fails.

The badge document follows the Shields endpoint schema. It can be served from a trusted Pages or artifact-publishing workflow; the action does not silently publish it to a public service.

## Safety

- Network and web-search policy still comes from the test YAML and remains denied by default.
- `trust-tests: 'true'` is required in CI when YAML contains `command` assertions. It does not provide a sandbox or enable network access.
- Pull-request comments are disabled by default. Enabling them requires `pull-requests: write` and an explicit `github-token`.
- Reports contain redacted structured output, but agent-generated files uploaded by a separate workflow may still be sensitive.
- Fork pull requests normally cannot access repository secrets; do not weaken that GitHub boundary to run untrusted code.
