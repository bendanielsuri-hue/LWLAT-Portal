# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| --------------------------- | --------------------- | ----------------------------------------- |
| `needs-triage`              | `needs-triage`         | Maintainer needs to evaluate this issue  |
| `needs-info`                | `needs-info`           | Waiting on reporter for more information |
| `ready-for-agent`           | `ready-for-agent`      | Fully specified, ready for an AFK agent  |
| `ready-for-human`           | `ready-for-human`      | Requires human implementation            |
| `wontfix`                   | `wontfix`               | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## AFK agent labels

`ready-for-agent` answers "is this fully specified?". It does not answer "is it safe to hand this to a small model, unattended, right now" — that is a question about the *run*, not about the ticket, and the two come apart constantly. Four more labels carry the difference. Why it is shaped this way is in [ADR 0030](../adr/0030-afk-runs-are-permitted-per-run.md).

| Label | Meaning |
| ----- | ------- |
| `needs-stronger-model` | Beyond what the default model handles well. Blocks an unattended run; once approved, selects `AFK_STRONG_MODEL`. |
| `needs-budget-approval` | Wide enough that a run would eat a real share of the usage window. Blocks an unattended run; once approved, selects `AFK_MAX_TURNS_LARGE`. |
| `afk-approved` | Permission for **one** run, granted by a human. Applying it starts the run, and the run consumes it. |
| `ready-for-review` | The run opened a PR. Yours to review and merge. |
| `agent-failed` | The run ended with no PR. A comment says what happened and names any branch left behind. |

The two blockers are distinct questions, not one severity dial — a small fiddly refactor can need a stronger model without being wide, and a mechanical sweep can be wide without being hard. Apply both where both are true.

They are also opt-out rather than opt-in: a ticket nobody has judged still runs. A wasted run costs less than a queue that silently stalls because a label was forgotten.

### How a run starts

`.github/workflows/afk-agent.yml` starts when either `ready-for-agent` or `afk-approved` is applied, provided `ready-for-agent` is on the issue and either no blocker is present or `afk-approved` is. So an unblocked ticket runs as soon as you mark it ready, and a blocked one runs the moment you grant permission — granting is the gesture that fires it, rather than something you do and then have to remember to follow up.

Everything still waits for the off-hours window (weekday evenings and nights, or any time at the weekend), approved runs included. Approval says whether; the window says when.

Labelling during the day is no longer something you have to come back to. `.github/workflows/afk-queue.yml` ticks every quarter of an hour, and when the window opens it dispatches the lowest-numbered eligible ticket itself. So "mark it ready and forget about it" is the whole interaction — nothing needs a machine left on overnight, which is what this replaced (see [#277](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/277)).

Runs are serialised — one at a time, queued not cancelled. Runs draw on a Claude subscription's rolling usage window rather than per-token billing, so several finishing together can empty the window you were about to work in; and tickets in a dependency chain touch the same files, so parallel runs produce PRs that conflict.

The queue advances one ticket at a time rather than firing a batch, and that is a correctness requirement rather than good manners: GitHub allows only one **pending** run per concurrency group, so a third dispatch cancels the one already waiting. Anything that queued several at once would silently lose most of them.

The hand-off is the agent's last step asking the queue for the next ticket. Watching for the run to finish (`workflow_run`) was tried first and does not fire at all: the agent run is started by the queue's `GITHUB_TOKEN`, and GitHub suppresses further events from token-triggered runs. `workflow_dispatch` is a documented exception to that suppression, which is why asking works where being watched did not. The schedule is the safety net if a hand-off is ever missed.

### How a run ends

The outcome is decided by asking whether the run's own PR exists — not by the workflow's exit status, which is zero whether the agent succeeded, gave up, or was denied every tool it needed and did nothing. "Its own" means the branch the prompt tells it to create, `claude/issue-<n>`, or a PR whose body says it closes the issue. Matching any PR that merely *references* the number is what shipped first and it marked six tickets done in one evening off a single base-class PR that listed what it unblocked. Both `ready-for-agent` and `afk-approved` come off either way, so a retry needs a fresh grant. Neither outcome closes the issue; the agent never merges its own PR.

A failed run that pushed a branch keeps it, and the comment names it. A branch with real work on it tells you the run got most of the way and ran out of turns, which is the signal to raise the cap rather than rewrite the ticket.

A run that never started is reported differently and leaves every label alone, so the ticket stays queued and a hand-granted `afk-approved` is not spent on work nobody attempted. The case that makes this worth separating is an exhausted usage window: the run comes back in well under a second with `is_error`, one turn and no model usage at all, which is indistinguishable from a genuine failure unless you open the log. An infrastructure fault also stops the queue rather than handing the next ticket to whatever refused this one — so a night that ends early with tickets still queued is the expected shape of one, not a second bug.

### Checking what actually happened

`.venv\Scripts\python.exe scripts\afk_status.py` reports the queue against reality — labels that disagree with whether a PR exists, a stalled chain, and whether the schedule has ticked. It runs on your machine and depends on nothing but `gh`, which is the point: a check living inside the system goes quiet at the same moment the system does, and the schedule failing produces no run at all to carry a warning.

### Settings

Six repo variables (Settings > Secrets and variables > Actions > Variables), each with a fallback if unset:

| Variable | Fallback | Used when |
| -------- | -------- | --------- |
| `AFK_MODEL` | `sonnet` | Ordinary run |
| `AFK_STRONG_MODEL` | `opus` | `needs-stronger-model` is on the issue |
| `AFK_EFFORT` | `medium` | Ordinary run |
| `AFK_STRONG_EFFORT` | `high` | `needs-stronger-model` is on the issue |
| `AFK_MAX_TURNS` | `80` | Ordinary run |
| `AFK_MAX_TURNS_LARGE` | `150` | `needs-budget-approval` is on the issue |

Effort rides with the model rather than having a label of its own: `needs-stronger-model` already asks whether the ticket needs sustained judgement, which is the question effort answers, and a separate label would be a second dial for one decision. The defaults sit in the middle of each band in [claude-code-usage.md](claude-code-usage.md)'s table rather than the top, because these tickets are pre-vetted as fully specified — and because effort is the cheaper of the two dials to raise if runs start coming up short.

The turn caps started at 30/60 and were raised after a field-rename ticket — six templates, a migration and a seed command — died at turn 31 without reaching the git step. A cap only costs anything on a run that would have failed anyway; the risk it carries is a runaway ticket burning the whole cap before giving up, which serialised runs keep to one ticket at a time. Changing `AFK_MODEL` moves the bar for `needs-stronger-model` with it, and nothing re-judges issues already carrying the label — so a deliberate raise is also a prompt to look back over them.

## Applying the labels (agents)

Whenever you apply `ready-for-agent` to an issue, judge both blockers in the same breath and apply them too — they are part of applying `ready-for-agent`, not a separate later pass. A ticket that reaches `ready-for-agent` unjudged will run, so the judgement has to happen at the moment the label goes on.

Apply `needs-stronger-model` when the work needs sustained judgement rather than sustained typing: a design decision the issue states the goal of but not the shape of, a refactor whose correctness depends on invariants spread across files, anything touching the module visibility cascade or the tiered settings resolution, or anything where the issue itself says "decide" or "work out".

Apply `needs-budget-approval` when the work is wide rather than deep: many files, a migration plus reseed plus template sweep, a whole wayfinder map ticket, or a new hub (which by itself costs the six-place restatement list in the root CLAUDE.md). The rough test is whether you would expect to be at it for well over the workflow's turn cap.

Never apply `afk-approved` yourself. It is the one label that means a human decided to spend, and an agent granting it defeats the point of having it.

Then tell the user which of the two blockers you applied and why, in a sentence each — including when you applied neither, since "this one will run unattended tonight" is exactly the thing worth knowing before it does. Say it plainly rather than burying it in a list of everything else you did.
