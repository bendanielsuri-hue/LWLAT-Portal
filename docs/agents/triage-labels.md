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

## AFK blocker labels

`ready-for-agent` answers "is this fully specified?". It does not answer "is this safe to hand to a small model, unattended, on my credits?" — and those came apart in practice, because a ticket can be perfectly well specified and still be the wrong shape for an unattended run. Rather than splitting `ready-for-agent` in two (which would mean applying two labels to every ordinary ticket), two blocker labels mark the exceptions:

| Label                   | Meaning                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `needs-stronger-model`  | Fully specified, but beyond what the AFK agent's configured model handles well — run it attended with a stronger model. |
| `needs-budget-approval` | Fully specified, but large enough that an unattended run would burn a meaningful chunk of the credit budget — run it deliberately. |

Either one present on the issue makes `.github/workflows/afk-agent.yml` skip the run entirely. The skip is silent — the job never starts, so there is no comment on the issue, unlike the off-hours gate. These are opt-out, not opt-in: a ticket nobody has judged still runs, on the grounds that a wasted run costs less than a queue that silently stalls because a label was forgotten.

The blockers are also a pair of distinct questions, not one severity dial — a small fiddly refactor can need a stronger model without being expensive, and a wide mechanical sweep can be expensive without being hard. Apply both where both are true.

The workflow's model is set in `claude_args` in that file; if it changes, the bar for `needs-stronger-model` moves with it.

## Applying the blockers (agents)

Whenever you apply `ready-for-agent` to an issue, judge both blockers in the same breath and apply them too — they are part of applying `ready-for-agent`, not a separate later pass. A ticket that reaches `ready-for-agent` unjudged will run, so the judgement has to happen at the moment the label goes on.

Apply `needs-stronger-model` when the work needs sustained judgement rather than sustained typing: a design decision the issue states the goal of but not the shape of, a refactor whose correctness depends on invariants spread across files, anything touching the module visibility cascade or the tiered settings resolution, or anything where the issue itself says "decide" or "work out".

Apply `needs-budget-approval` when the work is wide rather than deep: many files, a migration plus reseed plus template sweep, a whole wayfinder map ticket, or a new hub (which by itself costs the six-place restatement list in the root CLAUDE.md). The rough test is whether you would expect to be at it for well over the workflow's turn cap.

Then tell the user in your reply which of the two you applied and why, in a sentence each — including when you applied neither, since "this one will run unattended tonight" is exactly the thing worth knowing before it does. Say it plainly rather than burying it in a list of everything else you did.
