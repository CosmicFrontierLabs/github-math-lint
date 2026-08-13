# GitHub Math Lint

GitHub Math Lint finds math expressions that look valid to a LaTeX editor but
break when GitHub Markdown preprocesses them before handing them to its math
renderer. It scans fenced `math` blocks, `$$...$$` blocks, and inline
`$...$` spans while ignoring ordinary code fences and inline code.

The action reports **all findings** in the workflow log, job summary, and a JSON
file. It optionally emits a bounded number of GitHub annotations; that bound
does not truncate any other output.

## Usage

```yaml
name: Documentation

on:
  pull_request:

permissions:
  contents: read
  pull-requests: read

jobs:
  math:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: CosmicFrontierLabs/github-math-lint@v1
```

For strict supply-chain pinning, use the full commit SHA instead of `@v1`.

## What it detects

- macros known to be rejected by GitHub's renderer, including
  `\operatorname` and the `\phantom` family;
- backslash-punctuation that GitHub Markdown consumes or rewrites inside math,
  including `\,`, `\!`, `\;`, `\_`, `\#`, `\|`, and nested delimiters;
- tildes that can become GFM strikethrough;
- Markdown links and citation-like references inside math;
- `+`, `-`, or `*` at the beginning of a line in a `$$` block, where Markdown
  can turn the expression into a list;
- raw pipes in inline math on a Markdown table row.

Each finding includes a rule name, exact location, source excerpt, and a
renderable alternative.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `paths` | `**/*.md`, `**/*.markdown`, `**/*.mdx` | Newline-separated include globs. |
| `exclude` | Git metadata, worktrees, dependencies, build output, and vendored directories | Newline-separated exclude globs. |
| `skip-extensions` | `.tex,.sty,.cls` | Extensions skipped even if a broad include such as `**/*` selects them. This keeps actual LaTeX out of a Markdown-specific lint. |
| `scan-pr-text` | `true` | Scan the pull request title and body using the event payload. |
| `fail-on-findings` | `true` | Fail after every finding has been reported. |
| `annotations` | `true` | Emit file annotations. |
| `max-annotations` | `50` | Annotation cap only; the log, summary, JSON report, and count remain complete. |
| `report-path` | `github-math-lint-report.json` | Complete JSON report path. Set to an empty string to disable. |

Inputs containing lists accept one entry per line. `skip-extensions` also accepts
commas.

### Custom scope

```yaml
- uses: CosmicFrontierLabs/github-math-lint@v1
  with:
    paths: |-
      docs/**/*
      README.md
    exclude: |-
      docs/generated/**
      docs/vendor/**
      **/snapshots/**
    skip-extensions: .tex,.sty,.cls,.bib
    max-annotations: 25
```

The skipped-extension check is applied after glob expansion, so `.tex` files
remain excluded even if `paths` is deliberately broad.

## Outputs and reports

- `findings-count`: total findings;
- `files-scanned`: total files (PR text is reported separately in JSON);
- `report-path`: relative JSON report path, or empty when disabled.

To retain the machine-readable report:

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: github-math-lint-report
    path: github-math-lint-report.json
```

## Versioning and releases

Releases follow semantic versioning:

- patch: detection fixes with no intended new findings on valid documents;
- minor: new rules, inputs, or report fields;
- major: changed defaults, removed inputs, or incompatible report changes.

Release commits update `package.json`, `package-lock.json`, `CHANGELOG.md`, and
the checked-in `dist/` bundle. The release workflow verifies the version, tests,
types, and bundle before creating an immutable `vX.Y.Z` release and moving the
convenience `vX` tag. Consumers may use either the major tag or an immutable tag
or SHA according to their pinning policy.

## Development

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run check-dist
```

`dist/` is committed because JavaScript actions execute the checked-in bundle.

## Origin

The rules encode failures documented in
[tracking-test-bench issue #1688](https://github.com/CosmicFrontierLabs/tracking-test-bench/issues/1688).
