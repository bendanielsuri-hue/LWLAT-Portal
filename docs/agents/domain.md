# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **The nearest app's `CONTEXT.md`**, alongside that app's own `CLAUDE.md` (e.g. `hubs/inclusion/panel/CONTEXT.md` for work in `hubs/inclusion/panel/`). There is no root `CONTEXT.md` in this repo — glossaries are per-app, not global.
- **`docs/adr/`** at the repo root — the single shared ADR directory for the whole project. There are no per-app ADR directories; read ADRs that touch the area you're about to work in from this one location regardless of which app you're in.

If an app has no `CONTEXT.md` yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. Per this repo's own `CLAUDE.md` ("Domain glossary"), these are created lazily — only once an app accumulates real terms worth pinning down — via the `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`).

## File structure

```
/
├── docs/adr/                              ← all ADRs, system-wide, one flat directory
│   ├── 0001-shared-referral-base-table.md
│   └── ...
├── CLAUDE.md                              ← root project conventions
├── mat/, core/, hubs/                     ← app code
└── hubs/<name>/
    ├── CLAUDE.md                          ← app-specific conventions
    └── CONTEXT.md                         ← app-specific glossary (only where one has accumulated real terms)
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant app's `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0004 (hubs as URL convention, not DB model) — but worth reopening because…_
