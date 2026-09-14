"""Panel Home: the recent-activity feed, My Actions and My Referrals."""

import datetime

from django.shortcuts import render
from django.utils import timezone

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    student_queryset_for_school_key,
)

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import presenters, reconcile
from ..models import Action, InclusionReferral, Panel, PanelReferral

from .base import _panel_base_context
from .shared import (
    _is_referral_unassigned,
    _panels_for_school_key,
    _review_label,
    visible_actions_for,
)
from .meeting_shared import _is_group_member
from .safeguarding import _safeguarding_note_rows

def _activity_display_time(dt):
    local_dt = timezone.localtime(dt)
    today = timezone.localdate()
    if local_dt.date() == today:
        return local_dt.strftime('%H:%M')
    if local_dt.date() == today - datetime.timedelta(days=1):
        return 'Yesterday'
    return local_dt.strftime('%d %b')


def _recent_activity(scoped_students, school_key, limit=8):
    events = []
    for referral in (
        InclusionReferral.objects.filter(student__in=scoped_students)
        .select_related('student').order_by('-created_at')[:limit]
    ):
        events.append({
            'timestamp': referral.created_at,
            'text': f'Referral created for {referral.student}',
            'icon': 'inclusion/icons/document.svg', 'accent': 'primary',
        })
    for action in (
        Action.objects.filter(referral__student__in=scoped_students, completed_at__isnull=False)
        .select_related('referral__student').order_by('-completed_at')[:limit]
    ):
        events.append({
            'timestamp': action.completed_at,
            'text': f'Action completed for {action.referral.student}',
            'icon': 'img/icons/ui/checkmark.svg', 'accent': 'positive',
        })
    for pr in (
        PanelReferral.objects.filter(referral__student__in=scoped_students, removed_at__isnull=True)
        .select_related('referral__student').order_by('-created_at')[:limit]
    ):
        events.append({
            'timestamp': pr.created_at,
            'text': f'{pr.referral.student} assigned to panel',
            'icon': 'img/icons/portal/people.svg', 'accent': 'exceeding',
        })
    completed_panels = _panels_for_school_key(
        Panel.objects.filter(status='complete', ended_at__isnull=False).select_related('panel_group__school'),
        school_key,
    ).order_by('-ended_at')[:limit]
    for panel in completed_panels:
        school_name = panel.panel_group.school.name if panel.panel_group_id and panel.panel_group.school_id else None
        label = f'{school_name} panel meeting completed' if school_name else 'Panel meeting completed'
        events.append({
            'timestamp': panel.ended_at, 'text': label,
            'icon': 'img/icons/ui/checkmark.svg', 'accent': 'positive',
        })

    events.sort(key=lambda e: e['timestamp'], reverse=True)
    events = events[:limit]
    for event in events:
        event['display_time'] = _activity_display_time(event['timestamp'])
    return events


def _my_actions_context(current_staff):
    # Shared by inclusion_panel_home (full page) and
    # inclusion_panel_action_set_status's AJAX branch (re-renders just the My
    # Actions card fragment after a status change) - one place computing
    # these counts so both stay in sync.
    today = timezone.localdate()
    if current_staff is not None:
        my_actions = Action.objects.filter(assigned_to_staff=current_staff).select_related('referral__student').order_by('referral__student__last_name', 'referral__student__first_name', 'status', 'due_date')
        my_actions = list(visible_actions_for(current_staff, my_actions))
    else:
        my_actions = []
    for action in my_actions:
        action.is_overdue = action.status == 'incomplete' and action.due_date and action.due_date < today
    overdue_actions = sum(1 for a in my_actions if a.is_overdue)
    actions_incomplete_count = sum(1 for a in my_actions if a.status == 'incomplete')
    actions_complete_count = sum(1 for a in my_actions if a.status == 'complete')
    actions_not_needed_count = sum(1 for a in my_actions if a.status == 'not_needed')
    show_action_tabs = sum(1 for c in (actions_incomplete_count, overdue_actions, actions_not_needed_count, actions_complete_count) if c) > 1
    return {
        'my_actions': my_actions,
        'overdue_actions': overdue_actions,
        'actions_incomplete_count': actions_incomplete_count,
        'actions_complete_count': actions_complete_count,
        'actions_not_needed_count': actions_not_needed_count,
        'show_action_tabs': show_action_tabs,
    }


def inclusion_panel_home(request):
    reconcile.reconcile_on_read()
    current_staff = _current_staff(request)

    my_referrals = list(
        InclusionReferral.objects.filter(status='open', raised_by=current_staff)
        .select_related('student')
        .prefetch_related('panel_referrals', 'actions', 'responses__question')
    ) if current_staff is not None else []
    for referral in my_referrals:
        referral.discussed_pr = next(
            (pr for pr in referral.panel_referrals.all() if pr.discussion_status == 'discussed'), None
        )
        referral.actions_count = len(referral.actions.all())
        referral.is_unassigned = _is_referral_unassigned(referral)
        referral.can_delete = referral.is_unassigned
        # Discussed count -> review label (Initial Discussion / 1st Review /
        # 2nd Review / ...), same _review_label convention as the Referrals
        # dashboard (inclusion_panel_referrals) - carries real information
        # the Awaiting/Discussed tab row doesn't (which review number this
        # is), unlike a plain "Discussed" pill which just repeats the tab.
        discussed_count = sum(1 for pr in referral.panel_referrals.all() if pr.discussion_status == 'discussed')
        referral.review_label = _review_label(discussed_count) if discussed_count else None
        # Short form ("15m"/"2h 15m"), not the raw DurationField's verbose
        # str(timedelta) ("0:15:00") - same presenters.short_duration helper the
        # meeting card summary elsewhere already uses for this.
        referral.discussed_duration_display = (
            presenters.short_duration(referral.discussed_pr.duration) if referral.discussed_pr else None
        )
    referrals_discussed_count = sum(1 for r in my_referrals if r.discussed_pr)
    referrals_awaiting_count = len(my_referrals) - referrals_discussed_count

    today = timezone.localdate()
    actions_ctx = _my_actions_context(current_staff)
    my_actions = actions_ctx['my_actions']
    overdue_actions = actions_ctx['overdue_actions']
    actions_incomplete_count = actions_ctx['actions_incomplete_count']
    actions_complete_count = actions_ctx['actions_complete_count']
    actions_not_needed_count = actions_ctx['actions_not_needed_count']
    show_action_tabs = actions_ctx['show_action_tabs']

    show_referral_tabs = sum(1 for c in (referrals_awaiting_count, referrals_discussed_count) if c) > 1

    school_key = current_school_key(request)
    scoped_students = student_queryset_for_school_key(school_key)
    active_referrals_count = InclusionReferral.objects.filter(
        student__in=scoped_students,
        status__in=['open', 'review_scheduled', 'awaiting_review', 'overdue_review', 'assigned', 'discussing'],
    ).count()
    scoped_actions_qs = Action.objects.filter(referral__student__in=scoped_students)
    actions_overdue_total = scoped_actions_qs.filter(status='incomplete', due_date__lt=today).count()

    week_start = today - datetime.timedelta(days=today.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    actions_due_this_week = scoped_actions_qs.filter(
        status='incomplete', due_date__gte=week_start, due_date__lte=week_end,
    ).count()
    followups_due_count = PanelReferral.objects.filter(
        referral__student__in=scoped_students,
        follow_up_status='incomplete',
        follow_up_date__lte=today,
        removed_at__isnull=True,
    ).count()
    unassigned_referrals_count = InclusionReferral.objects.filter(
        student__in=scoped_students, status='open',
    ).count()

    is_dsl = bool(current_staff and current_staff.is_dsl)
    needs_briefing_count = (
        sum(1 for r in _safeguarding_note_rows(request) if not r['has_briefing']) if is_dsl else 0
    )

    upcoming_panels = _panels_for_school_key(
        Panel.objects.exclude(status__in=['complete', 'delayed', 'void']).select_related('panel_group__school').order_by('date'),
        school_key,
    )
    upcoming_panel_previews = []
    for panel in upcoming_panels:
        school = panel.panel_group.school if panel.panel_group_id else None
        upcoming_panel_previews.append({
            'panel': panel,
            'school_name': (
                school.name if school
                else panel.panel_group.name if panel.panel_group_id
                else 'MAT-wide'
            ),
            'school_logo_url': school.logo_url if school else '',
            'panel_group_members_count': (
                panel.panel_group.members.count() if panel.panel_group_id else 0
            ),
            'is_today': panel.date == today,
            'is_running': panel.status == 'running',
            'can_manage': _is_group_member(current_staff, panel),
        })

    return render(request, 'hubs/inclusion/panel/home.html', {
        **_panel_base_context(request),
        'current_staff': current_staff,
        'my_referrals': my_referrals,
        'my_actions': my_actions,
        'referrals_awaiting_count': referrals_awaiting_count,
        'referrals_discussed_count': referrals_discussed_count,
        'overdue_actions': overdue_actions,
        'actions_incomplete_count': actions_incomplete_count,
        'actions_complete_count': actions_complete_count,
        'actions_not_needed_count': actions_not_needed_count,
        'show_referral_tabs': show_referral_tabs,
        'show_action_tabs': show_action_tabs,
        'active_referrals_count': active_referrals_count,
        'actions_overdue_total': actions_overdue_total,
        'actions_overdue_total_accent': 'positive' if actions_overdue_total == 0 else 'negative',
        'actions_due_this_week': actions_due_this_week,
        'actions_due_this_week_accent': 'positive' if actions_due_this_week == 0 else 'caution',
        'followups_due_count': followups_due_count,
        'followups_due_count_accent': 'positive' if followups_due_count == 0 else 'negative',
        'unassigned_referrals_count': unassigned_referrals_count,
        'unassigned_referrals_count_accent': 'positive' if unassigned_referrals_count == 0 else 'warning',
        'is_dsl': is_dsl,
        'needs_briefing_count': needs_briefing_count,
        'needs_briefing_count_accent': 'positive' if needs_briefing_count == 0 else 'warning',
        'upcoming_panel_previews': upcoming_panel_previews,
        'recent_activity': _recent_activity(scoped_students, school_key),
    })
