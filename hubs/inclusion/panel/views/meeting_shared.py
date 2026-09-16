"""Panel-meeting helpers shared by the meetings, agenda and escalations modules.

Attendance and the agenda are each driven from two pages at once - the live
Panel Agenda shares attendance with the Attendance dialog and agenda ordering
with Panel Agenda Setup - so these helpers sit below both rather than in either,
which is also what keeps meetings.py and agenda.py from importing each other.
"""

import datetime

from django.db.models import Avg, Max
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core.identity import current_staff as _current_staff

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import form_actions
from ..models import Panel, PanelGroup, PanelGroupMember, PanelMember, PanelReferral

def _mat_panel_group():
    # The one PanelGroup a MAT Panel Meeting belongs to - see
    # PanelGroup.is_mat_wide and CONTEXT.md's MAT Panel Meeting entry. None
    # if it hasn't been seeded yet (see seed_panel_groups).
    return PanelGroup.objects.filter(is_mat_wide=True, is_active=True).first()


def _mat_panel_running(exclude=None):
    # Only one MAT Panel Meeting may be `running` at a time - see CONTEXT.md.
    # School Panels have no equivalent limit.
    qs = Panel.objects.filter(panel_group__is_mat_wide=True, status='running')
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    return qs.first()


def _panel_member_roster(panel):
    # "Who's on this panel" - one roster (PanelGroupMember), not a per-meeting
    # copy. For a completed panel this instead returns only members who
    # actually checked in (via PanelMember, the frozen historical record),
    # since the live group roster may have changed since - a finished
    # meeting's attendance shouldn't retroactively change. Every other
    # status shows the live active roster, each annotated with its
    # checked_in_at/left_at (None until they check in during the meeting).
    if not panel.panel_group_id:
        return []

    if panel.status == 'complete':
        attendance = PanelMember.objects.filter(panel=panel, checked_in_at__isnull=False).select_related(
            'panel_group_member__staff__school', 'panel_group_member__external_contact', 'panel_group_member__expertise'
        )
        members = []
        for pm in attendance:
            gm = pm.panel_group_member
            gm.checked_in_at = pm.checked_in_at
            gm.left_at = pm.left_at
            members.append(gm)
    else:
        members = list(
            panel.panel_group.members.filter(is_active=True)
            .select_related('staff__school', 'external_contact', 'expertise')
        )
        attendance_by_member_id = {
            pm.panel_group_member_id: pm
            for pm in PanelMember.objects.filter(panel=panel, panel_group_member__in=members)
        }
        for gm in members:
            pm = attendance_by_member_id.get(gm.id)
            gm.checked_in_at = pm.checked_in_at if pm else None
            gm.left_at = pm.left_at if pm else None

    for gm in members:
        gm.member_type = ('MAT' if gm.staff.is_mat_staff else 'School') if gm.staff_id else 'External'
    return members


def _is_group_member(staff, panel):
    # The precondition for start_meeting (#60 + the attendance-stage
    # follow-up): only someone who is themself an active member of this
    # panel's group can start it - and since clicking Start auto-checks
    # them in (see start_meeting below), this alone is the whole gate.
    # There's no separate "at least one checked in" check anymore because
    # a successful click always produces one.
    if staff is None or not panel.panel_group_id:
        return False
    return PanelGroupMember.objects.filter(panel_group_id=panel.panel_group_id, staff=staff, is_active=True).exists()


def _apply_attendance_action(request, panel, action):
    # The four Attendance-dialog mutations (reschedule/check-in/mark-left/
    # start), factored out so both the full-page Panel Agenda dialog
    # (inclusion_panel_meeting_agenda) and the AJAX one opened from the
    # Panel Meetings list (inclusion_panel_meeting_attendance) share one
    # implementation rather than re-deriving these rules twice (ENG-S1).
    if action == form_actions.START_MEETING:
        starter = _current_staff(request)
        # Only one MAT Panel Meeting may run at a time - see CONTEXT.md.
        # School Panels have no equivalent limit, so this only ever blocks
        # when panel.panel_group is the MAT-wide group.
        mat_blocked = (
            panel.panel_group_id and panel.panel_group.is_mat_wide
            and _mat_panel_running(exclude=panel) is not None
        )
        if (
            panel.status not in ('running', 'complete', 'void')
            and panel.panel_referrals.filter(removed_at__isnull=True).exists()
            and _is_group_member(starter, panel)
            and not mat_blocked
        ):
            starter_gm = PanelGroupMember.objects.get(panel_group_id=panel.panel_group_id, staff=starter, is_active=True)
            now = timezone.now()
            PanelMember.objects.update_or_create(
                panel=panel, panel_group_member=starter_gm,
                defaults={'checked_in_at': now, 'left_at': None},
            )
            panel.started_at = now
            panel.date = timezone.localdate(now)
            panel.time = timezone.localtime(now).time()
            panel.status = 'running'
            panel.save()
    elif action == form_actions.RESCHEDULE_TO_NOW:
        if panel.status not in ('running', 'complete'):
            now = timezone.now()
            panel.date = timezone.localdate(now)
            panel.time = timezone.localtime(now).time()
            panel.save(update_fields=['date', 'time'])
    elif action == form_actions.CHECK_IN:
        gm = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group_id=panel.panel_group_id)
        PanelMember.objects.update_or_create(
            panel=panel, panel_group_member=gm,
            defaults={'checked_in_at': timezone.now(), 'left_at': None},
        )
    elif action == form_actions.MARK_LEFT:
        gm = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group_id=panel.panel_group_id)
        PanelMember.objects.filter(panel=panel, panel_group_member=gm).update(left_at=timezone.now())


def _attendance_dialog_context(panel):
    scheduled_at = timezone.make_aware(
        datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
    )
    members = _panel_member_roster(panel)
    return {
        'panel': panel,
        'show_schedule_warning': panel.status not in ('running', 'complete') and timezone.now() < scheduled_at,
        'members': members,
        'checked_in_count': sum(1 for m in members if m.checked_in_at),
    }


def _next_agenda_order(panel):
    # New agenda additions always land at the end of the manually-ordered list,
    # regardless of which action created them (Panel Agenda Setup's Add, a pulled-in
    # follow-up, etc.) — see PanelReferral.agenda_order.
    return (panel.panel_referrals.aggregate(Max('agenda_order'))['agenda_order__max'] or 0) + 1


def _move_agenda_referral(siblings, pr_id, direction):
    # Swaps agenda_order with the adjacent sibling in the given (already
    # agenda_order-sorted) list — the click-based fallback for the drag
    # handle's reordering, e.g. for keyboard-only use.
    siblings = list(siblings)
    idx = next((i for i, s in enumerate(siblings) if str(s.id) == str(pr_id)), None)
    if idx is None:
        return
    swap_idx = idx - 1 if direction == 'up' else idx + 1
    if 0 <= swap_idx < len(siblings):
        a, b = siblings[idx], siblings[swap_idx]
        a.agenda_order, b.agenda_order = b.agenda_order, a.agenda_order
        PanelReferral.objects.bulk_update([a, b], ['agenda_order'])


def _estimated_discussion_durations(referral_ids):
    """Per-referral expected discussion length for the agenda (#244).

    Own history first: if this referral (the same InclusionReferral, possibly
    discussed at more than one past Panel) has past discussions with a
    recorded duration, average those - a review_scheduled follow-up coming
    back is the case where its own history is the honest predictor. A
    referral with none of its own falls back to one shared average across
    every past discussion in the app. Either average excludes rows with no
    recorded duration entirely, rather than counting a missing duration as
    zero - a discussion that was never timed is absence of data, not a
    zero-length discussion.

    Returns {referral_id: (estimate_or_None, source)} where source is 'own'
    or 'group' - callers surface which one produced a number so a chair can
    judge an estimate drawn from this referral's own single prior discussion
    differently from one drawn from the whole corpus. (None, None) means
    there is no history anywhere yet to estimate from.
    """
    referral_ids = list(referral_ids)
    own_by_referral = dict(
        PanelReferral.objects.filter(
            referral_id__in=referral_ids, discussion_status='discussed', duration__isnull=False,
        ).values('referral_id').annotate(avg_duration=Avg('duration')).values_list('referral_id', 'avg_duration')
    )

    group_average = None
    if any(rid not in own_by_referral for rid in referral_ids):
        group_average = PanelReferral.objects.filter(
            discussion_status='discussed', duration__isnull=False,
        ).aggregate(avg_duration=Avg('duration'))['avg_duration']

    estimates = {}
    for rid in referral_ids:
        if rid in own_by_referral:
            estimates[rid] = (own_by_referral[rid], 'own')
        elif group_average:
            estimates[rid] = (group_average, 'group')
        else:
            estimates[rid] = (None, None)
    return estimates


def _due_followups(panel, as_of=None):
    # Scoped to the referral's student's current school (#70), not the one
    # group that originally discussed it - any active Panel Group at that
    # school may pick up a due follow-up, matching how the unassigned pool
    # (see unassigned_referrals below) already works. Nothing here is frozen
    # at discussion time, so a student who transfers schools carries their
    # due follow-up to the new school with them for free. A MAT-wide group
    # (school_id None) or an ungrouped panel has no single school to scope
    # by, so - same as before - it sees nothing due; a real MAT-wide
    # follow-up flow needs its own design once there's an actual MAT Meeting
    # use case, not guessed at here.
    # as_of defaults to today (live Agenda page); Panel Agenda Setup passes a
    # forward-looking date since setup happens ahead of the meeting.
    if panel.panel_group_id is None or panel.panel_group.school_id is None:
        return PanelReferral.objects.none()
    return PanelReferral.objects.filter(
        follow_up_status='incomplete',
        follow_up_date__lte=as_of or timezone.localdate(),
        removed_at__isnull=True,
        referral__student__school_id=panel.panel_group.school_id,
    ).select_related('referral__student', 'referral__raised_by', 'panel__panel_group').order_by('-panel__date')
