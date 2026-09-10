# Doc Conventions

Rules for keeping design/engineering knowledge useful without bloating every session's context.

## Two destinations, not a doc tier

There is no longer a standalone `DesignLanguage.md`/`InteractionLanguage.md` doc at any level. Every rule extracted from the code lands in one of two places:

- **A principle** (`PRINCIPLES-ENGINEERING.md` / `PRINCIPLES-DESIGN.md` / `PRINCIPLES-INTERACTION.md`, all at repo root): a judgement call that holds regardless of which project or hub this is — the kind of thing that would still be true if this whole codebase were rewritten from scratch. Numbered plainly inside its own file (`C1`, `T1`, ...); cited from anywhere else with a domain prefix (`ENG-C1`, `DES-D3`, `INT-U2`).
- **A colocated comment**: a fact enforceable by looking at one piece of code — a token value, a layout recipe, a "why" behind one component's implementation. Lives as a comment directly in the CSS/template/view/JS file it describes, at the single canonical definition site (not every file that merely overrides or reuses it). Cite the principle it's an instance of, if any, with the same prefix convention (e.g. a card's shadow rule cites `(DES-F1)`).

**Test for "principle or colocated comment?"** — would a *different* hub or a *different* project reading this rule find it directly applicable without translation? If yes, and it needs more than a line or two of code to demonstrate, it's a principle. If it only makes sense pointing at one component's actual CSS/markup, it's a colocated comment, even if it happens to be the only hub with real UI today.

Some content doesn't reduce to either — a cross-cutting index of "which helper function to reach for" that spans several files with no single home. That belongs in the owning hub's own `CLAUDE.md` (see e.g. `hubs/inclusion/panel/CLAUDE.md`'s "Key helpers" section) rather than a separate design-language doc.

## What makes something principle-worthy

Before elevating a rule to a principle, it has to clear two bars:

1. Would this teach something the code doesn't already show on its own?
2. Does it still constrain anything once reasonable exceptions are allowed? A rule hedged into "always X, unless you have good reason not to" usually isn't worth documenting.

If a rule fails either bar, it's a discard, not a principle — restating what the code already makes obvious costs context for no benefit.

## Phrasing a principle

Once a rule clears the worth bar, write it tight:

- One sentence, two at most. State the constraint itself, not the reasoning behind it or the mechanism that satisfies it — the "why" and "how" belong in the colocated comment at the site that needs them, cited back to the principle. A first draft that runs long or starts justifying itself is a sign to cut, not a sign the rule is complex.
- Reach for the most general true form of the rule, not the narrower version scoped to whatever specific case surfaced it. A rule narrowed to its triggering case reads as covering only that case, so the same underlying bug walks straight back in the next time it shows up in a shape the narrow wording didn't name — check whether the qualifier is actually load-bearing (the rule is false without it) before keeping it.
- No mechanism names: no CSS properties, function names, class names, or specific values. Those tie the rule to one implementation and belong in the colocated comment instead (see below) — a principle should read the same whether the fix underneath it is CSS, a layout engine, or something else entirely.

## What belongs in a colocated comment

- A named token/class + its value, and the one-clause reason behind it.
- A worked example naming a specific page/modal — keep these out of principle files entirely; principles stay in plain English with no concrete class names or pixel values.
- Anti-patterns stated as one line: what to avoid, one line on the failure it causes — either as a comment at the site the mistake would land, or folded into the principle it violates.

## What a comment has to earn to stay

CLAUDE.md's "extremely concise, sacrifice grammar for concision" is about **reporting to the user**, and comments are the opposite case. Reporting is read live, in context, and is disposable; a comment is read cold, months later, by someone or some agent with none of that context. So the rule inverts: don't shorten a comment to save space — either it earns full prose or it shouldn't be there.

What earns it is narrower than "explains why". A comment stays if it records a decision that was **contested**: something tried and rejected, live feedback that changed the design, a constraint that bit, a value that looks arbitrary and isn't. A comment that explains what the code does — however well — is a discard, because the code already says that and the comment is now a second copy that can drift.

Three consequences worth stating outright:

- **A "why" that generalizes past its one site isn't a comment.** It's a principle or an ADR, and the comment becomes a citation of it. Restating the same portal-wide decision at each site it touches is the "Reference, don't duplicate" failure below, in comment form — and it's the main reason a file's commentary grows without bound.
- **A comment must name what it explains, not what it replaced.** Archaeology ("replacing the old X", where X is long gone) explains a diff, not the code in front of you. Issue citations are welcome and stay — `(#88)` is the only route back to the full argument, and `gh issue view 88` still resolves it — but the citation rides alongside a description of the current behaviour, never instead of one.
- **A section header is not a comment under this bar.** `/* === Carousels === */` is navigation, not explanation, and doesn't have to justify itself as a contested decision.

### Is it still true?

The machine-checkable half of the rule is that a comment must not name code that no longer exists — a dead function, class or data attribute is proof the comment is describing the past. `scripts/check_stale_comments.py` finds those, repo-wide or `--changed`. Run it on demand and during `/code-review`'s Standards pass. It is deliberately not a commit hook: a false positive would block an unrelated commit, and a check that does that gets bypassed and then stops working entirely.

A clean run is not "the comments are fine" — whether a live comment records a contested decision or merely restates the code is a judgement call, and no script makes it.

### Applying it to what's already written

Touch-it-fix-it: a comment inside a hunk you're already editing meets this bar or goes. There's no separate audit pass, and no permanent grandfathering either. The one exception is a file being restructured wholesale — there, every line is already in hand and the comment pass is part of the same reading, not a second one.

When judging whether a file is too long to stay one file, count **code** lines, not total. Otherwise well-explained code reads as bloat, and deleting a good comment becomes the cheapest way to get under the limit.

## Don't name volatile specifics

Don't hardcode the names or counts of things that can be renamed, added, or removed independently of the rule itself — theme flavour names, exact counts ("8 hues"), specific page/feature names cited only as an example. State the underlying behaviour generically instead ("theme-controlled," "may vary by theme") and point at the live, authoritative source for current instances rather than baking a snapshot into the rule that goes stale the next time something changes.

## Reference, don't duplicate

Before writing a value or rule anywhere, check whether it already lives in a source file (a CSS token file, a config default, a code comment). If it does, point at it instead of restating it — a fact held in two places drifts out of sync. If the source file lacks the usage/rationale a doc would otherwise add, prefer adding that missing annotation *to the source file* over carrying it only in a doc. One place to look beats two.

## Principles over enumeration

When several named patterns really are one underlying rule with situational variation, don't enumerate them as parallel named cases — a new case then has nothing to pattern-match against. Instead, write it as a **numbered decision process**: the base case, then each branch as "does X apply? → do Y," each with a short reasoning clause. This only applies when the named patterns genuinely share one root — don't force unrelated components into a shared decision tree just to produce a numbered list.

## Maintenance

- When a rule is written by generalizing from one hub's implementation, split it at the time of writing: the portal-wide shape goes to the relevant `PRINCIPLES-*.md` file, the hub's own class names/files stay as a colocated comment or in that hub's `CLAUDE.md`, cross-linked both ways via the citation codes.
- If a principle accumulates hub-specific detail over time (drift), that's a sign to split it out at the next edit touching that section — don't let it ride along "since it's already there."
