"""Time-based panel transitions: the ones nobody clicks.

A meeting becomes 'delayed' because its start time passed, a running meeting
is abandoned because nothing happened in it for an hour, a discussion timer is
stopped because it went quiet. None of these has a user action behind it -
they are all "what should be true by now".

There is no scheduler in this app, so these have always run lazily off page
loads, and they were invoked as three separate calls from six different read
paths. That had two consequences worth naming:

  - Whether a meeting went stale depended on which page somebody happened to
    open, since a transition only fired if a view calling it was loaded.
  - The timeouts could not be tested at all. reconcile_stale_running_panels
    read timezone.now() internally, so exercising the 60-minute rule meant
    monkeypatching the clock or waiting an hour.

Both are fixed by shape rather than by scheduling: `now` is a parameter
throughout, and reconcile_panels() is the single entry point. The view calls
remain for now - deleting them with no scheduler in place would simply stop
meetings ever going stale on a dev machine - but they are one call, at one
name, and a deployment with a scheduler moves to the management command
(manage.py reconcile_panels) by deleting that one line. See ADR 0019.
"""

import datetime

from django.conf import settings
from django.utils import timezone

from . import lifecycle
from .models import Panel, PanelMember, PanelReferral, PanelReferralNote

# How long a running panel can go with no recorded activity before it's
# considered abandoned - shared by the lazy backstop sweep and the live poll
# (inclusion_panel_meeting_activity_poll) so the two can never disagree about
# when a panel is due to close.
STALE_PANEL_TIMEOUT = datetime.timedelta(minutes=60)
# How long before STALE_PANEL_TIMEOUT the in-page warning dialog appears (see
# initInactivityWarning in panel.js) - only meaningful to someone actively
# polling from the Panel Agenda page; the backstop sweep doesn't use it.
STALE_PANEL_WARNING_LEAD = datetime.timedelta(minutes=5)
# How long a single discussion can go with no note or action against it before
# its timer is stopped - one level down from STALE_PANEL_TIMEOUT, which only
# catches a whole abandoned meeting.
STALE_DISCUSSION_TIMEOUT = datetime.timedelta(minutes=30)
# Under this, with nothing recorded against it, a discussion is treated as
# never having really happened - see _discussion_too_short_to_count.
REAL_DISCUSSION_MINIMUM = datetime.timedelta(minutes=1)


def group_typical_duration(panel_group):
    # Average (ended_at - started_at) across this group's own completed
    # meetings - the "is this meeting running unusually long" signal is
    # relative to what's normal for this specific group, not a portal-wide
    # guess. Falls back to a flat 2h estimate for a group with no
    # completed-meeting history yet to average from.
    fallback = datetime.timedelta(hours=2)
    if panel_group is None:
        return fallback
    durations = [
        p.ended_at - p.started_at
        for p in Panel.objects.filter(
            panel_group=panel_group, status='complete', auto_ended=False,
            started_at__isnull=False, ended_at__isnull=False,
        )
    ]
    if not durations:
        return fallback
    return sum(durations, datetime.timedelta()) / len(durations)


def panel_last_activity_at(panel):
    # No dedicated general-purpose "last touched" timestamp exists on Panel,
    # so this derives one from the most recent thing that actually happened in
    # the meeting: a note added on any of its discussions, a member checking
    # in/out, a PanelReferral being touched at all (marked discussed, resumed,
    # a follow-up set - PanelReferral.updated_at is auto_now, so any save()
    # bumps it), or an explicit "Still here" ping from the inactivity-warning
    # dialog (last_confirmed_at). The referral-touch signal matters as much as
    # the others - a chair who spends the whole meeting actually discussing
    # referrals, without ever adding a note or touching attendance, must not
    # read as "abandoned" (#114). Falls back to started_at if nothing has
    # happened yet.
    candidates = [panel.started_at, panel.last_confirmed_at]
    latest_note = PanelReferralNote.objects.filter(
        panel_referral__panel=panel
    ).order_by('-created_at').values_list('created_at', flat=True).first()
    if latest_note:
        candidates.append(latest_note)
    latest_referral_touch = panel.panel_referrals.order_by('-updated_at').values_list(
        'updated_at', flat=True
    ).first()
    if latest_referral_touch:
        candidates.append(latest_referral_touch)
    for field in ('checked_in_at', 'left_at'):
        latest = PanelMember.objects.filter(panel=panel, **{f'{field}__isnull': False}) \
            .order_by(f'-{field}').values_list(field, flat=True).first()
        if latest:
            candidates.append(latest)
    return max(c for c in candidates if c is not None)


def discussion_last_activity_at(pr):
    # Mirrors panel_last_activity_at but scoped to a single discussion - a
    # note added to this PanelReferral, or an Action raised during it
    # (Action.origin_panel_referral exists specifically to attribute an action
    # to the discussion it came from). Floored at discussion_started_at so a
    # discussion with neither yet doesn't read as abandoned since the epoch.
    candidates = [pr.discussion_started_at]
    latest_note = pr.notes.order_by('-created_at').values_list('created_at', flat=True).first()
    if latest_note:
        candidates.append(latest_note)
    latest_action = pr.raised_actions.order_by('-created_at').values_list('created_at', flat=True).first()
    if latest_action:
        candidates.append(latest_action)
    return max(c for c in candidates if c is not None)


def _discussion_too_short_to_count(pr):
    # Under a minute with nothing recorded against it (no note, no action) -
    # not enough evidence a real discussion happened, as opposed to an
    # accidental click-through or one opened and immediately abandoned.
    # Checked against pr.duration, which the caller must have already
    # finalised; this only looks at the stored total.
    has_activity = pr.notes.exists() or pr.raised_actions.exists()
    return not has_activity and (pr.duration or datetime.timedelta()) < REAL_DISCUSSION_MINIMUM


def close_stale_panel(panel, now):
    # The actual "abandon this meeting" mutation, shared by the backstop sweep
    # below (which can only ever catch this on someone else's unrelated page
    # load) and the live poll (inclusion_panel_meeting_activity_poll, which
    # can close it the instant STALE_PANEL_TIMEOUT elapses while a chair is
    # still watching the Panel Agenda page). Caller must have already checked
    # now - panel_last_activity_at(panel) > STALE_PANEL_TIMEOUT.
    for pr in panel.panel_referrals.filter(
        discussion_status='pending', discussion_started_at__isnull=False
    ):
        lifecycle.stop_discussion_timer(pr, now=now)
    # Same deferral as a manual End Panel Meeting - nothing left "Assigned" on
    # a panel nobody's coming back to.
    for pr in panel.panel_referrals.filter(discussion_status='pending', removed_at__isnull=True):
        lifecycle.defer(pr)
    if panel.chair_follows_default:
        panel.chair_id = panel.effective_chair_id
        panel.chair_follows_default = False
    panel.status = 'complete' if lifecycle.panel_had_any_discussion(panel) else 'void'
    panel.ended_at = now
    panel.auto_ended = True
    panel.save()


def reconcile_delayed_panels(now):
    # 'delayed' is computed, never set by hand: a panel that hasn't been
    # started and whose scheduled time has passed is delayed; if it's
    # rescheduled back into the future it reverts to draft. Completion stays a
    # manual-only action - this never touches 'ready'/'running'/'complete'.
    def scheduled_at(panel):
        return timezone.make_aware(
            datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
        )

    for panel in Panel.objects.filter(status__in=['draft', 'ready'], started_at__isnull=True):
        if scheduled_at(panel) < now:
            panel.status = 'delayed'
            panel.save(update_fields=['status'])
    for panel in Panel.objects.filter(status='delayed', started_at__isnull=True):
        if scheduled_at(panel) >= now:
            panel.status = 'draft'
            panel.save(update_fields=['status'])


def reconcile_stale_running_panels(now):
    # A running meeting with no scheduled end time can run forever if the
    # chair forgets to click End Panel Meeting, and there is no notification
    # or background-job infrastructure to proactively flag that. This
    # auto-completes a meeting once nothing has actually happened in it for
    # STALE_PANEL_TIMEOUT. It's the backstop for when a chair isn't on the
    # Panel Agenda page to see the live warning+poll - e.g. the browser's been
    # closed entirely - so a panel still gets caught eventually.
    #
    # The separate in-page "Running long" nudge is unrelated: earlier and
    # independent, based on elapsed time vs this group's typical duration
    # rather than on activity.
    for panel in Panel.objects.filter(status='running', started_at__isnull=False):
        if now - panel_last_activity_at(panel) > STALE_PANEL_TIMEOUT:
            close_stale_panel(panel, now)


def reconcile_stale_discussion_timers(now):
    # A single discussion left open when the chair moves on without clicking
    # End Discussion keeps accruing wall-clock time toward that referral's
    # duration stat, which the whole-meeting sweep above won't catch inside an
    # otherwise active meeting. Once STALE_DISCUSSION_TIMEOUT passes with no
    # note or action against this specific discussion, stop the timer and
    # resolve its outcome immediately rather than leaving it stuck 'pending'.
    for pr in PanelReferral.objects.filter(
        discussion_status='pending', discussion_started_at__isnull=False, removed_at__isnull=True,
    ):
        last_activity = discussion_last_activity_at(pr)
        if now - last_activity <= STALE_DISCUSSION_TIMEOUT:
            continue
        # Deliberately not lifecycle.stop_discussion_timer's default stop
        # instant. This sweep might not run again for a long time after the
        # cutoff, and none of that extra gap was real discussion time either -
        # stop at last_activity, so the counted duration reflects when the
        # discussion actually went quiet, not whenever some unrelated page
        # happened to load next.
        lifecycle._accrue_elapsed(pr, last_activity)
        pr.discussion_auto_stopped = True
        if _discussion_too_short_to_count(pr):
            pr.discussion_status = 'deferred'
            pr.follow_up_date = None
            pr.follow_up_status = ''
        else:
            # Real activity happened but the chair never got to answer "does
            # this need a follow-up review" (that only happens via the
            # explicit End Discussion dialog) - default to yes, since there's
            # no way to confirm the discussion reached a resolution. A short,
            # fixed interval rather than one of the longer presets: this is
            # flagging genuine uncertainty, not a scheduled review.
            pr.discussion_status = 'discussed'
            pr.follow_up_status = 'incomplete'
            pr.follow_up_date = timezone.localdate() + datetime.timedelta(days=7)
        pr.save()
        lifecycle.sync_referral_status(pr.referral)


def reconcile_panels(now=None):
    """Bring every time-based panel transition up to date.

    The single entry point. manage.py reconcile_panels calls it on a schedule;
    a test calls it with a fixed `now`. Views do not call it directly - they
    call reconcile_on_read() below, which is the same sweep behind a switch.
    """
    now = now or timezone.now()
    reconcile_delayed_panels(now)
    reconcile_stale_running_panels(now)
    reconcile_stale_discussion_timers(now)


def reconcile_on_read(now=None):
    """The sweep as a *view* performs it: on a read, and only if enabled.

    Same work as reconcile_panels, reached by the one path that had no way to
    opt out. The six view call sites passed no arguments, so the module built
    to take an injected clock was, from a view, driven by the real one and
    impossible to hold still - which made any panel status unobservable
    through the view that changed it. A POST could set a status correctly and
    the sweep would overwrite it before the response was built, inside the
    same request, and the test asserting on it would blame the dispatch.

    Two adapters, chosen by PANEL_RECONCILE_ON_READ: the real sweep in
    production (a dev machine has no scheduler, so reads are the only thing
    keeping meetings going stale - see ADR 0019), and nothing at all under
    test, where time passing is not what is being exercised. A test that does
    want a transition calls reconcile_panels(now=...) directly with a fixed
    clock, which is what tests/test_reconcile.py has always done.

    This is the line ADR 0019 earmarked for deletion, now with a name and one
    place to turn off: a deployment that gains a scheduler drops the setting
    and the six calls together.
    """
    if not getattr(settings, 'PANEL_RECONCILE_ON_READ', True):
        return
    reconcile_panels(now=now)
