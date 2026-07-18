# Roadmap to leogriel 1.0

There will be no `0.10.0`. After `0.9.0`, the project may ship focused `0.9.1` and `0.9.2` fixes, followed by `1.0.0-alpha` or `1.0.0-beta` builds when public contracts still need iteration. At least `1.0.0-rc.1` is mandatory before stable.

## Required before 1.0

- [x] `leogriel test --compare <git-ref>` and repeatable paired regression testing. Implemented after beta.2; external validation remains required before RC.
- [x] An optional GitHub Action with GitHub Job Summary, Markdown/HTML reports, downloadable artifacts, badge data, and opt-in pull-request comments. Implemented after beta.2; it is not required for maintainer live-runner validation or the RC.
- [ ] Stable manifest, lock, artifact, test YAML, JSON envelope, plugin, catalog, audit, and AgentRunner contracts with migration guides. Bilingual contract and migration candidates are documented; RC validation is pending.
- [x] Two AgentRunner implementations with capability detection and fail-closed isolation: Codex plus experimental Claude Code on macOS/Linux/WSL2. Real cross-platform Claude validation remains required before RC.
- [ ] Real local test programs across external repositories, operating systems, and runner versions. Opt-in local live smokes and a redacted evidence matrix are prepared; external runs are pending.
- [ ] Complete English and Italian documentation, security guidance, compatibility guarantees, and migration instructions. Candidate contract/migration docs are bilingual; final RC review is pending.

`1.0.0` is released only after those contracts are verified in external repositories with at least two runners. Pre-releases do not imply API stability for `@leogriel/testing`.
