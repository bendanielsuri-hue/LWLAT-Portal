"""The referral state machine: what a referral's status *is*, and every
transition allowed to change it.

Previously these were underscore-private functions inside views.py, which had
two costs. Nothing outside that module could reach them - a seed command, the
admin, or another hub wanting to close a referral had to import a view module
that pulls in django.shortcuts, sixteen models and a templatetag. And the
central invariant, "recompute InclusionReferral.status after any PanelReferral
add/remove/discuss", was carried by eleven separate call sites remembering to
call _sync_referral_status themselves, enforced only by a sentence in
CLAUDE.md. A twelfth mutation path that forgot it would leave a referral's
status silently disagreeing with its own rows, with nothing to catch it.

So the mutations below are verbs that resync as part of the act, rather than a
mutation plus a reminder. sync_referral_status stays public because two paths
legitimately need it directly (a caller that has already changed several rows
in a loop, and the tests), but no caller of the verbs needs to know it exists.

`now` is a parameter on everything that reads the clock, so a test can pass a
fixed instant - see reconcile.py, which is the other half of this split and
depends on that.
"""

import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone

from core.models import Referral as CoreReferral

from .models import InclusionReferral, PanelReferral

# A panel that's finished, whether it reached that point with a real
# discussion ('complete') or not ('void') - see Panel.STATUS_CHOICES
# (models.py) for what each means. Shared by every "is this meeting still
# editable" check (agenda_readonly and its server-side twins on reorder/
# move/unassign/update_priority) so they can't drift out of sync.
PANEL_ENDED_STATUSES = ('complete', 'void')


def panel_is_ended(panel):
    return panel.status in PANEL_ENDED_STATUSES


def panel_had_any_discussion(panel):
    # Whether this panel is worth keeping as a real completed meeting -
    # 'discussed' is only ever set by actually running a discussion, so a
    # panel with none is one that ended without a single referral being
    # discussed. Used by both end paths (end_panel_meeting in views.py, and
    # reconcile.close_stale_panel) to decide 'complete' vs 'void'.
    return panel.panel_referrals.filter(
        removed_at__isnull=True, discussion_status='discussed'
    ).exists()


def stage(pr):
    # This PanelReferral's progress through its own panel - distinct from
    # InclusionReferral.status, which aggregates across every panel a referral
    # has ever been attached to (see sync_referral_status below).
    if pr.discussion_status == 'pending':
        if pr.discussion_started_at:
            return 'discussing', 'Discussing'
        return 'assigned', 'Assigned'
    if pr.discussion_status == 'deferred':
        return 'deferred', 'Deferred'
    if pr.follow_up_status == 'incomplete':
        return 'requires_follow_up', 'Needs Review'
    return 'complete', 'Complete'


def is_last_open_review(pr):
    # Whether cancelling *this* PanelReferral's follow-up would close the
    # whole referral - true only when every other active (non-deferred) row
    # for the same referral is already 'complete'. Drives the Discussed row's
    # dynamic Close Referral/Cancel Review button (#111): a referral can have
    # more than one active row over its life (this discussion plus a
    # separately-scheduled follow-up review elsewhere), so cancelling one
    # row's follow-up doesn't always close the referral.
    other_active = pr.referral.panel_referrals.filter(
        removed_at__isnull=True,
    ).exclude(pk=pr.pk).exclude(discussion_status='deferred')
    return all(stage(other)[0] == 'complete' for other in other_active)


def _accrue_elapsed(pr, stop_at):
    """Fold a running timer's elapsed time into the stored duration.

    Shared by every path that stops a discussion clock. `stop_at` is the
    instant the discussion is treated as having gone quiet, which is NOT
    always now: reconcile.reconcile_stale_discussion_timers stops at the last
    real activity instead, since the gap between that and whenever the sweep
    happened to run was not discussion time either.
    """
    if not pr.discussion_started_at:
        return
    pr.duration = (pr.duration or datetime.timedelta()) + (stop_at - pr.discussion_started_at)
    pr.discussion_started_at = None


def stop_discussion_timer(pr, now=None):
    # Stops a running timer without marking the referral as discussed - used
    # when another referral's discussion starts (only one runs at a time) and
    # when a panel meeting ends, so no timer is left silently accruing.
    if pr.discussion_started_at:
        _accrue_elapsed(pr, now or timezone.now())
        pr.save()


def mark_discussed(pr, requires_followup, follow_up_date, now=None):
    # The End Discussion transition: stop the timer, close out
    # discussion_status, set/clear the follow-up, and resync the parent
    # referral's aggregate status.
    #
    # reconcile._discussion_too_short_to_count's <1-minute "was this a real
    # discussion" check deliberately does NOT apply here - that's only for the
    # automatic 30-minute abandonment timeout. A chair who explicitly confirms
    # End Discussion has already said this was real, however brief.
    _accrue_elapsed(pr, now or timezone.now())
    pr.discussion_status = 'discussed'
    if requires_followup:
        pr.follow_up_date = follow_up_date
        pr.follow_up_status = 'incomplete'
    else:
        pr.follow_up_date = None
        pr.follow_up_status = ''
    pr.save()
    sync_referral_status(pr.referral)


def defer(pr):
    # A referral the meeting never reached. The row is kept rather than
    # removed so this panel's own history still shows it was queued but not
    # discussed; stage()/sync_referral_status() both treat 'deferred' as
    # non-blocking, so the referral becomes pickable again for a future panel
    # without needing removed_at. Used by both end paths.
    pr.discussion_status = 'deferred'
    pr.save(update_fields=['discussion_status'])
    sync_referral_status(pr.referral)


def remove_from_agenda(pr, removed_by_id, now=None):
    # Shared by Panel Agenda Setup and the live Panel Agenda page's own
    # remove/unassign actions - both retire a PanelReferral off the agenda the
    # same way, they only differ on when it's still allowed (see each call
    # site's own guard: discussion_status pre-meeting, panel_is_ended once
    # live).
    pr.removed_at = now or timezone.now()
    pr.removed_by_id = removed_by_id
    pr.save()
    sync_referral_status(pr.referral)


def set_referral_priority(referral_id, priority):
    # Shared by Panel Agenda Setup and the live Panel Agenda page's own
    # 'update_priority' actions so the valid-choices check can't drift.
    referral = get_object_or_404(InclusionReferral, pk=referral_id)
    if priority == '' or priority in dict(InclusionReferral.PRIORITY_CHOICES):
        referral.priority = priority
        referral.save()


def reorder_panel_referrals(panel, ordered_ids):
    # Shared by Panel Agenda Setup and the live Panel Agenda page's own
    # 'reorder_agenda' actions - both persist a full drag-and-drop reorder of
    # the given PanelReferral ids the same way, they only differ on whether
    # reordering is still allowed (see panel_is_ended at each call site).
    referrals = {pr.id: pr for pr in PanelReferral.objects.filter(panel=panel, pk__in=ordered_ids)}
    updated = []
    for index, pr_id in enumerate(ordered_ids, start=1):
        pr = referrals.get(int(pr_id))
        if pr is not None:
            pr.agenda_order = index
            updated.append(pr)
    PanelReferral.objects.bulk_update(updated, ['agenda_order'])


def sync_referral_status(referral, today=None):
    """Recompute InclusionReferral.status from its PanelReferral rows.

    Every mutation verb above already calls this. Call it directly only when
    you've changed rows without going through one (a bulk loop, a data repair)
    - a new mutation path should become a verb here instead.
    """
    # Status reflects the aggregate state across every panel this referral is
    # currently attached to, since the same referral can be picked up by more
    # than one panel over time (e.g. a follow-up panel). 'deferred' rows are
    # kept for that panel's own history but never block status computation - a
    # referral whose only remaining active rows are all deferred should read
    # as available again (falls through to 'open').
    today = today or timezone.localdate()
    active_prs = list(
        referral.panel_referrals.filter(removed_at__isnull=True).exclude(discussion_status='deferred')
    )
    stages = [stage(pr)[0] for pr in active_prs]
    if not active_prs:
        new_status = 'open'
    elif 'discussing' in stages:
        # Actually being discussed right now, regardless of any older
        # discussed/follow-up-due entries also still attached - the most
        # current fact about the referral always wins.
        new_status = 'discussing'
    elif 'assigned' in stages:
        new_status = 'assigned'
    elif all(s == 'complete' for s in stages):
        new_status = 'closed'
    else:
        # Discussed before, follow-up due, but not currently on any agenda -
        # the Reviews Due queue, tiered by how close the most urgent
        # (earliest) due date is.
        due_dates = [
            pr.follow_up_date for pr, s in zip(active_prs, stages)
            if s == 'requires_follow_up' and pr.follow_up_date
        ]
        if due_dates:
            days_until_due = (min(due_dates) - today).days
            if days_until_due > 7:
                new_status = 'review_scheduled'
            elif days_until_due >= -7:
                new_status = 'awaiting_review'
            else:
                new_status = 'overdue_review'
        else:
            new_status = 'awaiting_review'
    if referral.status != new_status:
        referral.status = new_status
        referral.save(update_fields=['status'])
    # Keep the coarse cross-type core.Referral.status (open/closed) projected
    # from the richer Inclusion-specific status - see core.models.Referral.
    base_status = CoreReferral.STATUS_CLOSED if new_status == 'closed' else CoreReferral.STATUS_OPEN
    if referral.referral.status != base_status:
        referral.referral.status = base_status
        referral.referral.save(update_fields=['status'])
    return new_status
