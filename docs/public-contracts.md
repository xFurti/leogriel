# Public contract candidates for Leogriel 1.0

This document records the contracts currently proposed for `1.0.0`. They are implemented in the `1.0.0-beta.3` candidate tree but remain prerelease contracts until `1.0.0-rc.1` is validated. Any incompatible change before the RC must be documented in `CHANGELOG.md` and the migration guide.

## English

### Compatibility policy

- `agent-skills.json` remains the portable manifest. Existing `0.6.x`, `0.7.x`, `0.8.x`, `0.9.x`, and Leogriel beta manifests remain readable.
- `agent-skills.lock` keeps `lockfileVersion: '1.0'` and the canonical `sha256:<64hex>` directory-integrity algorithm. Leogriel must not silently rewrite that algorithm.
- Configuration keeps schema version `1`; new settings are optional and additive.
- Machine-readable CLI output keeps `schemaVersion: 1`.
- Artifact envelopes and behavioral-test YAML keep version `1`.
- Additive optional fields are compatible. Removing fields, changing their meaning, or tightening accepted persisted data requires an explicit migration.

### Manifest

`agent-skills.json` accepts optional top-level `name` and `version`, plus `agentSkills.dependencies` and `agentSkills.devDependencies`. Skill keys use canonical lowercase-hyphen names and cannot occur in both maps. Public specifier prefixes are:

- `github:`
- `skills.sh/`
- `npm:`
- `file:`
- legacy `local:imported/`

Resolution is immutable in the lock even when the requested specifier contains a mutable range, tag, branch, or ref.

### Lockfile

Every lock entry contains:

- requested `specifier`;
- immutable `resolved` value;
- canonical directory `integrity`;
- canonical `name`;
- portable `canonicalPath`;
- `fetchedAt`;
- `provenance`.

Provenance type is `github`, `npm`, `local`, `skills.sh`, or `other`. Existing provenance fields remain optional so old locks do not require conversion. Frozen installation uses the locked resolution and fails instead of consulting mutable catalog state.

### CLI JSON envelope

Every first-party command and subcommand supporting `--json` emits exactly one JSON value on stdout:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "test",
  "data": {},
  "warnings": [],
  "errors": []
}
```

`command` comes from the Commander hierarchy, not argv parsing. Human warnings and errors use stderr. JSON stdout contains no ANSI control sequences or unrelated human text. Known credentials are redacted in human output, JSON, diagnostics, reports, and artifacts.

Exit codes:

- `0`: successful operation with no negative domain result;
- `1`: warning, partial result, available update, failed audit policy, regression, or inconclusive behavioral result;
- `2`: invalid options, invalid persisted state, unsupported explicit request, or fatal validation error.

An exit code `1` can still have `ok: true` when the command completed correctly and is reporting a domain state such as “updates available.” Consumers must inspect both exit code and structured data.

### Artifact envelope

Persistent artifacts are opt-in and live below `.leogriel/artifacts/{audit,test,reports}/` or the equivalent global root. Writes are atomic and cannot escape the managed kind directory.

```ts
interface ArtifactEnvelope<T> {
  schemaVersion: 1;
  kind: 'audit' | 'test' | 'reports';
  createdAt: string;
  redactions: { total: number; types: Record<string, number> };
  data: T;
}
```

Redaction metadata stores counts and types only. A retained agent workspace is not guaranteed to be free of sensitive generated content and is never persisted implicitly.

### Catalog providers

Provider IDs are unique. Result IDs are always namespaced by the producing provider, even when a plugin returns an ID containing `:`. Public results may include provider, description, owner, update time, stale state, and a typed popularity metric. Provider-specific network failures do not authorize telemetry or silent installation.

### Audit

Audit remains offline by default. Findings preserve the existing rule, severity, skill, message, path, location, and fingerprint fields while optionally adding:

- category;
- remediation;
- confidence;
- evidence.

Heuristic prompt-injection and semantic-mismatch findings are informational or warnings unless evidence is deterministic. Findings never include the detected secret value.

### Plugins

Plugin API version is `1`. Capabilities are declarations, not permissions, and plugins execute Node.js code with the user’s permissions; Leogriel does not claim sandboxing. npm packages are integrity-checked before loading. Local plugins require explicit authorization. An incompatible API version, escaped entrypoint, or changed integrity is rejected.

### Behavioral test YAML and AgentRunner

Test YAML uses `version: 1`, one skill name, and unique case names. Cases contain prompt, optional fixture, assertions, optional budget/timeout, explicit runner/model, and an effective network policy. Tests are sequential and paired. Command assertions require interactive confirmation or `--trust-tests`.

`AgentRunner` provides:

- structured detection with version, capabilities, and reason;
- runner-owned authentication resolution;
- policy preflight;
- one isolated run request and structured result.

Codex is the primary runner. Claude Code is experimental, requires version `2.1.187` or newer, and fails closed outside macOS, Linux, or WSL2. Both require isolated configuration roots and credential filtering. No runner may silently weaken a rejected isolation or network configuration.

`@leogriel/testing` remains explicitly experimental through the beta. Its public TypeScript contract is frozen only after RC validation with two real runners.

## Italiano

### Politica di compatibilità

- `agent-skills.json` resta il manifest portabile e continua a leggere i file delle versioni precedenti documentate.
- `agent-skills.lock` mantiene `lockfileVersion: '1.0'` e l’algoritmo canonico `sha256:<64hex>` già usato dai lock esistenti.
- La configurazione resta alla versione `1`; i nuovi campi sono opzionali.
- Envelope JSON CLI, artifact e YAML dei test restano alla versione `1`.
- I campi opzionali aggiuntivi sono compatibili. Rimozioni, cambi semantici o validazioni più restrittive dei dati persistiti richiedono una migrazione esplicita.

### Manifest e lock

Il manifest contiene `agentSkills.dependencies` e `agentSkills.devDependencies`, con nomi canonici lowercase-hyphen e specifier `github:`, `skills.sh/`, `npm:`, `file:` oppure il formato legacy `local:imported/`.

Il lock conserva specifier richiesto, risoluzione immutabile, integrità canonica, nome, percorso portabile, data e provenienza. I campi di provenienza restano opzionali per leggere i lock precedenti. Un’installazione frozen usa la risoluzione bloccata e non consulta nuovamente un catalogo mutevole.

### Envelope JSON ed exit code

Ogni comando first-party con `--json` produce un solo valore JSON su stdout con `schemaVersion`, `ok`, `command`, `data`, `warnings` ed `errors`. Il nome del comando deriva dalla gerarchia Commander. Warning ed errori umani vanno su stderr; non vengono emessi ANSI o testo estraneo su stdout JSON.

Gli exit code sono:

- `0` per successo;
- `1` per warning, risultato parziale o stato di dominio negativo;
- `2` per opzioni, stato persistito o richiesta esplicita non validi.

Un exit `1` può mantenere `ok: true` se il comando ha completato correttamente un controllo, per esempio rilevando aggiornamenti disponibili.

### Artifact, catalogo e audit

Gli artifact persistenti sono soltanto opt-in, vengono scritti atomicamente sotto `.leogriel/artifacts/` e non possono uscire dalla directory gestita. La redazione conserva solo conteggi e tipi. I workspace mantenuti possono comunque contenere output sensibile generato dall’agente.

Gli ID dei catalog provider sono unici e ogni risultato riceve sempre il namespace del provider. L’audit resta offline per default e può aggiungere categoria, remediation, confidence ed evidence senza rimuovere i campi esistenti. I finding euristici non sono bloccanti senza evidenze deterministiche e non includono mai il segreto trovato.

### Plugin e test comportamentali

La Plugin API resta alla versione `1`. Le capability sono dichiarazioni, non permessi; i plugin non sono sandboxati. Integrità, entrypoint e versione API vengono verificati prima del caricamento.

Il test YAML usa `version: 1`, nomi case univoci, policy di rete effettiva, assertion e budget validati. Le run sono sequenziali e paired. Le assertion `command` richiedono conferma o `--trust-tests`.

Codex è il runner principale. Claude Code è il secondo runner sperimentale, richiede almeno la versione `2.1.187` e usa sandbox fail-closed soltanto su macOS, Linux o WSL2. Nessun runner può applicare automaticamente una configurazione meno sicura quando isolamento o rete vengono rifiutati.
