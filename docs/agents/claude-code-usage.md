# Claude Code Usage Guide

Best-usage guidance for working with Claude Code on this repo. See [#251](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/251) for the originating ask. Facts below are sourced from `code.claude.com/docs` (model-config, sub-agents, fast-mode, costs) as of 2026-09-14 — re-verify against those docs if this file feels stale, since model names and settings surfaces change.

## Mechanisms available (facts, not recommendations)

- **Model**: `/model <alias>` (`sonnet`, `opus`, `haiku`, `fable`, `best`, `opusplan`, `[1m]` variants) switches and saves as default; bare `/model` opens a picker; `s` = session-only. Priority: `/model` > `--model` flag > `ANTHROPIC_MODEL` env > `model` in settings.json > `ANTHROPIC_DEFAULT_MODEL`.
- **Subagent model override**: `.claude/agents/*.md` frontmatter `model:` (alias, full ID, or `inherit`). Resolution: per-invocation param > frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` env > main conversation's model. This repo has no `.claude/agents/` directory yet, so no standing overrides to stay consistent with.
- **Effort**: `/effort [low|medium|high|xhigh|max|ultracode|auto]` (bare = interactive slider), `--effort` flag, or settings.json `effortLevel` / `modelSettings.<model>.effortLevel`.
- **Thinking**: `Option+T` / `Alt+T` toggle, or `/config`'s thinking toggle (`alwaysThinkingEnabled`). Fable models can't disable thinking.
- **Fast mode** (`/fast`, Opus 5/4.8 only): same model, same quality, priced at a flat premium ($10/$50 per MTok) for up to 2.5x faster output. Not a smaller/cheaper model — a latency lever, not a quality or cost lever downward.
- **No built-in main-thread auto-switching.** Nothing in Claude Code changes model/effort by task type on its own; the only automatic per-task-type lever is the subagent frontmatter `model:` field (e.g. `model: haiku` for a subagent doing high-volume/low-judgment work).

## Task-to-settings decision table

| Task shape | Model | Effort | Notes |
|---|---|---|---|
| Quick lookup, single targeted grep/read, trivial edit | Sonnet (session default) | low–medium | Don't reach for Opus/high effort for something the compiler or a grep settles in one step. |
| Routine feature work, typical bug fix, refactor within known boundaries | Sonnet | medium–high | This repo's session default; matches most day-to-day hub/view work. |
| Architecture decision, schema/ADR-worthy design call, cross-cutting refactor | Opus | high–xhigh | Worth the cost when a wrong call is expensive to unwind (see `(ENG-S1)` schema calls, ADR-worthy decisions). |
| Hard/ambiguous debugging, flaky or non-reproducing bug | Opus | high–max | Escalate effort before escalating model if Sonnet-high is already close; escalate model when the bug resists a clear hypothesis. |
| Broad codebase research spanning many files/conventions | Sonnet or Opus main thread + `Explore` subagents in parallel | medium | Delegate the fan-out to subagents rather than raising main-thread effort — keeps verbose search output out of context. |
| High-volume/low-judgment subagent work (running tests, log/doc fetching, mechanical verification) | `model: haiku` on the subagent | low | Per `costs.md` guidance — isolate volume, not judgment. |
| Latency-sensitive live pairing (watching output stream, fast iteration loop) | Opus + `/fast` | as task warrants | `/fast` trades cost for speed on the *same* model quality — reach for it when speed, not quality, is the bottleneck. |

Defaults, not hard rules — the actual judgment call is what #251 is asking Claude to make explicit and improvable, not to replace with a lookup table alone.

## Prompting patterns by task type

- **Exploration**: state the question, not a prescribed search sequence — let the agent pick tools. Prescriptive steps waste effort when the premise turns out wrong.
- **Implementation**: give the full spec up front (files, constraints, acceptance criteria) — thin, iterative prompting under-uses higher effort levels, which do best with the complete task stated at once.
- **Debugging**: state symptom + what's been ruled out, not a guessed root cause — a wrong steer costs more at high effort/model tiers, since the agent spends more per turn defending the wrong hypothesis.
- **Review**: ask for a verdict + severity-ranked findings, not a narrative — narratives are harder to act on and cost more output tokens.
- **Architectural work**: explicitly ask for trade-offs to be named, not just an answer — the point of spending Opus/high-effort budget here is surfacing the trade-off, not just picking one.

## Subagents, parallel work, fresh context

Use the main conversation for: frequent back-and-forth, multi-phase work needing shared context, quick targeted edits, latency-sensitive work.

Use a subagent for: verbose output isolation (tests, logs, docs), tool-restriction enforcement, self-contained work that returns a summary, parallel independent research (send multiple Agent calls in one message when the work is genuinely independent).

Use a Skill instead of a subagent when you want a reusable prompt that still runs in main-conversation context/state.

## Advisory check: when settings look mismatched

There's no Claude Code hook that inspects "is the current model/effort a good fit for this task" before work starts in general — hooks fire on tool/lifecycle events, not on a free-form semantic read of task difficulty. Two narrow surfaces close part of that gap with real hooks, keyed on GitHub Issues rather than task text in general:

- **Skill invocation** (`.claude/hooks/skill-settings-check.js`, `PreToolUse`/`Skill`): flags when a skill's own known weight (heavy: `code-review`, `security-review`, `tdd`, `domain-modeling`, `diagnosing-bugs`, `codebase-design`, `research`; light: `sync`, `suggest-version-bump`, etc. — see `.claude/hooks/lib/skill-weight.js`) looks mismatched against current model/effort.
- **Tickets** (`.claude/hooks/lib/ticket-classify.js`, shared by two hooks): a ticket's weight is guessed from architectural/ADR/schema language, debugging language (flaky/broken/regression), trivial-edit language, or a skill named in its body/comments (reusing the same heavy/light split above).
  - `.claude/hooks/ticket-settings-check.js` (`UserPromptSubmit`): triggers on any mention of a ticket/issue number in the prompt — deliberately not pinned to a fixed phrase (wording varies too much, and the hook is silent when nothing's mismatched, so a loose trigger costs nothing) — fetches the issue via `gh`, and — if the guessed weight doesn't match current model/effort — injects an advisory note for Claude to relay, non-blocking.
  - `.claude/hooks/ticket-create-settings-suggest.js` (`PostToolUse`/`Bash`, filtered to `gh issue create`): classifies the newly created ticket the same way and posts the suggestion as a `gh issue comment`, so it travels with the ticket instead of being recomputed differently each time someone opens it.

Both ticket hooks are heuristic and best-effort — they guess from ticket text/labels, not a real understanding of scope, and stay silent (rather than blocking or erroring) if `gh` is unavailable or nothing looks mismatched. For every other task shape (prose descriptions, ad hoc requests with no GitHub issue), the practical mechanism is still Claude's own judgment, prompted to flag a likely mismatch before doing substantial work.

**Trigger heuristics** (flag before starting, don't act on unprompted) — apply on top of the hooks above, not instead of them; the hooks catch the ticket-shaped case, this list covers task shapes with no ticket to inspect:

1. Task reads as architectural/schema-level or "hard debugging" (see decision table) and current model is Haiku or effort is low/medium → recommend raising model/effort, in one line, with the specific reason (not a generic "this seems complex").
2. Task reads as a single trivial edit/lookup and current settings are Opus at high/xhigh/max → note that a cheaper/faster setting would likely suffice, without blocking or auto-downgrading.
3. Task is a large cross-cutting change (spans many files/hubs, or is genuinely ambiguous in scope) → suggest explicit planning/decomposition or parallel subagent research before diving in, independent of model/effort.
4. Task's priority (speed vs. cost vs. maximum quality) isn't stated and the settings implied by the request are ambiguous (e.g. "quick and dirty" vs. "get this exactly right") → ask which the user wants, once, rather than guessing.

**Non-goals, restated**: never change model/effort without the user acting on the recommendation; never repeat the flag mid-task once raised and acknowledged (or declined); stay silent on routine work that already matches its settings.

## Representative scenarios (for evaluating the above)

| Scenario | Expected flag? | Why |
|---|---|---|
| "Fix this typo in a template" on Opus/max | Yes — suggest stepping down | Trivial edit, expensive settings |
| "Why is the nav recomputed 2-3x per request" (see #193) on Sonnet/low | Yes — suggest Opus/high | Real debugging task, cheap settings |
| "Add a Module row for the new leaf page" on Sonnet/medium | No | Routine, well-matched |
| "Redesign the settings resolution cascade" on Sonnet/medium | Yes — suggest Opus/high, and planning | Architectural, ADR-worthy scope |
| "Search the codebase for every hardcoded school list" on Opus/high, single-threaded | Maybe — suggest parallel Explore subagents | Not a model mismatch, a decomposition opportunity |

## Keeping this current

No cron job backs this — a wall-clock schedule is tied to one machine having a live Claude Code session at the right minute, which doesn't hold across a team. Instead, staleness is checked against the repo itself and the trigger is a thing that already happens roughly daily: starting the dev server (see `CLAUDE.md`'s "Running the server" section).

When triggered:

1. Check last-touched date: `git log -1 --format=%cd --date=short -- docs/agents/claude-code-usage.md`. If under 7 days old, skip — nothing to do.
2. If 7+ days old, WebFetch the sources this file is grounded in: `code.claude.com/docs/en/model-config.md`, `sub-agents.md`, `fast-mode.md`, `costs.md`.
3. Diff against the "Mechanisms available" section and anywhere else those facts are referenced (decision table, subagent guidance). Edit in place for anything that's changed (new/renamed model aliases, changed effort levels, `/fast` behavior or pricing, subagent resolution order), and bump the "as of" date in the header. Leave sections that are still accurate alone — this isn't a rewrite pass.
4. Leave the edit uncommitted for review — don't commit on the user's behalf.
5. A `git log` check with nothing to compare against yet (file just created) naturally reads as "not stale" for the first 7 days — no special-casing needed.

## Where this lives

This file is the guide + decision table + advisory design (#251's four documentation deliverables). It lives under `docs/agents/` alongside `issue-tracker.md`/`triage-labels.md`/`domain.md` because it's read-order/process guidance for agents working this repo, not a portal-wide engineering principle (`PRINCIPLES-ENGINEERING.md`) or a per-hub concern. Referenced from the root `CLAUDE.md`'s "Agent skills" section.
