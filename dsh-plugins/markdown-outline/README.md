# dsh-markdown-outline

A read-only `markdown_outline` tool for DeepSeek Harness: returns the heading
outline (level, text, line number) of a Markdown file so the model can decide
which sections of a long document to read in full.

## Install

```sh
dsh plugin --profile web add <path-to-this-package>
```

The package declares `dsh.bundle`; installing it appends its patch layer to the
profile, and the tool row becomes active after the next restart.

## Configuration

| Field | Default | Description |
|---|---|---|
| `maxHeadingDepth` | `6` | Highest heading level the tool may return (1-6). A per-call `maxDepth` argument may only narrow this ceiling. |

Override in the profile's `cordis.patch.yml`:

```yaml
- id: markdown-outline
  name: dsh-markdown-outline
  config:
    maxHeadingDepth: 3
```

## Model experience

The tool declares `path` (required) and `maxDepth` (optional) parameters. The
canonical value is `{ headings: [{ level, text, line }], totalLines }`; the
model-facing render is an indented outline with `(L<line>)` suffixes.

## Known limitations and deferred work

- ATX headings inside fenced code blocks are matched too; fence state is not tracked.
- Setext headings (`===` / `---` underlines) are not recognized.
