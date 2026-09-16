"""The two agenda pages: Panel Agenda Setup, and the live Panel Agenda.

Both are large single views driving a drag-and-drop board, and they are the same
page at two moments in a meeting's life - deciding the agenda before it starts,
and working through it once it has - so they are read together and kept
together. Their shared mutations live in meeting_shared.py and lifecycle.py.
"""

import datetime
from collections import Counter

from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone

from core.identity import current_staff as _current_staff
from core.term_dates import next_half_term, next_term

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import form_actions, lifecycle, presenters, reconcile
from ..models import Escalation, InclusionReferral, Panel, PanelGroup, PanelReferral

from .base import _panel_base_context
from .shared import _review_label, visible_actions_for
from .meeting_shared import (
    _apply_attendance_action,
    _due_followups,
    _estimated_discussion_durations,
    _is_group_member,
    _mat_panel_running,
    _move_agenda_referral,
    _next_agenda_order,
    _panel_member_roster,
)


def _annotate_estimated_durations(prs):
    """Sets `estimated_duration`/`estimated_duration_source`/`estimated_duration_display`
    on each still-to-discuss PanelReferral, and returns (total_display, total_count) - the
    running total a chair reads to see whether today's agenda is realistically over-booked
    before starting the meeting (#244). `total_count` only counts rows an estimate could
    actually be produced for, so a handful of never-estimated rows don't silently understate
    the total by being folded in as zero.
    """
    prs = list(prs)
    estimates = _estimated_discussion_durations(pr.referral_id for pr in prs)
    total = datetime.timedelta()
    total_count = 0
    for pr in prs:
        pr.estimated_duration, pr.estimated_duration_source = estimates[pr.referral_id]
        pr.estimated_duration_display = presenters.short_duration(pr.estimated_duration)
        if pr.estimated_duration:
            total += pr.estimated_duration
            total_count += 1
    return (presenters.short_duration(total) if total_count else None), total_count


def inclusion_panel_meeting_setup(request, panel_id):
    reconcile.reconcile_on_read()
    panel = get_object_or_404(Panel, pk=panel_id)

    # 'closed' means fully handled - no outstanding action, no follow-up due
    # (that's a distinct status; see the Reviews Due / followups_due queue
    # below). A closed referral not currently on an active agenda must not
    # resurface as a "New Referral" - it isn't new, it's finished.
    unassigned_referrals = InclusionReferral.objects.select_related('student', 'raised_by').exclude(
        pk__in=PanelReferral.objects.filter(removed_at__isnull=True)
        .exclude(discussion_status='deferred')
        .values_list('referral_id', flat=True)
    ).exclude(status='closed').prefetch_related('responses__question__category')
    if panel.panel_group_id and panel.panel_group.is_mat_wide:
        # A MAT Panel Meeting's agenda may only ever contain referrals with
        # an open Escalation, MAT-wide rather than school-scoped - see
        # CONTEXT.md's MAT Panel Meeting entry. Replaces the school-scoped
        # filter below rather than skipping it, since panel_group.school_id
        # is None for the MAT group and would otherwise leave this list
        # completely unfiltered.
        unassigned_referrals = unassigned_referrals.filter(escalations__status='open').distinct()
    elif panel.panel_group_id and panel.panel_group.school_id:
        unassigned_referrals = unassigned_referrals.filter(student__school_id=panel.panel_group.school_id)

    agenda = panel.panel_referrals.filter(removed_at__isnull=True).select_related(
        'referral__student', 'referral__raised_by'
    ).prefetch_related('referral__responses__question__category').order_by('agenda_order', 'id')

    agenda_student_ids = [a.referral.student_id for a in agenda]
    followups_due = list(_due_followups(
        panel, as_of=panel.date + datetime.timedelta(days=7),
    ).exclude(referral__student_id__in=agenda_student_ids))
    # A referral can now surface a due follow-up from more than one Panel
    # Group at the same school (previously impossible when this was locked
    # to a single group's own history, see #70) - already ordered by
    # -panel__date, so keeping only the first occurrence per referral keeps
    # the most recently discussed one and Reviews Due never lists the same
    # referral twice.
    seen_followup_referral_ids = set()
    deduped_followups_due = []
    for fpr in followups_due:
        if fpr.referral_id in seen_followup_referral_ids:
            continue
        seen_followup_referral_ids.add(fpr.referral_id)
        deduped_followups_due.append(fpr)
    followups_due = deduped_followups_due

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == form_actions.UPDATE_CHAIR:
            # Deliberately its own narrow action rather than routing
            # through Panel.update_details() - that method unconditionally
            # overwrites time/panel_group_id too (fine when a shared Save
            # button submits all of them together, as
            # inclusion_panel_meeting_new's edit-mode POST does), which
            # would silently wipe them here since Chair is the one field
            # in this dialog's summary still submitted on its own, standalone
            # from Date/Time/Panel Group's Edit dialog.
            chair_value = request.POST.get('chair') or ''
            panel.chair_follows_default = (chair_value == 'default')
            panel.chair_id = None if chair_value in ('', 'default') else chair_value
            panel.save(update_fields=['chair_id', 'chair_follows_default'])
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action in (form_actions.ADD_REFERRAL, form_actions.ADD_FOLLOWUP_TO_AGENDA):
            referral_id = request.POST.get('referral_id')
            pr = None
            if referral_id:
                pr, created = PanelReferral.objects.get_or_create(panel=panel, referral_id=referral_id)
                if created:
                    pr.agenda_order = _next_agenda_order(panel)
                    pr.save()
                elif pr.removed_at is not None:
                    pr.removed_at = None
                    pr.removed_by = None
                    pr.agenda_order = _next_agenda_order(panel)
                    pr.save()
                lifecycle.sync_referral_status(pr.referral)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                # panel_referral_id lets the drag-and-drop client follow up
                # with a reorder_agenda call to place the new row where the
                # user actually dropped it, rather than always at the bottom.
                return JsonResponse({'success': True, 'panel_referral_id': pr.id if pr else None})
        elif action == form_actions.REMOVE_REFERRAL_FROM_AGENDA:
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            # Already-discussed or deferred referrals are a historical
            # record of this meeting, not agenda composition - removing one
            # here would silently drop it from the meeting's own history
            # (and, for a deferred one, double up with the unassigned-pool
            # availability that deferring it already granted). Only a still-
            # pending referral can be taken back off the agenda.
            if pr.discussion_status not in ('discussed', 'deferred'):
                lifecycle.remove_from_agenda(pr, request.POST.get('removed_by') or None)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action == form_actions.UPDATE_PRIORITY:
            lifecycle.set_referral_priority(request.POST.get('referral_id'), request.POST.get('priority', ''))
        elif action == form_actions.REORDER_AGENDA:
            lifecycle.reorder_panel_referrals(panel, request.POST.getlist('panel_referral_id'))
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action == form_actions.MOVE_AGENDA_REFERRAL:
            _move_agenda_referral(agenda, request.POST.get('panel_referral_id'), request.POST.get('direction'))
        elif action == form_actions.TOGGLE_READY:
            if panel.status == 'draft':
                panel.status = 'ready'
            elif panel.status == 'ready':
                panel.status = 'draft'
            panel.save()
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': True, 'status': panel.status, 'status_display': panel.get_status_display(),
                })
        return redirect('inclusion_panel_meeting_setup', panel_id=panel.id)

    current_staff = _current_staff(request)

    # Referral Selection's "All" tab merges New Referrals and Reviews Due
    # into one list - each entry tagged with its origin so the shared row
    # partial knows which pill/fields/add-action to use.
    new_entries = [
        {
            'referral': referral, 'origin': 'new',
            'follow_up_date': None, 'last_discussed': None, 'last_discussed_group': None,
            'actions_total': None, 'actions_complete': None,
        }
        for referral in unassigned_referrals
    ]

    today = timezone.localdate()
    followup_entries = []
    for fpr in followups_due:
        actions_qs = visible_actions_for(current_staff, fpr.referral.actions.all())
        status_counts = Counter(actions_qs.values_list('status', flat=True))
        actions_total = status_counts['complete'] + status_counts['incomplete']
        discussed_count = fpr.referral.panel_referrals.filter(
            removed_at__isnull=True, discussion_status='discussed',
        ).count()
        followup_entries.append({
            'referral': fpr.referral, 'origin': 'followup',
            'follow_up_date': fpr.follow_up_date, 'last_discussed': fpr.panel.date,
            'follow_up_overdue': bool(fpr.follow_up_date and fpr.follow_up_date < today),
            'review_label': _review_label(discussed_count),
            'actions_total': actions_total, 'actions_complete': status_counts['complete'],
            # Only set when it's a *different* group than the one composing
            # this agenda - a follow-up can now be picked up by any group at
            # the student's school (#70), so the chair needs to know it has
            # history elsewhere before walking in cold.
            'last_discussed_group': (
                fpr.panel.panel_group.name
                if fpr.panel.panel_group_id and fpr.panel.panel_group_id != panel.panel_group_id
                else None
            ),
        })

    referral_selection_entries = new_entries + followup_entries

    def _entry_sort_key(entry):
        student = entry['referral'].student
        return (student.last_name.lower(), student.first_name.lower())

    new_entries.sort(key=_entry_sort_key)
    followup_entries.sort(key=_entry_sort_key)
    referral_selection_entries.sort(key=_entry_sort_key)

    # Surfaces when the same student has more than one open referral in this
    # list (no uniqueness constraint on InclusionReferral.student - two staff
    # can genuinely raise separate referrals for the same student) so it's
    # noticed before adding just one to the agenda, without attempting to
    # merge/combine them for discussion.
    student_counts = Counter(e['referral'].student_id for e in referral_selection_entries)
    for entry in referral_selection_entries:
        entry['other_referrals_count'] = student_counts[entry['referral'].student_id] - 1

    # For an agenda referral that's been discussed before (e.g. pulled in from
    # a due follow-up), show when - one query for every agenda row rather than
    # one per row: order by panel date descending and keep only the first
    # (most recent) PanelReferral per referral_id.
    last_discussed_by_referral = {}
    discussed_counts_by_referral = Counter()
    for prev in PanelReferral.objects.filter(
        referral_id__in=[pr.referral_id for pr in agenda], discussion_status='discussed',
    ).exclude(panel_id=panel.id).select_related('panel').order_by('referral_id', '-panel__date'):
        last_discussed_by_referral.setdefault(prev.referral_id, prev)
        discussed_counts_by_referral[prev.referral_id] += 1
    for pr in agenda:
        prev_pr = last_discussed_by_referral.get(pr.referral_id)
        pr.last_discussed_panel = prev_pr.panel if prev_pr else None
        pr.follow_up_date = prev_pr.follow_up_date if prev_pr else None
        pr.follow_up_overdue = bool(pr.follow_up_date and pr.follow_up_date < today)
        pr.review_label = _review_label(discussed_counts_by_referral[pr.referral_id])
        pr.actions_total = None
        pr.actions_complete = None
        if pr.last_discussed_panel:
            actions_qs = visible_actions_for(current_staff, pr.referral.actions.all())
            status_counts = Counter(actions_qs.values_list('status', flat=True))
            pr.actions_total = status_counts['complete'] + status_counts['incomplete']
            pr.actions_complete = status_counts['complete']

    agenda_estimated_total, agenda_estimated_count = _annotate_estimated_durations(agenda)

    # The Members section mirrors the Panel Group's live roster directly -
    # not a per-meeting snapshot - so it's always in sync with whatever the
    # "Edit" button's group modal shows, with no separate sync step needed.
    # Only meaningful once a group is assigned (same "Assign a Panel Group
    # first" gate the Edit button itself already applies).
    members = []
    if panel.panel_group_id:
        members = list(
            panel.panel_group.members.select_related('staff__school', 'external_contact', 'expertise')
            .order_by('staff__last_name', 'external_contact__name')
        )
    for member in members:
        if member.staff_id:
            member.member_type = 'MAT' if member.staff.is_mat_staff else 'School'
        else:
            member.member_type = 'External'
    active_members = [m for m in members if m.is_active]
    inactive_members = [m for m in members if not m.is_active]

    panel_groups = PanelGroup.objects.filter(is_active=True).select_related('school')
    if panel.panel_group_id and panel.panel_group.school_id:
        panel_groups = panel_groups.filter(school_id=panel.panel_group.school_id)

    return render(request, 'hubs/inclusion/panel/meeting_setup.html', {
        **_panel_base_context(request),
        'panel': panel,
        'panel_groups': panel_groups,
        'active_members': active_members,
        'inactive_members': inactive_members,
        'unassigned_referrals': unassigned_referrals,
        'agenda': agenda,
        'followups_due': followups_due,
        'new_entries': new_entries,
        'followup_entries': followup_entries,
        'referral_selection_entries': referral_selection_entries,
        'priority_choices': InclusionReferral.PRIORITY_CHOICES,
        'agenda_estimated_total': agenda_estimated_total,
        'agenda_estimated_count': agenda_estimated_count,
    })


def inclusion_panel_meeting_agenda(request, panel_id):
    reconcile.reconcile_on_read()
    panel = get_object_or_404(Panel, pk=panel_id)
    today = timezone.localdate()

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action in (
            form_actions.START_MEETING, form_actions.RESCHEDULE_TO_NOW,
            form_actions.CHECK_IN, form_actions.MARK_LEFT,
        ):
            # Shared with the AJAX Attendance dialog opened from the Panel
            # Meetings list (inclusion_panel_meeting_attendance) - see
            # _apply_attendance_action. Checked against panel.status, not
            # just started_at is None - some seeded historical panels are
            # created directly as 'complete' without ever populating
            # started_at/ended_at, and status is the authoritative field for
            # "can this be (re)started". An empty agenda is blocked here too
            # (not just in the template) so a meeting can never reach
            # 'running' with nothing on it to discuss - see agenda_is_empty
            # below for the UI-side mirror.
            _apply_attendance_action(request, panel, action)
        elif action == form_actions.UNASSIGN_REFERRAL:
            # Removing from the agenda, like reorder above, only makes sense
            # pre-meeting-end - the corner Remove button is already hidden
            # once agenda_readonly (meeting_agenda.html), this is the same
            # server-side twin.
            removed = not lifecycle.panel_is_ended(panel)
            if removed:
                pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
                lifecycle.remove_from_agenda(pr, request.POST.get('removed_by') or None)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': removed})
        elif action == form_actions.UPDATE_PRIORITY:
            if not lifecycle.panel_is_ended(panel):
                lifecycle.set_referral_priority(request.POST.get('referral_id'), request.POST.get('priority', ''))
        elif action == form_actions.UPDATE_REVIEW_DATE:
            # Not gated on follow_up_status already being 'incomplete' -
            # setting/rescheduling a date always (re)activates the follow-up
            # (#111). This is also how a Complete row's Schedule Review
            # button reopens it in one motion, not just how an already-open
            # row's Change edits its date.
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            raw_date = request.POST.get('follow_up_date')
            try:
                new_date = datetime.date.fromisoformat(raw_date) if raw_date else None
            except ValueError:
                pass
            else:
                pr.follow_up_date = new_date
                if new_date:
                    pr.follow_up_status = 'incomplete'
                pr.save(update_fields=['follow_up_date', 'follow_up_status'])
                lifecycle.sync_referral_status(pr.referral)
        elif action == form_actions.CANCEL_FOLLOWUP:
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            pr.follow_up_date = None
            pr.follow_up_status = ''
            pr.save(update_fields=['follow_up_date', 'follow_up_status'])
            lifecycle.sync_referral_status(pr.referral)
        elif action == form_actions.REORDER_AGENDA:
            # Reordering only makes sense while the meeting's still live - the
            # UI already hides drag/up-down once agenda_readonly (see
            # meeting_agenda.html), this is the same gate server-side so a
            # stale page open in another tab can't sneak a reorder through
            # after the meeting's ended.
            if not lifecycle.panel_is_ended(panel):
                lifecycle.reorder_panel_referrals(panel, request.POST.getlist('panel_referral_id'))
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': not lifecycle.panel_is_ended(panel)})
        elif action == form_actions.MOVE_AGENDA_REFERRAL:
            if not lifecycle.panel_is_ended(panel):
                pending_siblings = panel.panel_referrals.filter(
                    removed_at__isnull=True, discussion_status='pending'
                ).order_by('agenda_order', 'id')
                _move_agenda_referral(pending_siblings, request.POST.get('panel_referral_id'), request.POST.get('direction'))
        elif action == form_actions.END_PANEL_MEETING:
            # Freeze whatever chair this panel was following into a plain
            # snapshot before completing it - a completed panel's chair is a
            # historical record and must not keep moving if the group's
            # default_chair changes later (same reasoning as _panel_member_roster
            # only trusting checked-in PanelMember rows once complete).
            if panel.chair_follows_default:
                panel.chair_id = panel.effective_chair_id
                panel.chair_follows_default = False
            for pr in panel.panel_referrals.filter(discussion_status='pending', discussion_started_at__isnull=False):
                lifecycle.stop_discussion_timer(pr)
            # Anything still pending (started-and-abandoned or never reached)
            # didn't get discussed before the meeting ended - defer it back
            # to the unassigned pool for a future panel rather than leaving
            # it stuck showing "Assigned" on a panel that's now complete
            # and can never be resumed. See
            # PanelReferral.DISCUSSION_CHOICES for why this isn't just Remove.
            for pr in panel.panel_referrals.filter(discussion_status='pending', removed_at__isnull=True):
                pr.discussion_status = 'deferred'
                pr.save(update_fields=['discussion_status'])
                lifecycle.sync_referral_status(pr.referral)
            # Decided after deferring (deferring never touches an already-
            # 'discussed' row) so a meeting ending with nothing discussed
            # goes to 'void' instead of joining real meeting history - see
            # _panel_had_any_discussion.
            panel.status = 'complete' if lifecycle.panel_had_any_discussion(panel) else 'void'
            panel.ended_at = timezone.now()
            panel.save()
            return redirect('inclusion_panel_meetings')
        elif action == form_actions.START_DISCUSSION:
            # The only place a discussion timer is allowed to start/resume -
            # opening the Discussion page itself (a GET, e.g. from Referral
            # Details' "View Discussion Page" link, a refresh, or browser
            # back/forward) must never mutate state, only display it. This
            # requires the panel to actually be started, matching the
            # Pending list's own "Discuss" button being disabled otherwise.
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            if panel.started_at and (pr.discussion_status == 'discussed' or pr.discussion_started_at is None):
                other_running = panel.panel_referrals.filter(
                    discussion_status='pending', discussion_started_at__isnull=False,
                ).exclude(pk=pr.pk)
                for other in other_running:
                    lifecycle.stop_discussion_timer(other)
                pr.discussion_status = 'pending'
                pr.discussion_started_at = timezone.now()
                # A fresh segment starts clean - discussion_auto_stopped
                # should only ever describe the most recent segment, not
                # linger from an earlier one that got auto-stopped before
                # this resume.
                pr.discussion_auto_stopped = False
                pr.save()
                lifecycle.sync_referral_status(pr.referral)
                # Query-string flag, not new state - tells the Discussion
                # page this load is the actual start-of-discussion moment,
                # so it (and only it) may auto-pop the Safeguarding
                # Briefing modal. A GET (refresh, browser back/forward)
                # must never mutate discussion_started_at, so this can't be
                # derived from that field alone.
                return redirect(
                    reverse('inclusion_panel_discussion', kwargs={'panel_referral_id': pr.id}) + '?discussion_started=1'
                )
            return redirect('inclusion_panel_discussion', panel_referral_id=pr.id)
        return redirect('inclusion_panel_meeting_agenda', panel_id=panel.id)

    current_staff = _current_staff(request)
    panel_referrals = list(
        panel.panel_referrals.filter(removed_at__isnull=True).select_related('referral__student')
    )
    student_ids = [pr.referral.student_id for pr in panel_referrals]
    referral_counts = dict(
        InclusionReferral.objects.filter(student_id__in=student_ids)
        .values('student_id').annotate(c=Count('id')).values_list('student_id', 'c')
    )
    for pr in panel_referrals:
        pr.is_followup = referral_counts.get(pr.referral.student_id, 0) > 1
        pr.stage, pr.stage_label = lifecycle.stage(pr)
        # "X of Y actions complete" (Pending and Discussed columns alike) -
        # same visible_actions_for-filtered count Panel Agenda Setup's own
        # agenda card shows for a follow-up referral, wired up here since
        # this view never annotated either field despite the template
        # expecting them.
        status_counts = Counter(visible_actions_for(current_staff, pr.referral.actions.all()).values_list('status', flat=True))
        pr.actions_total = status_counts['complete'] + status_counts['incomplete']
        pr.actions_complete = status_counts['complete']

    pending = sorted(
        # 'deferred' stays visible here too (not just 'pending') - it's still
        # on this meeting's agenda and can be picked up properly if there's
        # time left, rather than disappearing the moment it's too-short/
        # no-activity deferred or auto-stopped-and-deferred.
        (pr for pr in panel_referrals if pr.discussion_status in ('pending', 'deferred')),
        key=lambda pr: (pr.agenda_order, pr.id),
    )
    # Same "has this referral been discussed before, and how many times" shape
    # inclusion_panel_meeting_setup annotates its own agenda rows with, so the
    # Pending row's pill/referral-details can render identically to Setup's -
    # see #90.
    last_discussed_by_referral = {}
    discussed_counts_by_referral = Counter()
    for prev in PanelReferral.objects.filter(
        referral_id__in=[pr.referral_id for pr in panel_referrals], discussion_status='discussed',
    ).exclude(panel_id=panel.id).select_related('panel').order_by('referral_id', '-panel__date'):
        last_discussed_by_referral.setdefault(prev.referral_id, prev)
        discussed_counts_by_referral[prev.referral_id] += 1
    for pr in pending:
        prev_pr = last_discussed_by_referral.get(pr.referral_id)
        pr.last_discussed_panel = prev_pr.panel if prev_pr else None
        pr.follow_up_date = prev_pr.follow_up_date if prev_pr else None
        pr.follow_up_overdue = bool(pr.follow_up_date and pr.follow_up_date < today)
        pr.review_label = _review_label(discussed_counts_by_referral[pr.referral_id])
    pending_estimated_total, pending_estimated_count = _annotate_estimated_durations(pending)

    discussed = [pr for pr in panel_referrals if pr.discussion_status == 'discussed']
    for pr in discussed:
        # Same "Review in..." preset options (1 Week/2 Weeks/1 Month/Next Half
        # Term/Next Term/Other) as End Discussion's own follow-up date picker
        # (discussion.html) - both Change (still-open follow-up) and
        # Schedule Review (Complete row, reopening one) use this shape
        # rather than a raw date input (#111).
        pr.next_half_term_date = next_half_term(pr.referral.student.school, today)
        pr.next_term_date = next_term(pr.referral.student.school, today)
        if pr.follow_up_status == 'incomplete':
            pr.is_last_open_review = lifecycle.is_last_open_review(pr)
        pr.duration_display = presenters.clock_duration(pr.duration)
    total = len(pending) + len(discussed)
    progress_pct = round(len(discussed) / total * 100) if total else 0

    scheduled_at = timezone.make_aware(
        datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
    )
    show_schedule_warning = panel.status not in ('running', 'complete') and timezone.now() < scheduled_at

    # Elapsed-time nudge - a running meeting well past this group's typical
    # duration probably means the chair forgot to click End Panel Meeting.
    # Distinct from the reconcile.STALE_PANEL_TIMEOUT auto-end (reconcile.reconcile_stale_running_panels/
    # inclusion_panel_meeting_activity_poll): that's activity-based (nothing
    # touched in 60 minutes), this is duration-based (1.5x this group's own
    # typical length) and fires much earlier - a chair who's still here and
    # actively working the agenda gets this nudge long before inactivity
    # would ever become a concern.
    is_running_long = False
    if panel.status == 'running' and panel.started_at:
        typical = reconcile.group_typical_duration(panel.panel_group)
        is_running_long = (timezone.now() - panel.started_at) > typical * 1.5

    members = _panel_member_roster(panel)
    checked_in_count = sum(1 for m in members if m.checked_in_at)
    members_in_attendance = [m for m in members if m.checked_in_at and not m.left_at]
    members_not_in_attendance = [m for m in members if not (m.checked_in_at and not m.left_at)]
    # status, not started_at is None - some seeded historical panels are
    # 'complete' without ever populating started_at/ended_at (see
    # start_meeting above), so status is the only reliable "hasn't started
    # yet" signal.
    is_pre_start = panel.status not in ('running', 'complete')
    is_mat_panel = bool(panel.panel_group_id and panel.panel_group.is_mat_wide)
    # Blocks Start/Take Attendance the same way _apply_attendance_action's
    # server-side gate does - see CONTEXT.md's "only one MAT Panel Meeting
    # running at a time".
    mat_start_blocked = is_mat_panel and is_pre_start and _mat_panel_running(exclude=panel) is not None
    # Page-load count only (not live-polled - see docs/adr/0015) of open
    # Escalations not yet on this running MAT panel's own agenda, prompting
    # the chair toward the existing Add to Agenda link.
    new_escalations_count = None
    if is_mat_panel and panel.status == 'running':
        new_escalations_count = Escalation.objects.filter(status='open').exclude(
            referral__panel_referrals__panel=panel, referral__panel_referrals__removed_at__isnull=True,
        ).values('referral_id').distinct().count()

    return render(request, 'hubs/inclusion/panel/meeting_agenda.html', {
        **_panel_base_context(request),
        'panel': panel,
        # complete/void meetings are history - Discuss and priority-editing
        # both go read-only once a meeting's ended, not just while it's
        # pre-start (chair can still triage priority before starting).
        # agenda_readonly gates _priority_mini.html's readonly and the
        # Discuss button below; auto-ended panels still have
        # panel.started_at set, so that alone isn't the right check.
        'agenda_readonly': lifecycle.panel_is_ended(panel),
        'pending': pending,
        'discussed': discussed,
        'progress_pct': progress_pct,
        'members': members,
        'checked_in_count': checked_in_count,
        'members_in_attendance': members_in_attendance,
        'members_not_in_attendance': members_not_in_attendance,
        'is_pre_start': is_pre_start,
        'can_start_meeting': is_pre_start and _is_group_member(current_staff, panel) and not mat_start_blocked,
        'mat_start_blocked': mat_start_blocked,
        'is_mat_panel': is_mat_panel,
        'new_escalations_count': new_escalations_count,
        # Gates the inactivity-warning poll (initInactivityWarning, panel.js)
        # - only worth polling from while the panel is actually running and
        # this viewer could do anything about a warning (ping/End Panel
        # Meeting) if it fired.
        'can_manage_running': panel.status == 'running' and _is_group_member(current_staff, panel),
        'stale_panel_warning_lead_seconds': int(reconcile.STALE_PANEL_WARNING_LEAD.total_seconds()),
        # Start Meeting/Take Attendance stay visible-but-disabled (not hidden)
        # when true - see meeting_agenda.html - rather than being folded into
        # can_start_meeting, which also gates dialog/button visibility itself.
        'agenda_is_empty': not panel_referrals,
        'scheduled_at': scheduled_at,
        'show_schedule_warning': show_schedule_warning,
        'is_running_long': is_running_long,
        'today': today,
        'priority_choices': InclusionReferral.PRIORITY_CHOICES,
        'pending_estimated_total': pending_estimated_total,
        'pending_estimated_count': pending_estimated_count,
    })
