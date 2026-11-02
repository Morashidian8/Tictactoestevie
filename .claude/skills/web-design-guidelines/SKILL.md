---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines from `guidelines.md` in this skill's folder (a vetted local copy)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules live in `guidelines.md` next to this file — a copy of Vercel's
`web-interface-guidelines/command.md`, kept locally so reviews work without network access and
the rules applied are ones that were read before use (see `SOURCE.md`). To refresh, replace
`guidelines.md` with the latest copy from:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

## Local note — Persian / RTL projects

For Persian (RTL) interfaces, such as the projects in this workspace, adapt the English-only rules
instead of flagging them:
- **Title Case** (Content & Copy) does not apply to Persian.
- **Curly quotes**: Persian uses guillemets «…», not “…”; flag straight `"` in visible text, not «».
- **Ellipsis `…`** still applies.
- Logical CSS properties (`ps-`/`pe-`, `start`/`end`) over left/right is in the spirit of the
  Safe Areas & Layout rules; flag hard-coded `left`/`right` that break in RTL.
