# Doc Conventions

Rules for keeping CLAUDE.md / DesignLanguage.md / InteractionLanguage.md useful without bloating every session's context.

## Tiers

- **Root** (`CLAUDE.md`, `DesignLanguage.md`, `InteractionLanguage.md`): loaded or linked every session, regardless of which hub is being touched. Content here must be **portal-wide** — true for every hub, not just the one that happened to establish the rule.
- **App-level** (`hubs/<name>/CLAUDE.md`, `hubs/<name>/DesignLanguage.md`, `.../InteractionLanguage.md`, `CONTEXT.md`): loaded only when working in that app. This is where implementation detail, specific class names, specific view/JS function names, and worked examples belong.

**Test for "does this rule belong in root or app-level?"** — would a *different* hub reading this rule find it directly applicable without translation? If the rule only makes sense pointing at one hub's CSS classes or views, it's app-level, even if it happens to be the only hub with real UI today.

## Length budget

- Root `DesignLanguage.md` + `InteractionLanguage.md` combined: aim for **under 250 lines**. If a rule needs more than ~3 lines to state, that's a sign it's actually implementation detail — move the detail app-level and leave a one-line pointer at root.
- Root `CLAUDE.md`: no hard cap, but every section should fail this test: *"could Claude derive this from the code in one or two tool calls?"* If yes, don't reproduce it — point at the source file instead (e.g. "see `mysite/urls.py` for hub mounts").
- App-level docs have no length rule — they're loaded on-demand, so verbosity there doesn't tax every session.

## What belongs at root

- A named token/class + its value (`--bg-nested`, `--space-lg` = `24px`).
- A one-clause reason by default — "why" belongs in an ADR if it's genuinely load-bearing, not a paragraph of inline prose. The exception is a numbered decision process (below), where the reasoning clause is what makes the rule generalize — that's worth the extra line even though it isn't a paragraph.
- Anti-patterns stated as one line: what to avoid, one line on the failure it causes.

## What does NOT belong at root

- Specific file paths, view names, or JS function names (`panel.js`'s `wireFilterBarActiveState`, `inclusion_panel_search`) — these are one hub's implementation, not a portal-wide rule.
- References to a specific past discussion ("grilling session 2026-07-12") — these belong as an ADR if the decision is worth preserving, not as an inline citation.
- Worked examples naming a specific page/modal (Panel Group's footer swap, Panel Agenda's drag-and-drop) — state the general pattern at root, keep the worked example app-level.

## Don't name volatile specifics

Don't hardcode the names or counts of things that can be renamed, added, or removed independently of the rule itself — theme flavour names (Pastel, Minimal, ...), exact counts ("8 hues", "6 flavours"), specific page/feature names cited only as an example. State the underlying behaviour generically instead ("theme-controlled," "may vary by theme") and point at the live, authoritative source for the current instances (e.g. `/portal-admin/themes/` for what flavours exist today) rather than baking a snapshot into the rule that goes stale the next time something is added, renamed, or removed. This applies even to a rule whose whole subject is the enumerable thing (e.g. the theme system itself) — the rule should describe the *shape* of the system (independent axes, multiplicative combination, re-derives every token), not enumerate its current members.

## Reference, don't duplicate

Before writing a value or rule into a doc, check whether it already lives in a source file (a CSS token file, a config default, a code comment). If it does, point at it instead of restating it — a fact held in two places drifts out of sync, and every duplicated line costs context on every session that loads the doc.

- If the source file lacks the usage/rationale the doc would otherwise add (e.g. `typography.css` had raw values with no per-token usage note, unlike `spacing.css`), prefer adding that missing annotation *to the source file* — matching whatever convention it already uses — over carrying it only in the doc. One place to look beats two.
- This isn't limited to CSS: the same logic applies to any project doc that could instead point at a schema, config file, or other authoritative source.

## Principles over enumeration

When a section lists several named patterns that are really one underlying rule with situational variation (e.g. four differently-named "card" patterns that all start from the same base style and branch on one or two questions), don't enumerate them as parallel named cases — a 5th/6th case then has nothing to pattern-match against and needs a new entry. Instead, write it as a **numbered decision process**: the base case, then each branch as "does X apply? → do Y," each with a short reasoning clause. A new case then falls out of the existing questions instead of requiring a new named entry.

This only applies when the named patterns genuinely share one root — don't force unrelated components (e.g. a search box, a segmented control, and a dropdown popover, which are different control shapes for different jobs) into a shared decision tree just to produce a numbered list.

## Maintenance

- When a rule is written by generalizing from one hub's implementation (as these currently are, extracted from Inclusion Panel), split it at the time of writing: the portal-wide shape goes to root, the hub's own class names/files go to that hub's own doc, cross-linked both ways.
- If a root rule accumulates hub-specific detail over time (drift), that's a sign to split it out at the next edit touching that section — don't let it ride along "since it's already there."
