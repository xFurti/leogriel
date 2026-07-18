# Migration guide toward Leogriel 1.0

This guide describes only migrations supported by the current prerelease tree. It does not announce a stable release.

## English

### From skillctl to Leogriel

npm packages cannot be renamed. Install the new CLI and remove the historical global package:

```bash
npm uninstall -g @skillctl/cli
npm install -g @leogriel/cli@next
leogriel --version
```

Do not republish new code under `@skillctl/*`. The coordinated Leogriel set contains twelve `@leogriel/*` packages, including the experimental `@leogriel/testing`.

Portable filenames remain:

- `agent-skills.json`
- `agent-skills.lock`

New state uses `.leogriel/` and `~/.leogriel/`. Leogriel recognizes documented legacy `.skillctl/` paths, markers, plugin metadata, transaction journals, and `SKILLCTL_*` environment overrides while migrating. `LEOGRIEL_*` takes precedence when both forms exist.

Recommended verification:

```bash
leogriel install --frozen --no-sync
leogriel doctor --json
leogriel audit --strict
leogriel sync --project --dry-run
```

Inspect the dry run before mutating targets. Unmanaged targets are never replaced implicitly.

### From beta.2 to an RC candidate

The post-beta.2 tree adds:

- `test --compare <git-ref>`;
- official GitHub Action reports;
- Claude Code as a second experimental runner;
- explicit root package exports;
- updated dependency and runtime metadata.

Existing manifest, lock, configuration, plugin state, backups, and test YAML do not require a schema conversion. Re-run `doctor`, `audit`, and behavioral validation after installing a future prerelease.

Runner authentication:

- Codex API: `CODEX_API_KEY` or `OPENAI_API_KEY`;
- Codex subscription smoke only: explicit dedicated `LEOGRIEL_CODEX_AUTH_HOME`;
- Claude Code: `ANTHROPIC_API_KEY`.

Never store these values in YAML, manifests, reports, or repository variables visible to untrusted pull requests.

### GitHub Action adoption

Before stable `v1`, reference an exact prerelease tag. Pin both `leogriel-version` and `runner-version` when reproducibility matters. The action installs the selected runner without passing supported authentication variables to npm installation, restores the frozen lock, preserves reports, and only then enforces the behavioral exit code.

External pull requests normally cannot access secrets. Do not weaken that boundary to execute untrusted tests or skills.

### Rollback

Because persisted schemas remain compatible, rollback consists of reinstalling the previous Leogriel prerelease and restoring normal project files from version control. Never replace a lockfile with an older copy after intentionally changing dependencies without reviewing the corresponding manifest.

Backups created by managed sync must be restored through `leogriel backup restore`, not by editing backup metadata or moving directories manually.

## Italiano

### Da skillctl a Leogriel

I pacchetti npm non possono essere rinominati. Installa la nuova CLI e rimuovi il vecchio pacchetto globale:

```bash
npm uninstall -g @skillctl/cli
npm install -g @leogriel/cli@next
leogriel --version
```

Non pubblicare nuovo codice sotto `@skillctl/*`. La famiglia Leogriel contiene dodici pacchetti coordinati `@leogriel/*`, incluso `@leogriel/testing`, ancora sperimentale.

I file portabili restano `agent-skills.json` e `agent-skills.lock`. Il nuovo stato usa `.leogriel/` e `~/.leogriel/`, mentre i percorsi e gli override `SKILLCTL_*` documentati restano leggibili durante la migrazione. Gli override `LEOGRIEL_*` hanno precedenza.

Verifica consigliata:

```bash
leogriel install --frozen --no-sync
leogriel doctor --json
leogriel audit --strict
leogriel sync --project --dry-run
```

Controlla il dry-run prima di modificare i target. I contenuti unmanaged non vengono mai sostituiti implicitamente.

### Da beta.2 verso la release candidate

Il ramo successivo a beta.2 aggiunge confronto Git dei test, GitHub Action con report, runner Claude Code, export pubblici espliciti e metadata runtime aggiornati. Manifest, lock, config, plugin, backup e YAML test esistenti non richiedono conversione dello schema.

Autenticazione runner:

- Codex API: `CODEX_API_KEY` oppure `OPENAI_API_KEY`;
- smoke Codex con abbonamento: solo un `LEOGRIEL_CODEX_AUTH_HOME` dedicato ed esplicito;
- Claude Code: `ANTHROPIC_API_KEY`.

Non inserire credenziali in YAML, manifest, report o variabili visibili alle pull request non trusted.

### GitHub Action e rollback

Prima della stabile usa un tag prerelease esatto. Fissa `leogriel-version` e `runner-version` per confronti riproducibili. L’Action conserva i report prima di applicare l’exit code del test.

Per tornare indietro reinstalla la prerelease precedente e ripristina da Git i normali file di progetto. I backup gestiti vanno ripristinati con `leogriel backup restore`; non modificare i metadata per puntare a percorsi arbitrari.
