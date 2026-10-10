# dsh-tool-audit

Audit plugin for DeepSeek Harness: observes every settled tool call on the
`tools/result` event and appends one JSON line per call to
`<logDir>/tool-audit.jsonl` (default `~/.dsh/logs/tool-audit.jsonl`).

## Install

From a fresh clone, install dev dependencies and build the runtime first (the
profile consumes `lib/`, which git does not carry):

```sh
pnpm install --ignore-workspace && pnpm run build
```

Then register the bundle with your profile:

```sh
dsh plugin --profile web add <path-to-this-package>
```

## Configuration

| Field | Default | Description |
|---|---|---|
| `logDir` | `~/.dsh/logs` | Absolute directory receiving `tool-audit.jsonl`. |

Override in the profile's `cordis.patch.yml`:

```yaml
- id: tool-audit
  name: dsh-tool-audit
  config:
    logDir: /var/log/dsh-audit
```

## Model experience

None. The plugin registers no tools, prompt sections, or model-visible
inputs; it only observes the frozen `tools/result` outcome of calls the model
already made.

## Known limitations and deferred work

- Records are written on a best-effort fire-and-forget stream; a hard process
  kill may lose the last buffered lines.
- The record carries `argsBytes`, never the arguments themselves — arguments
  may contain secrets and are deliberately not persisted.
