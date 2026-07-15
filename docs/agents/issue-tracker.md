# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

**Note:** `gh` is not currently installed on this machine. Install it before running skills that publish to the tracker — until then, treat "publish to the issue tracker" as blocked and say so rather than silently falling back to a local file.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone. This repo's remote is `bendanielsuri-hue/LWLAT-Portal`.

## Projects (roadmap boards)

One GitHub Project (v2) per App — `Hub: <Name>` (e.g. `Hub: Staff`, `Hub: Inclusion — Panel`) or `Portal-wide` for cross-cutting work — each linked to this repo. Every issue lives in exactly one Project, matching the app it's actually about. A single shared cross-app board was tried first and rejected — one repo/one dev made the fragmentation of per-app boards worth it once GitHub's own "filter by project" surfaces per issue stopped being useful with everything piled into one board.

- Every hub gets a lightweight wayfinder-map issue as its Project's "home" (see Wayfinding operations below) — created once, holds Destination/Notes/Decisions-so-far/Fog, accumulates decisions/ideas over time rather than being a fixed spec. Inclusion Panel's predates this setup (#22); the rest were created as placeholders since most hubs are still hardcoded-only.
- New issue → add it to the matching Project: `gh project item-add <project-number> --owner bendanielsuri-hue --url <issue-url>`. Look up the project number with `gh project list --owner bendanielsuri-hue` (don't hardcode numbers here — they can change).
- No per-hub-page Projects — a page only earns its own wayfinder map (inside its hub's existing Project) once it has enough real, ongoing work to justify one. Most hub pages today are single hardcoded placeholders with nothing yet to track.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Existing local-markdown work

The [Panel List Pages Parity map](../wayfinder/panel-list-pages-parity/map.md) and its spec were filed as local markdown under `docs/wayfinder/` before this tracker was configured. Leave them there — don't migrate retroactively — but any new wayfinder maps/tickets from this point on should use GitHub Issues per the operations above.
