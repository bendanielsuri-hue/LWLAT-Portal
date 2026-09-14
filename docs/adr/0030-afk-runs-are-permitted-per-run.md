# 0030 — AFK agent runs are permitted per run, not per ticket

## Status

Accepted, 2026-09-14.

## Context

`.github/workflows/afk-agent.yml` hands a GitHub issue to an unattended agent and has it open a PR. It fires on the `ready-for-agent` label.

That single label was being asked two different questions at once. "Is this fully specified?" is a property of the ticket, settled when it is written. "Is it safe to hand this to a small model, unattended, on my subscription allowance?" is a property of the *run*, and it depends on things the ticket text does not say — how much of this week's usage window is left, whether anyone is around to look at the result, whether the last run of a similar ticket went anywhere.

Those questions came apart in practice. #231 is well specified and still the wrong shape for an unattended small-model run, because it introduces a shared base class every later ticket inherits. #223 is well specified and enormous — it is an entire app's model layer. #229 is well specified and genuinely small. All three carried the same label and would have run identically.

Two further facts shaped the decision, both established while building this:

- Runs authenticate with a subscription OAuth token, so the scarce resource is a rolling usage window shared with interactive work, not money. Several runs finishing at 08:55 can empty the window you were about to work in. The `total_cost_usd` in the run log is a client-side estimate at API list prices, not a charge.
- The action's step exit status is worthless as a success signal. It exits zero when the agent succeeds, zero when the agent gives up and asks for help, and zero when the agent was denied every tool it needed and did nothing at all. The first three runs of this workflow were green, spent 15 turns each and produced no branch, no PR and no comment.

## Decision

Permission to run is granted per run, by hand, and is consumed by the run.

- `ready-for-agent` keeps its original meaning — fully specified — and remains the trigger.
- `needs-stronger-model` and `needs-budget-approval` describe why a ticket is not suitable for an ordinary unattended run. They block one, *and* once permission is granted they configure it: the first selects `AFK_STRONG_MODEL`, the second `AFK_MAX_TURNS_LARGE`.
- `afk-approved`, applied by a human, grants permission for one run. Applying it starts the run. Both it and `ready-for-agent` are stripped when the run ends, so a retry needs a fresh grant.
- A run's outcome is decided by asking whether a PR referencing the issue exists, and recorded as `ready-for-review` or `agent-failed`.
- Runs are serialised through one concurrency group, queued rather than cancelled.

## Consequences

The blocker labels are now overloaded: they are both a brake and a gearbox. That is deliberate — the judgement "this needs the stronger model" and the judgement "don't run this unattended" come from the same reading of the ticket, and splitting them into separate labels would mean applying two labels to say one thing. The cost is that `needs-stronger-model` reads as a complaint and behaves as a setting, which is surprising until you know. Hence this ADR.

Permission being single-use means an approved ticket that fails needs approving again. This is the intended friction: the moment of re-granting is the moment you look at why the last run produced nothing, which is precisely the check that was missing when three runs in a row silently did nothing.

Serialising trades overnight throughput for observability and for not having dependent tickets produce conflicting PRs. If the queue ever becomes the bottleneck, the concurrency group is one line to widen — but do it by raising the limit, not by removing the group, or dependent tickets will race again.

The alternatives considered and rejected:

- **Separate `afk-run` trigger label**, leaving `ready-for-agent` as pure spec status. Rejected because it taxes every ordinary ticket with a second label to say what `ready-for-agent` already said.
- **Tiered `agent:sonnet` / `agent:opus` / `agent:manual` labels**, exactly one per ticket. Rejected because it conflates capability and cost, which the three examples above show are independent.
- **Settings parsed from a fenced block in the issue body.** More expressive — a per-ticket turn cap rather than one of two — but invisible in the issue list, which is where the question "what have I approved and not yet fired?" actually gets asked.
- **Trusting the action's exit status** rather than querying for a PR. This is what shipped first and it is what made three empty runs look like three completed ones.
