# Panel reconciliation is one entry point with an injected clock

Every time-based panel transition — a meeting becoming `delayed` because its
start time passed, a running meeting being auto-ended after an hour of
silence, a discussion timer being stopped after thirty quiet minutes — now
lives in `hubs/inclusion/panel/reconcile.py` behind a single function,
`reconcile_panels(now)`. The clock is a parameter everywhere it is read.

The panel views still call it on read. That is deliberate and temporary; see
"What this costs" below.

## Why

There were three separate sweep functions (`_sync_delayed_panels`,
`_sync_stale_running_panels`, `_sync_stale_discussion_timers`), private to
`views.py`, invoked in different combinations from six read paths: Panel Home
and Panel Meetings called all three, Meeting Agenda called two, Discussion and
the safeguarding-note rows called one each. Two things followed from that.

**A panel's fate depended on which page somebody opened.** A transition only
fired if a view that happened to call that particular sweep was loaded. A
meeting could sit `running` indefinitely because the only person using the app
that week never opened one of the two pages that would have caught it.

**The timeouts could not be tested at all.**
`_sync_stale_running_panels()` took no arguments and called `timezone.now()`
internally, so `STALE_PANEL_TIMEOUT` (60 minutes), `STALE_PANEL_WARNING_LEAD`
(5 minutes) and the under-a-minute "was this a real discussion" floor were
reachable only by monkeypatching the clock or by waiting an hour. In a repo
with no tests at all that was invisible; it is the first thing that blocks
writing one.

Both problems are fixed by shape rather than by scheduling. One entry point
means a caller cannot apply some transitions and not others. `now` as a
parameter means a test passes `T+61min` and asserts — which is exactly what
`tests/test_reconcile.py` now does, including the case that used to be
impossible to state: that the timeout measures from *last activity*, not from
`started_at`, so a long busy meeting is not auto-ended underneath the people
in it (#114).

## What this costs

Reconciliation still runs on GET, which means read requests still write rows.
That is a real defect and this ADR does not claim to fix it — it makes it
fixable.

Deleting the view-time calls today would mean nothing ever reconciles on a
developer's machine, because there is no scheduler anywhere in this project:
no cron, no worker, no background job infrastructure of any kind. Meetings
would simply stop going stale, which is worse than the problem.

So the view calls remain, but there is now exactly one of them, at one name,
and `manage.py reconcile_panels` exists for any environment that *does* have a
scheduler. The migration is deleting one line per view once something else is
calling the command on a clock.

Second cost: the six call sites used to invoke different subsets, and now all
six do all three sweeps. That is more work per page load. It is also the point
— the subsets were not a decision anyone made, they were drift, and they are
what made the outcome depend on the route.

## Considered options

- **Move reconciliation into middleware**: rejected. It would still be
  triggered by traffic — the same defect with a wider blast radius, now firing
  on every request in the portal rather than on six panel pages.
- **Signals on the models**: rejected. These transitions are driven by time
  passing, not by a row being saved. There is no save to hang them off; that
  is the whole nature of the problem.
- **Recompute on read without persisting** (derive `delayed` as a property
  rather than storing it): genuinely attractive for `delayed`, which is
  already documented as "computed, never set by hand", and would remove the
  write entirely for that one case. Rejected for now because it does not
  generalise: auto-ending a stale meeting has to persist `ended_at`,
  `auto_ended` and the deferral of every unreached referral. Splitting one
  transition out into a different mechanism from its two siblings trades a
  small win for exactly the "which mechanism owns this?" confusion the single
  entry point just removed. Worth revisiting if `delayed` ever becomes the
  only sweep left.
- **Keep the three sweeps and just add `now` parameters**: rejected. It fixes
  testability and leaves the route-dependence untouched, which was the defect
  with user-visible consequences.

## Consequences worth knowing

`reconcile.py` imports `lifecycle.py`, not the other way round. Reconciliation
is a caller of the state machine — it defers referrals and stops timers
through `lifecycle`'s verbs, so an auto-ended meeting resyncs referral statuses
by exactly the same path a manual "End Panel Meeting" does. Keep that direction:
a lifecycle transition must never need to know why it was triggered.

`reconcile_stale_discussion_timers` deliberately stops the clock at the
discussion's last activity rather than at sweep time, since the gap between
those two is an artefact of when the sweep happened to run. That distinction
only matters because the sweep is lazy, and is the one piece of this module
that becomes simpler, not harder, if it ever moves onto a real schedule.
