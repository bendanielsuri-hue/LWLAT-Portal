import datetime
import json
from collections import Counter
from urllib.parse import quote

from django.db.models import Count, Max, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import Referral as CoreReferral, School, Staff, Student
from core.modules import filter_by_module, module_map

from .models import (
    Action,
    ActionCategory,
    Escalation,
    Expertise,
    ExternalContact,
    InclusionReferral,
    Panel,
    PanelGroup,
    PanelGroupMember,
    PanelMember,
    PanelReferral,
    PanelReferralNote,
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
    StudentNote,
)

PANEL_MENU = [
    {'name': 'Home', 'url': '/inclusion/panel/', 'icon': 'icons/house_svg.html', 'module_key': 'inclusion_panel'},
    {'name': 'Students', 'url': '/inclusion/panel/students/', 'icon': 'icons/people_svg.html', 'module_key': 'inclusion_panel_students'},
    {'name': 'Referrals', 'url': '/inclusion/panel/referrals/', 'icon': 'icons/document_svg.html', 'module_key': 'inclusion_panel_referrals'},
    {'name': 'Actions', 'url': '/inclusion/panel/actions/', 'icon': 'icons/checkmark_svg.html', 'module_key': 'inclusion_panel_actions'},
    {'name': 'Panel Meetings', 'url': '/inclusion/panel/meetings/', 'icon': 'icons/clock_svg.html', 'module_key': 'inclusion_panel_meetings'},
    {'name': 'Escalations', 'url': '/inclusion/panel/escalations/', 'icon': 'icons/document_svg.html', 'module_key': 'inclusion_panel_escalations'},
    {'name': 'Admin', 'url': '/inclusion/panel/settings/referral-questions/', 'icon': 'icons/registers_svg.html', 'module_key': 'inclusion_panel_settings'},
]


def _local_menu(request):
    return filter_by_module(PANEL_MENU, module_map(), request)


def _panel_base_context(request):
    # Shared sidebar context for every page inside the Inclusion Panel sub-app.
    return {
        'local_menu': _local_menu(request),
        'hub_title': 'Inclusion Panel',
        'back_to_hub_url': '/inclusion/',
        'back_to_hub_label': 'SEND & Provision',
    }

ACTION_CATEGORY_PRESETS = ['Parent Meeting', 'Intervention', 'Other']


def _safe_next(request, default_url):
    next_url = request.POST.get('next') or request.GET.get('next')
    if next_url and url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
        return next_url
    return default_url


def _is_panel_staff(staff):
    # Lightweight, non-secure role check: anyone in a PanelGroup is treated as
    # DSL/panel staff. No real auth exists yet, see CLAUDE.md.
    if staff is None:
        return False
    return PanelGroupMember.objects.filter(staff=staff, is_active=True).exists()


def visible_categories_for(staff, categories=None):
    # ActionCategory.is_sensitive hides a category from anyone who isn't panel
    # staff (see hubs/inclusion/panel/CLAUDE.md). Single owner for that rule so
    # it can't be applied inconsistently across views.
    if categories is None:
        categories = ActionCategory.objects.filter(is_active=True)
    if _is_panel_staff(staff):
        return categories
    return categories.exclude(is_sensitive=True)


def visible_actions_for(staff, actions):
    if _is_panel_staff(staff):
        return actions
    return actions.exclude(category__is_sensitive=True)


def _is_referral_unassigned(referral):
    return not any(pr.removed_at is None for pr in referral.panel_referrals.all())


def _panels_for_school_key(panels_qs, key):
    # Mirrors staff_queryset_for_school_key/student_queryset_for_school_key:
    # an ungrouped panel, or a group with no school set, is MAT-wide and
    # matches every selection.
    if key in (None, '', 'all'):
        return panels_qs
    if key == 'primary':
        return panels_qs.filter(
            Q(panel_group__isnull=True) | Q(panel_group__school__isnull=True) | Q(panel_group__school__category='Primary')
        )
    if key == 'secondary':
        return panels_qs.filter(
            Q(panel_group__isnull=True) | Q(panel_group__school__isnull=True) | Q(panel_group__school__category='Secondary')
        )
    return panels_qs.filter(
        Q(panel_group__isnull=True) | Q(panel_group__school__isnull=True) | Q(panel_group__school_id=key)
    )


def _stop_discussion_timer(panel_referral):
    # Stops a running timer without marking the referral as discussed — used
    # when another referral's discussion starts (only one runs at a time) and
    # when a panel meeting ends, so no timer is left silently accruing.
    if panel_referral.discussion_started_at:
        elapsed = timezone.now() - panel_referral.discussion_started_at
        panel_referral.duration = (panel_referral.duration or datetime.timedelta()) + elapsed
        panel_referral.discussion_started_at = None
        panel_referral.save()


def _ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _review_label(prior_discussion_count):
    # prior_discussion_count is how many times a referral was already
    # discussed before the panel appearance being labeled - 0 is its
    # first-ever appearance ("Initial Discussion"), 1 is the first time
    # it's back after that ("1st Review"), 2 the second ("2nd Review"), etc.
    if prior_discussion_count <= 0:
        return 'Initial Discussion'
    return _ordinal(prior_discussion_count) + ' Review'


def _panel_referral_stage(pr):
    # This PanelReferral's progress through its own panel — distinct from
    # InclusionReferral.status, which aggregates across every panel a referral has
    # ever been attached to (see _sync_referral_status below).
    if pr.discussion_status == 'pending':
        if pr.discussion_started_at:
            return 'discussing', 'Discussing'
        return 'assigned', 'Assigned to Panel'
    if pr.follow_up_status == 'incomplete':
        return 'requires_follow_up', 'Needs Review'
    return 'complete', 'Complete'


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
            'panel_group_member__staff', 'panel_group_member__external_contact', 'panel_group_member__expertise'
        )
        members = []
        for pm in attendance:
            gm = pm.panel_group_member
            gm.checked_in_at = pm.checked_in_at
            gm.left_at = pm.left_at
            members.append(gm)
        return members

    members = list(
        panel.panel_group.members.filter(is_active=True)
        .select_related('staff', 'external_contact', 'expertise')
    )
    attendance_by_member_id = {
        pm.panel_group_member_id: pm
        for pm in PanelMember.objects.filter(panel=panel, panel_group_member__in=members)
    }
    for gm in members:
        pm = attendance_by_member_id.get(gm.id)
        gm.checked_in_at = pm.checked_in_at if pm else None
        gm.left_at = pm.left_at if pm else None
    return members


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


def _sync_referral_status(referral):
    # InclusionReferral.status reflects the aggregate state across every panel this
    # referral is currently attached to, since the same referral can be
    # picked up by more than one panel over time (e.g. a follow-up panel).
    active_prs = list(referral.panel_referrals.filter(removed_at__isnull=True))
    stages = [_panel_referral_stage(pr)[0] for pr in active_prs]
    if not active_prs:
        new_status = 'open'
    elif 'discussing' in stages:
        # Actually being discussed right now, regardless of any older
        # discussed/follow-up-due entries also still attached - the most
        # current fact about the referral always wins.
        new_status = 'discussing'
    elif 'assigned' in stages:
        new_status = 'assigned'
    elif all(stage == 'complete' for stage in stages):
        new_status = 'closed'
    else:
        # Discussed before, follow-up due, but not currently on any
        # agenda - the Reviews Due queue, tiered by how close the most
        # urgent (earliest) due date is.
        due_dates = [
            pr.follow_up_date for pr, stage in zip(active_prs, stages)
            if stage == 'requires_follow_up' and pr.follow_up_date
        ]
        if due_dates:
            days_until_due = (min(due_dates) - timezone.localdate()).days
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
    # Keep the coarse cross-type core.Referral.status (open/closed) projected from
    # the richer Inclusion-specific status — see core.models.Referral docstring.
    base_status = CoreReferral.STATUS_CLOSED if new_status == 'closed' else CoreReferral.STATUS_OPEN
    if referral.referral.status != base_status:
        referral.referral.status = base_status
        referral.referral.save(update_fields=['status'])


def _due_followups(panel, as_of=None):
    # Scoped strictly to the panel's own group so a follow-up never surfaces
    # in a different group's meeting. Ungrouped panels see nothing due.
    # as_of defaults to today (live Agenda page); Panel Agenda Setup passes a
    # forward-looking date since setup happens ahead of the meeting.
    if panel.panel_group_id is None:
        return PanelReferral.objects.none()
    return PanelReferral.objects.filter(
        follow_up_status='incomplete',
        follow_up_date__lte=as_of or timezone.localdate(),
        removed_at__isnull=True,
        panel__panel_group_id=panel.panel_group_id,
    ).select_related('referral__student', 'referral__raised_by', 'panel')


def _sync_delayed_panels():
    # 'delayed' is computed, never set by hand: a panel that hasn't been started and
    # whose scheduled time has passed is delayed; if it's rescheduled back into the
    # future it reverts to draft. Completion stays a manual-only action
    # (end_panel_meeting) — this never touches 'ready'/'running'/'complete' panels.
    now = timezone.now()
    for panel in Panel.objects.filter(status__in=['draft', 'ready'], started_at__isnull=True):
        scheduled_at = timezone.make_aware(
            datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
        )
        if scheduled_at < now:
            panel.status = 'delayed'
            panel.save(update_fields=['status'])
    for panel in Panel.objects.filter(status='delayed', started_at__isnull=True):
        scheduled_at = timezone.make_aware(
            datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
        )
        if scheduled_at >= now:
            panel.status = 'draft'
            panel.save(update_fields=['status'])


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
            'icon': 'document', 'accent': 'primary',
        })
    for action in (
        Action.objects.filter(referral__student__in=scoped_students, completed_at__isnull=False)
        .select_related('referral__student').order_by('-completed_at')[:limit]
    ):
        events.append({
            'timestamp': action.completed_at,
            'text': f'Action completed for {action.referral.student}',
            'icon': 'checkmark', 'accent': 'positive',
        })
    for pr in (
        PanelReferral.objects.filter(referral__student__in=scoped_students, removed_at__isnull=True)
        .select_related('referral__student').order_by('-created_at')[:limit]
    ):
        events.append({
            'timestamp': pr.created_at,
            'text': f'{pr.referral.student} assigned to panel',
            'icon': 'people', 'accent': 'exceeding',
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
            'icon': 'checkmark', 'accent': 'positive',
        })

    events.sort(key=lambda e: e['timestamp'], reverse=True)
    events = events[:limit]
    for event in events:
        event['display_time'] = _activity_display_time(event['timestamp'])
    return events


def _primary_concern_category(referral):
    for response in referral.responses.all():
        if response.question.label == 'Main Concern Category' and response.answer:
            return response.answer
    return None


def _grouped_questions():
    # Flat (category=None) questions are appended last as a headerless group, so
    # callers/templates can keep iterating one flat list of groups.
    categories = ReferralCategory.objects.filter(is_active=True).prefetch_related('questions')
    groups = []
    for category in categories:
        questions = [q for q in category.questions.all() if q.is_active]
        if questions:
            groups.append({'category': category, 'questions': questions})

    flat_questions = list(
        ReferralQuestion.objects.filter(category__isnull=True, is_active=True).order_by('order')
    )
    if flat_questions:
        groups.append({'category': None, 'questions': flat_questions})
    return groups


def _split_question_groups(question_groups):
    # Referral Details modal: Main Concern Category and Concern Details are
    # pulled out of _grouped_questions()'s plain group list to render
    # separately (always-visible triage field, then top of the "Referral"
    # section) - matched by exact label, same convention already used by
    # _primary_concern_category() above. Only ever affects display; POST
    # validation/saving still iterates the original, unsplit question_groups.
    main_concern_question = None
    concern_details_question = None
    remaining_groups = []
    for group in question_groups:
        kept = []
        for question in group['questions']:
            if question.label == 'Main Concern Category':
                main_concern_question = question
            elif question.label == 'Concern Details':
                concern_details_question = question
            else:
                kept.append(question)
        if kept:
            remaining_groups.append({'category': group['category'], 'questions': kept})
    return main_concern_question, concern_details_question, remaining_groups


def _missing_required_answers(question_groups, post_data):
    # Dropdown questions (currently just Main Concern Category) are required -
    # see the `required` attribute on their <select> in
    # _referral_form_fields.html. Client-side validation can be bypassed (a
    # disabled/hidden field is barred from constraint validation, a manual
    # fetch() skips the browser's native submit-blocking entirely), so a
    # referral must never actually save without this - re-check server-side.
    missing = []
    for group in question_groups:
        for question in group['questions']:
            if question.question_type != 'select':
                continue
            answer = post_data.get(f'question_{question.id}', '')
            if not answer or answer not in question.choice_list():
                missing.append(question.label)
    return missing


def _pct(numerator, denominator):
    if not denominator:
        return 0
    return round(numerator * 100 / denominator)


def _ken_breakdown(rows, label_key):
    breakdown = []
    for row in rows:
        k_count = row['k_count']
        e_count = row['e_count']
        total = row['total']
        n_count = total - k_count - e_count
        breakdown.append({
            'label': row[label_key],
            'k_count': k_count,
            'e_count': e_count,
            'n_count': n_count,
            'k_pct': _pct(k_count, total),
            'e_pct': _pct(e_count, total),
            'n_pct': _pct(n_count, total),
        })
    return breakdown


def _response_groups(referral):
    # Built from the referral's actual saved responses (not the live active-question
    # list), so historic answers still display correctly even if a question was later
    # deactivated. Categories are walked in the same order as _grouped_questions()
    # (the New InclusionReferral modal) — categorised groups first, the flat/no-category
    # group last — so this screen's field order always matches the modal's, rather
    # than the SQL default of NULL-category sorting first.
    responses_by_category = {}
    flat_rows = []
    for response in referral.responses.select_related('question__category').order_by('question__order'):
        category = response.question.category
        row = {'question': response.question, 'answer': response.answer}
        if category is None:
            flat_rows.append(row)
        else:
            responses_by_category.setdefault(category.id, {'category': category, 'rows': []})['rows'].append(row)

    groups = []
    for category in ReferralCategory.objects.filter(is_active=True):
        if category.id in responses_by_category:
            groups.append(responses_by_category[category.id])
    if flat_rows:
        groups.append({'category': None, 'rows': flat_rows})
    return groups


def inclusion_panel_search(request):
    q = request.GET.get('q', '').strip()
    if len(q) < 2:
        return JsonResponse({'results': []})

    school_key = current_school_key(request)
    scoped_students = student_queryset_for_school_key(school_key)
    is_panel_staff = _is_panel_staff(_current_staff(request))

    students_url = reverse('inclusion_panel_students')
    referrals_url = reverse('inclusion_panel_referrals')
    actions_url = reverse('inclusion_panel_actions')

    def name_param(student):
        return f'name={quote(f"{student.first_name} {student.last_name}")}'

    results = []

    students = scoped_students.filter(
        Q(first_name__icontains=q) | Q(last_name__icontains=q)
    )[:5]
    for student in students:
        param = name_param(student)
        referrals_count = student.referrals.count()
        actions_count = Action.objects.filter(referral__student=student).count()
        results.append({
            'kind': 'student',
            'title': f'{student.last_name}, {student.first_name}',
            'subtitle': f'Year {student.year_group}' if student.year_group else 'Student',
            'links': [
                {'label': 'Student', 'url': f'{students_url}?{param}', 'disabled': False},
                {'label': f'Referrals ({referrals_count})', 'url': f'{referrals_url}?{param}', 'disabled': referrals_count == 0},
                {'label': f'Actions ({actions_count})', 'url': f'{actions_url}?{param}', 'disabled': actions_count == 0},
            ],
        })

    staff_members = staff_queryset_for_school_key(school_key).filter(
        Q(first_name__icontains=q) | Q(last_name__icontains=q)
    )[:5]
    for staff in staff_members:
        referrals_raised = InclusionReferral.objects.filter(student__in=scoped_students, raised_by=staff).count()
        actions_assigned = Action.objects.filter(referral__student__in=scoped_students, assigned_to=staff)
        if not is_panel_staff:
            actions_assigned = actions_assigned.exclude(category__is_sensitive=True)
        actions_assigned_count = actions_assigned.count()
        results.append({
            'kind': 'staff',
            'title': f'{staff.last_name}, {staff.first_name}',
            'subtitle': staff.job_title or 'Staff',
            'links': [
                {'label': f'Referrals Raised ({referrals_raised})', 'url': f'{referrals_url}?raised_by={staff.id}', 'disabled': referrals_raised == 0},
                {'label': f'Actions Assigned ({actions_assigned_count})', 'url': f'{actions_url}?assigned={staff.id}', 'disabled': actions_assigned_count == 0},
            ],
        })

    return JsonResponse({'results': results})


def inclusion_panel_home(request):
    _sync_delayed_panels()
    current_staff = _current_staff(request)
    is_panel_staff = _is_panel_staff(current_staff)

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
        referral.concern_category = _primary_concern_category(referral)
    referrals_discussed_count = sum(1 for r in my_referrals if r.discussed_pr)
    referrals_awaiting_count = len(my_referrals) - referrals_discussed_count

    today = timezone.localdate()
    if current_staff is not None:
        my_actions = Action.objects.filter(assigned_to=current_staff).select_related('referral__student').order_by('status', 'due_date')
        if not is_panel_staff:
            my_actions = my_actions.exclude(category__is_sensitive=True)
        my_actions = list(my_actions)
    else:
        my_actions = []
    for action in my_actions:
        action.is_overdue = action.status == 'incomplete' and action.due_date and action.due_date < today
    overdue_actions = sum(1 for a in my_actions if a.is_overdue)
    actions_incomplete_count = sum(1 for a in my_actions if a.status == 'incomplete')
    actions_complete_count = sum(1 for a in my_actions if a.status == 'complete')
    actions_not_needed_count = sum(1 for a in my_actions if a.status == 'not_needed')

    show_referral_tabs = sum(1 for c in (referrals_awaiting_count, referrals_discussed_count) if c) > 1
    show_action_tabs = sum(1 for c in (actions_incomplete_count, overdue_actions, actions_not_needed_count, actions_complete_count) if c) > 1

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

    next_panel = _panels_for_school_key(
        Panel.objects.exclude(status__in=['complete', 'delayed']).select_related('panel_group__school').order_by('date'),
        school_key,
    ).first()
    next_panel_preview = None
    if next_panel:
        school = next_panel.panel_group.school if next_panel.panel_group_id else None
        next_panel_preview = {
            'panel': next_panel,
            'school_name': (
                school.name if school
                else next_panel.panel_group.name if next_panel.panel_group_id
                else 'MAT-wide'
            ),
            'school_logo_url': school.logo_url if school else '',
            'referrals_assigned': next_panel.panel_referrals.filter(removed_at__isnull=True).count(),
            'panel_group_members_count': (
                next_panel.panel_group.members.count() if next_panel.panel_group_id else 0
            ),
            'is_today': next_panel.date == today,
            'is_running': next_panel.status == 'running',
        }

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
        'next_panel_preview': next_panel_preview,
        'recent_activity': _recent_activity(scoped_students, school_key),
    })


def inclusion_panel_students(request):
    today = timezone.localdate()
    students = []
    for student in student_queryset_for_school_key(current_school_key(request)):
        students.append({
            'id': student.id,
            'name': f'{student.first_name} {student.last_name}',
            'year': student.year_group,
            'form': student.reg_form,
            'referrals': student.referrals.count(),
            'actions': Action.objects.filter(referral__student=student).count(),
            'overdue_actions': Action.objects.filter(
                referral__student=student, status='incomplete', due_date__lt=today,
            ).count(),
        })
    years = sorted({s['year'] for s in students if s['year'] is not None})
    forms = sorted({s['form'] for s in students if s['form']})
    forms_by_year = {
        year: sorted({s['form'] for s in students if s['year'] == year and s['form']})
        for year in years
    }
    return render(request, 'hubs/inclusion/panel/students.html', {
        **_panel_base_context(request),
        'students': students,
        'years': years,
        'forms': forms,
        'forms_by_year_json': json.dumps(forms_by_year),
        'students_count': len(students),
        'referrals_count': InclusionReferral.objects.filter(student__in=[s['id'] for s in students]).count(),
        'actions_count': Action.objects.filter(referral__student_id__in=[s['id'] for s in students]).count(),
    })


def inclusion_panel_referrals(request):
    school_key = current_school_key(request)
    scoped_students = student_queryset_for_school_key(school_key)
    referrals = InclusionReferral.objects.filter(student__in=scoped_students).select_related('student').prefetch_related(
        'responses__question', 'panel_referrals',
    )
    today = timezone.localdate()
    current_staff = _current_staff(request)
    for referral in referrals:
        referral.is_unassigned = _is_referral_unassigned(referral)
        referral.is_due_follow_up = any(
            pr.follow_up_status == 'incomplete' and pr.follow_up_date and pr.follow_up_date <= today
            for pr in referral.panel_referrals.all()
        )
        referral.actions_count = referral.actions.count()
        referral.can_delete = (
            referral.is_unassigned and current_staff is not None and referral.raised_by_id == current_staff.id
        )
        referral.concern_category = _primary_concern_category(referral)
    return render(request, 'hubs/inclusion/panel/referrals.html', {
        **_panel_base_context(request),
        'referrals': referrals,
        'status_choices': InclusionReferral.STATUS_CHOICES,
        'staff_list': staff_queryset_for_school_key(school_key),
        'students_count': scoped_students.filter(referrals__isnull=False).distinct().count(),
        'actions_count': Action.objects.filter(referral__in=referrals).count(),
    })


def inclusion_panel_referral_new(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    student_id = request.GET.get('student') or request.POST.get('student')
    selected_student = Student.objects.filter(pk=student_id).first() if student_id else None

    question_groups = _grouped_questions()
    errors = None

    if request.method == 'POST':
        errors = _missing_required_answers(question_groups, request.POST)
        if not errors:
            student = get_object_or_404(Student, pk=request.POST.get('student'))
            raised_by = _current_staff(request)
            referral = InclusionReferral.create_for(student, raised_by)
            for group in question_groups:
                for question in group['questions']:
                    answer = request.POST.get(f'question_{question.id}', '')
                    ReferralResponse.objects.create(referral=referral, question=question, answer=answer)
            if is_ajax:
                return JsonResponse({'success': True})
            return redirect(_safe_next(request, '/inclusion/panel/referrals/'))
        if is_ajax:
            return JsonResponse({'success': False, 'errors': errors}, status=400)
        selected_student = get_object_or_404(Student, pk=request.POST.get('student'))
        for group in question_groups:
            for question in group['questions']:
                question.existing_answer = request.POST.get(f'question_{question.id}', '')

    main_concern_question, concern_details_question, remaining_question_groups = _split_question_groups(question_groups)

    context = {
        **_panel_base_context(request),
        'students': student_queryset_for_school_key(current_school_key(request)),
        'selected_student': selected_student,
        'question_groups': question_groups,
        'main_concern_question': main_concern_question,
        'concern_details_question': concern_details_question,
        'remaining_question_groups': remaining_question_groups,
        'errors': errors,
        'next': request.GET.get('next', request.POST.get('next', '')),
    }
    return render(request, 'hubs/inclusion/panel/_referral_form_modal.html', context)


def _referral_detail_context(referral, current_staff):
    """Shared display context for _referral_form_modal.html - the decision
    strip, Panel History, Actions (with is_overdue) and Notes sections. Used
    by both inclusion_panel_referral_edit (viewing/editing a referral) and
    inclusion_panel_action_status_update (toggling one action's status from
    within that same modal) so the two can never drift apart the way the
    old, separate Actions modal used to (see CLAUDE.md/DesignLanguage.md -
    action.is_overdue and the sensitive-category filter both used to only
    exist on one of the two views)."""
    is_panel_staff = _is_panel_staff(current_staff)
    today = timezone.localdate()

    # A referral currently on a panel's agenda but not yet discussed - takes
    # priority over discussion history below for the decision strip's status
    # line, since "assigned to a panel" is the most current, actionable fact
    # about the referral when it's true.
    pending_pr = (
        referral.panel_referrals.filter(removed_at__isnull=True, discussion_status='pending')
        .select_related('panel', 'panel__chair').order_by('-panel__date').first()
    )

    discussed_prs = list(
        referral.panel_referrals.filter(removed_at__isnull=True, discussion_status='discussed')
        .select_related('panel', 'panel__chair', 'panel__panel_group').order_by('-panel__date')
    )
    discussion_count = len(discussed_prs)
    discussions = []
    for idx, pr in enumerate(discussed_prs):
        if pr.duration:
            total_seconds = int(pr.duration.total_seconds())
            h, rem = divmod(total_seconds, 3600)
            m, s = divmod(rem, 60)
            pr.duration_display = f'{h}:{m:02d}:{s:02d}'
        else:
            pr.duration_display = None
        discussions.append({
            'pr': pr,
            # discussed_prs is newest-first, so this one's ascending
            # (chronological) position is discussion_count - idx, and the
            # number of discussions before it is one less than that.
            'review_label': _review_label(discussion_count - idx - 1),
            'attendance': PanelMember.objects.filter(panel=pr.panel_id, checked_in_at__isnull=False).count(),
            'actions_added': Action.objects.filter(origin_panel_referral=pr).count(),
        })

    review_label_by_pr_id = {d['pr'].id: d['review_label'] for d in discussions}

    referral_actions = referral.actions.select_related('category', 'assigned_to', 'origin_panel_referral__panel')
    if not is_panel_staff:
        referral_actions = referral_actions.exclude(category__is_sensitive=True)
    referral_actions = list(referral_actions)
    for action in referral_actions:
        action.is_overdue = action.status == 'incomplete' and action.due_date and action.due_date < today
        action.origin_review_label = review_label_by_pr_id.get(action.origin_panel_referral_id)
    actions_total = len(referral_actions)
    actions_complete = sum(1 for a in referral_actions if a.status == 'complete')
    actions_overdue = sum(1 for a in referral_actions if a.is_overdue)

    # Decision-strip status: a pending panel assignment wins first (it's the
    # most current fact), then the most recent discussion's own stage
    # (Complete / Needs Review), then 'not_discussed' when the referral
    # has never been through a panel yet - drives the "due for review?"
    # line in the modal.
    latest_discussion = discussions[0] if discussions else None
    followup_overdue = False
    if pending_pr:
        stage_key, stage_label = _panel_referral_stage(pending_pr)
    elif latest_discussion:
        stage_key, stage_label = _panel_referral_stage(latest_discussion['pr'])
        followup_date = latest_discussion['pr'].follow_up_date
        followup_overdue = stage_key == 'requires_follow_up' and followup_date and followup_date < today
    else:
        stage_key, stage_label = 'not_discussed', 'Not yet discussed'

    # The next panel appearance this referral is due for, numbered the same
    # way as the Panel History labels above - reused as the stage label
    # itself for 'requires_follow_up' so the summary pill, decision-strip
    # text and its own pill all say the same numbered thing instead of a
    # generic "Needs Review".
    if stage_key == 'requires_follow_up':
        stage_label = _review_label(discussion_count)

    student_notes = referral.student.notes.select_related('author').all()

    return {
        'discussions': discussions,
        'latest_discussion': latest_discussion,
        'pending_pr': pending_pr,
        'stage_key': stage_key,
        'stage_label': stage_label,
        'followup_overdue': followup_overdue,
        'referral_actions': referral_actions,
        'actions_total': actions_total,
        'actions_complete': actions_complete,
        'actions_overdue': actions_overdue,
        'student_notes': student_notes,
        # Nothing worth a decision-strip card when the referral has never
        # reached a panel and has no actions raised yet either - Django's
        # {% if %} has no parenthesised grouping, so this is computed here
        # rather than as a compound expression in the template.
        'show_decision_strip': stage_key != 'not_discussed' or bool(actions_total),
    }


def inclusion_panel_referral_edit(request, referral_id):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    referral = get_object_or_404(InclusionReferral.objects.select_related('student', 'raised_by'), pk=referral_id)
    current_staff = _current_staff(request)
    # Ownership only ever narrows edit access (a non-creator can never edit) -
    # it never grants it: the "Referral Details" links pass view=1 to force a
    # read-only render even for the referral's own creator, since "Details"
    # and "Edit" are distinct user intents, not just a permission check.
    view_requested = request.GET.get('view') == '1' or request.POST.get('view') == '1'
    is_view_only = view_requested or current_staff is None or referral.raised_by_id != current_staff.id
    question_groups = _grouped_questions()

    errors = None
    if request.method == 'POST':
        if is_view_only:
            if is_ajax:
                return JsonResponse({'success': False}, status=403)
            return redirect(_safe_next(request, '/inclusion/panel/'))
        errors = _missing_required_answers(question_groups, request.POST)
        if not errors:
            for group in question_groups:
                for question in group['questions']:
                    answer = request.POST.get(f'question_{question.id}', '')
                    ReferralResponse.objects.update_or_create(
                        referral=referral, question=question, defaults={'answer': answer},
                    )
            if is_ajax:
                return JsonResponse({'success': True})
            return redirect(_safe_next(request, '/inclusion/panel/'))
        if is_ajax:
            return JsonResponse({'success': False, 'errors': errors}, status=400)
        for group in question_groups:
            for question in group['questions']:
                question.existing_answer = request.POST.get(f'question_{question.id}', '')
    else:
        existing_answers = {r.question_id: r.answer for r in referral.responses.all()}
        for group in question_groups:
            for question in group['questions']:
                question.existing_answer = existing_answers.get(question.id, '')

    main_concern_question, concern_details_question, remaining_question_groups = _split_question_groups(question_groups)

    return render(request, 'hubs/inclusion/panel/_referral_form_modal.html', {
        **_panel_base_context(request),
        'is_edit': True,
        'is_view_only': is_view_only,
        'referral': referral,
        'selected_student': referral.student,
        'question_groups': question_groups,
        'main_concern_question': main_concern_question,
        'concern_details_question': concern_details_question,
        'remaining_question_groups': remaining_question_groups,
        'errors': errors,
        'next': request.GET.get('next', request.POST.get('next', '')),
        **_referral_detail_context(referral, current_staff),
    })


def inclusion_panel_referral_delete(request, referral_id):
    referral = get_object_or_404(InclusionReferral, pk=referral_id)
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        current_staff = _current_staff(request)
        can_delete = (
            current_staff is not None
            and referral.raised_by_id == current_staff.id
            and _is_referral_unassigned(referral)
        )
        if can_delete:
            referral.delete()
        if is_ajax:
            return JsonResponse({'success': can_delete})
    return redirect(_safe_next(request, '/inclusion/panel/referrals/'))


def inclusion_panel_action_set_status(request, action_id):
    action = get_object_or_404(Action, pk=action_id)
    if request.method == 'POST':
        status = request.POST.get('status')
        if status in dict(Action.STATUS_CHOICES):
            action.status = status
            action.completed_at = timezone.now() if status == 'complete' else None
            action.save()
    return redirect(_safe_next(request, '/inclusion/panel/'))


def inclusion_panel_action_status_update(request, referral_id):
    # Posted from the status dropdown in Referral Details' own Actions
    # section - the standalone "View Actions" modal this used to back has
    # been folded into that one view (see DesignLanguage.md), so this is now
    # a pure status-update endpoint: update the one Action, then re-render
    # the whole Referral Details fragment (via the same shared context
    # inclusion_panel_referral_edit uses) so the dialog can swap it in place
    # without closing. Deliberately no is_view_only gate here - action
    # status is editable by any (sensitivity-filtered) panel staff
    # regardless of who raised the referral, matching the old Actions
    # modal's own permission model.
    referral = get_object_or_404(InclusionReferral.objects.select_related('student', 'raised_by'), pk=referral_id)
    current_staff = _current_staff(request)
    # Preserves whichever mode the dialog was already open in (see the "view"
    # hidden field _action_row.html adds when is_view_only) - action status
    # is editable either way, but re-rendering shouldn't flip a creator's
    # open "Referral Details" view into "Edit Referral" just because a
    # status toggle happens to recompute ownership as edit-eligible.
    is_view_only = request.POST.get('view') == '1' or current_staff is None or referral.raised_by_id != current_staff.id

    if request.method == 'POST':
        action = get_object_or_404(Action, pk=request.POST.get('action_id'), referral=referral)
        status = request.POST.get('status')
        if status in dict(Action.STATUS_CHOICES):
            action.status = status
            action.completed_at = timezone.now() if status == 'complete' else None
            action.save()

    question_groups = _grouped_questions()
    existing_answers = {r.question_id: r.answer for r in referral.responses.all()}
    for group in question_groups:
        for question in group['questions']:
            question.existing_answer = existing_answers.get(question.id, '')
    main_concern_question, concern_details_question, remaining_question_groups = _split_question_groups(question_groups)

    return render(request, 'hubs/inclusion/panel/_referral_form_modal.html', {
        **_panel_base_context(request),
        'is_edit': True,
        'is_view_only': is_view_only,
        'referral': referral,
        'selected_student': referral.student,
        'question_groups': question_groups,
        'main_concern_question': main_concern_question,
        'concern_details_question': concern_details_question,
        'remaining_question_groups': remaining_question_groups,
        'errors': None,
        'next': request.POST.get('next', ''),
        **_referral_detail_context(referral, current_staff),
    })


def inclusion_panel_referral_escalate(request, referral_id):
    referral = get_object_or_404(InclusionReferral, pk=referral_id)

    if request.method == 'POST':
        staff_id = request.POST.get('escalated_by') or None
        Escalation.objects.create(
            referral=referral,
            escalated_by_id=staff_id,
            reason=request.POST.get('reason', ''),
        )
        # Escalating doesn't change anything about this referral's own
        # panel/discussion state, so its status is left as whatever
        # _sync_referral_status already computed (normally 'open', since
        # escalation typically happens before any panel discussion) rather
        # than forcing a value that doesn't actually fit what happened.
        return redirect(_safe_next(request, '/inclusion/panel/referrals/'))

    return render(request, 'hubs/inclusion/panel/escalate_form.html', {
        **_panel_base_context(request),
        'referral': referral,
        'staff_list': staff_queryset_for_school_key(current_school_key(request)),
        'next': request.GET.get('next', ''),
    })


def inclusion_panel_escalations(request):
    scoped_students = student_queryset_for_school_key(current_school_key(request))
    escalations = Escalation.objects.filter(
        status='open', referral__student__in=scoped_students,
    ).select_related('referral__student')
    return render(request, 'hubs/inclusion/panel/escalations.html', {
        **_panel_base_context(request),
        'escalations': escalations,
    })


def inclusion_panel_escalation_resolve(request, escalation_id):
    escalation = get_object_or_404(Escalation, pk=escalation_id)
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        escalation.status = 'resolved'
        escalation.resolution_notes = request.POST.get('resolution_notes', '')
        escalation.resolved_at = timezone.now()
        escalation.save()
        if is_ajax:
            return JsonResponse({'success': True})
    return redirect('inclusion_panel_escalations')


def inclusion_panel_actions(request):
    school_key = current_school_key(request)
    current_staff = _current_staff(request)
    actions = Action.objects.filter(referral__student__in=student_queryset_for_school_key(school_key)).select_related(
        'referral__student', 'assigned_to', 'category',
    )
    actions = visible_actions_for(current_staff, actions)
    categories = visible_categories_for(current_staff)
    today = timezone.localdate()
    week_start = today - datetime.timedelta(days=today.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    return render(request, 'hubs/inclusion/panel/actions.html', {
        **_panel_base_context(request),
        'actions': actions,
        'categories': categories,
        'staff_list': staff_queryset_for_school_key(school_key),
        'status_choices': Action.STATUS_CHOICES,
        'today': today,
        'week_start': week_start,
        'week_end': week_end,
        'actions_count': actions.count(),
        'students_count': Student.objects.filter(referrals__actions__in=actions).distinct().count(),
        'referrals_count': InclusionReferral.objects.filter(actions__in=actions).distinct().count(),
    })


def inclusion_panel_action_new(request, referral_id):
    referral = get_object_or_404(InclusionReferral, pk=referral_id)
    categories = visible_categories_for(_current_staff(request))
    auto_assign_by_category = {
        category.id: (category.resolve_auto_assignee().id if category.resolve_auto_assignee() else None)
        for category in categories
    }
    # Only ever set when this link came from a live Discussion page (the one
    # place a panel_referral is known at the point an action is created) -
    # actions added from the standalone Actions page correctly stay
    # unattributed. See Action.origin_panel_referral for why this is
    # provenance-only rather than the action's primary relationship.
    origin_panel_referral_id = request.GET.get('panel_referral') or request.POST.get('panel_referral') or None

    if request.method == 'POST':
        category_id = request.POST.get('category') or None
        if category_id and not categories.filter(pk=category_id).exists():
            category_id = None
        Action.objects.create(
            referral=referral,
            category_id=category_id,
            assigned_to_id=request.POST.get('assigned_to') or None,
            due_date=request.POST.get('due_date') or None,
            note=request.POST.get('note', ''),
            origin_panel_referral_id=origin_panel_referral_id,
        )
        return redirect(_safe_next(request, '/inclusion/panel/actions/'))

    return render(request, 'hubs/inclusion/panel/action_form.html', {
        **_panel_base_context(request),
        'referral': referral,
        'categories': categories,
        'staff_list': staff_queryset_for_school_key(current_school_key(request)),
        'auto_assign_json': json.dumps(auto_assign_by_category),
        'next': request.GET.get('next', ''),
        'panel_referral_id': origin_panel_referral_id,
    })


def inclusion_panel_referral_question_settings(request):
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        action = request.POST.get('form_action')
        if action == 'add_category':
            next_order = (ReferralCategory.objects.aggregate(Max('order'))['order__max'] or 0) + 1
            ReferralCategory.objects.create(name=request.POST.get('name', ''), order=next_order)
        elif action == 'add_question':
            category_id = request.POST.get('category') or None
            next_order = (
                ReferralQuestion.objects.filter(category_id=category_id).aggregate(Max('order'))['order__max'] or 0
            ) + 1 if category_id else (
                ReferralQuestion.objects.filter(category__isnull=True).aggregate(Max('order'))['order__max'] or 0
            ) + 1
            ReferralQuestion.objects.create(
                category_id=category_id,
                label=request.POST.get('label', ''),
                order=next_order,
            )
        elif action == 'deactivate_category':
            ReferralCategory.objects.filter(pk=request.POST.get('category_id')).update(is_active=False)
        elif action == 'deactivate_question':
            ReferralQuestion.objects.filter(pk=request.POST.get('question_id')).update(is_active=False)
            if is_ajax:
                return JsonResponse({'success': True})
        return redirect('inclusion_panel_referral_question_settings')

    categories = ReferralCategory.objects.filter(is_active=True).prefetch_related('questions')
    flat_questions = ReferralQuestion.objects.filter(category__isnull=True, is_active=True).order_by('order')
    return render(request, 'hubs/inclusion/panel/referral_question_settings.html', {
        **_panel_base_context(request),
        'categories': categories,
        'flat_questions': flat_questions,
    })


def inclusion_panel_action_category_settings(request):
    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'add_category':
            next_order = (ActionCategory.objects.aggregate(Max('order'))['order__max'] or 0) + 1
            ActionCategory.objects.create(
                name=request.POST.get('name', ''),
                order=next_order,
                auto_assign_job_title=request.POST.get('auto_assign_job_title', ''),
                is_sensitive=bool(request.POST.get('is_sensitive')),
            )
        elif action == 'add_preset_category':
            name = request.POST.get('name', '')
            if name in ACTION_CATEGORY_PRESETS and not ActionCategory.objects.filter(name__iexact=name).exists():
                next_order = (ActionCategory.objects.aggregate(Max('order'))['order__max'] or 0) + 1
                ActionCategory.objects.create(name=name, order=next_order)
        elif action == 'deactivate_category':
            ActionCategory.objects.filter(pk=request.POST.get('category_id')).update(is_active=False)
        return redirect('inclusion_panel_action_category_settings')

    existing_names = set(ActionCategory.objects.values_list('name', flat=True))
    missing_presets = [name for name in ACTION_CATEGORY_PRESETS if name not in existing_names]
    return render(request, 'hubs/inclusion/panel/action_category_settings.html', {
        **_panel_base_context(request),
        'categories': ActionCategory.objects.filter(is_active=True),
        'missing_presets': missing_presets,
    })


def inclusion_panel_group_settings(request):
    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'deactivate_group':
            PanelGroup.objects.filter(pk=request.POST.get('group_id')).update(is_active=False)
        return redirect('inclusion_panel_group_settings')

    groups = list(
        PanelGroup.objects.filter(is_active=True).select_related('school', 'default_chair').prefetch_related(
            'members'
        )
    )
    for group in groups:
        group.active_member_count = sum(1 for m in group.members.all() if m.is_active)

    return render(request, 'hubs/inclusion/panel/panel_group_settings.html', {
        **_panel_base_context(request),
        'groups': groups,
    })


def _group_member_sort_key(member):
    if member.staff_id:
        return (member.staff.last_name, member.staff.first_name)
    return (str(member.external_contact or ''), '')


def _resolve_concrete_school(request):
    # A concrete single school - as opposed to the sidebar switcher sitting on
    # an aggregate view ('all'/'primary'/'secondary') - is the only case a
    # new Panel Group's school can be inferred silently. Aggregate views fall
    # through to showing the School field so the user picks one explicitly.
    key = current_school_key(request)
    if key in ('all', 'primary', 'secondary'):
        return None
    return School.objects.filter(pk=key, is_active=True).first()


def inclusion_panel_group_edit(request, group_id=None):
    group = get_object_or_404(PanelGroup, pk=group_id) if group_id else None
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        if group is None:
            name = request.POST.get('name', '').strip()
            school_id = request.POST.get('school') or None
            if not school_id:
                if is_ajax:
                    return JsonResponse({'success': False})
                return redirect('inclusion_panel_group_settings')
            if PanelGroup.objects.filter(is_active=True, name__iexact=name, school_id=school_id).exists():
                if is_ajax:
                    return JsonResponse({'success': False})
                return redirect('inclusion_panel_group_settings')
            group = PanelGroup.objects.create(name=name, school_id=school_id)
            if is_ajax:
                return JsonResponse({
                    'success': True,
                    'group': {
                        'id': group.id, 'name': group.name, 'school_id': group.school_id,
                        'school_name': group.school.name if group.school_id else None,
                    },
                })
            return redirect('inclusion_panel_group_settings')

        action = request.POST.get('form_action')
        if action == 'update_group_name':
            name = request.POST.get('name', '').strip()
            duplicate = not name or PanelGroup.objects.filter(
                is_active=True, name__iexact=name, school_id=group.school_id,
            ).exclude(pk=group.pk).exists()
            if duplicate:
                if is_ajax:
                    return JsonResponse({'success': False})
                return redirect(_safe_next(request, 'inclusion_panel_group_settings'))
            group.name = name
            group.save(update_fields=['name'])
        elif action == 'update_group_chair':
            group.default_chair_id = request.POST.get('default_chair') or None
            group.save(update_fields=['default_chair'])
        elif action == 'update_member_expertise':
            member = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group=group)
            member.expertise_id = request.POST.get('expertise') or None
            member.save(update_fields=['expertise'])
        elif action == 'add_group_member':
            staff_id = request.POST.get('staff') or None
            external_contact_id = request.POST.get('external_contact') or None
            expertise_id = request.POST.get('expertise') or None
            if staff_id:
                PanelGroupMember.objects.update_or_create(
                    panel_group=group, staff_id=staff_id,
                    defaults={
                        'expertise_id': expertise_id, 'external_contact_id': None,
                        'is_active': True, 'deactivated_at': None,
                    },
                )
            elif external_contact_id:
                PanelGroupMember.objects.update_or_create(
                    panel_group=group, external_contact_id=external_contact_id,
                    defaults={'expertise_id': expertise_id, 'is_active': True, 'deactivated_at': None},
                )
        elif action == 'toggle_group_member_active':
            member = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group=group)
            member.is_active = not member.is_active
            member.deactivated_at = timezone.now() if not member.is_active else None
            member.save()
            if not member.is_active and member.staff_id:
                if group.default_chair_id == member.staff_id:
                    group.default_chair = None
                    group.save()
                # A panel's roster is this same live group, so a panel can't
                # keep pointing chair at someone just deactivated from it -
                # except a completed panel, whose chair is a historical
                # record that shouldn't change after the fact.
                group.panels.filter(chair_id=member.staff_id).exclude(status='complete').update(chair=None)
        if is_ajax:
            return JsonResponse({'success': True})
        return redirect(_safe_next(request, 'inclusion_panel_group_settings'))

    if group is None:
        school_id = request.GET.get('school')
        preselect_school = School.objects.filter(pk=school_id).first() if school_id else None
        if preselect_school is None:
            preselect_school = _resolve_concrete_school(request)
        return render(request, 'hubs/inclusion/panel/_panel_group_form_modal.html', {
            **_panel_base_context(request),
            'group': None,
            'schools': School.objects.filter(is_active=True),
            'preselect_school_id': preselect_school.id if preselect_school else '',
            'preselect_school_name': preselect_school.name if preselect_school else '',
            'existing_groups': list(PanelGroup.objects.filter(is_active=True).values('name', 'school_id')),
        })

    members = list(
        group.members.select_related('staff', 'external_contact', 'expertise').all()
    )
    members.sort(key=_group_member_sort_key)
    active_members = [m for m in members if m.is_active]
    inactive_members = [m for m in members if not m.is_active]

    return render(request, 'hubs/inclusion/panel/_panel_group_form_modal.html', {
        **_panel_base_context(request),
        'group': group,
        'active_members': active_members,
        'inactive_members': inactive_members,
        'chair_choices': [m for m in active_members if m.staff_id],
        'existing_staff_ids': {m.staff_id for m in active_members if m.staff_id},
        'existing_external_ids': {m.external_contact_id for m in active_members if m.external_contact_id},
        'available_expertise': Expertise.objects.visible_for_school(group.school_id),
        'staff_list': Staff.objects.filter(is_active=True).select_related('school'),
        'external_contacts': ExternalContact.objects.filter(is_active=True),
        'existing_groups': list(
            PanelGroup.objects.filter(is_active=True).exclude(pk=group.pk).values('name', 'school_id')
        ),
        'next': request.GET.get('next', ''),
    })


def inclusion_panel_expertise_settings(request):
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        action = request.POST.get('form_action')
        if action == 'add_expertise':
            name = request.POST.get('name', '').strip()
            next_order = (Expertise.objects.aggregate(Max('order'))['order__max'] or 0) + 1
            expertise = Expertise.objects.create(name=name, order=next_order)
            if is_ajax:
                return JsonResponse({'success': True, 'expertise': {'id': expertise.id, 'name': expertise.name}})
        elif action == 'deactivate_expertise':
            Expertise.objects.filter(pk=request.POST.get('expertise_id')).update(is_active=False)
            if is_ajax:
                return JsonResponse({'success': True})
        return redirect('inclusion_panel_expertise_settings')

    return render(request, 'hubs/inclusion/panel/expertise_settings.html', {
        **_panel_base_context(request),
        'expertise_list': Expertise.objects.filter(is_active=True).select_related('school'),
    })


def inclusion_panel_expertise_quick_add(request):
    if request.method != 'POST':
        return JsonResponse({'success': False}, status=405)
    name = request.POST.get('name', '').strip()
    school_id = request.POST.get('school_id') or None
    if not name:
        return JsonResponse({'success': False})
    next_order = (Expertise.objects.aggregate(Max('order'))['order__max'] or 0) + 1
    expertise = Expertise.objects.create(name=name, order=next_order, school_id=school_id)
    return JsonResponse({'success': True, 'expertise': {'id': expertise.id, 'name': expertise.name}})


def inclusion_panel_external_contact_quick_add(request):
    if request.method != 'POST':
        return JsonResponse({'success': False}, status=405)
    name = request.POST.get('name', '').strip()
    job_title = request.POST.get('job_title', '').strip()
    if not name:
        return JsonResponse({'success': False})
    contact = ExternalContact.objects.create(name=name, job_title=job_title)
    return JsonResponse({
        'success': True,
        'contact': {'id': contact.id, 'name': contact.name, 'job_title': contact.job_title},
    })


def inclusion_panel_meetings(request):
    _sync_delayed_panels()
    today = timezone.localdate()
    school_key = current_school_key(request)
    is_aggregate_view = school_key in (None, '', 'all', 'primary', 'secondary')
    meetings = []
    upcoming_meetings = []
    past_meetings = []
    next_marked = False
    panels_this_year = 0
    status_counts = {'draft': 0, 'ready': 0, 'running': 0, 'delayed': 0, 'complete': 0}
    panels = _panels_for_school_key(
        Panel.objects.select_related('chair', 'panel_group__school').prefetch_related('panel_referrals', 'members').order_by('date'),
        school_key,
    )
    for panel in panels:
        if panel.date.year == today.year:
            panels_this_year += 1
        status_counts[panel.status] = status_counts.get(panel.status, 0) + 1
        is_next = panel.status not in ('complete', 'delayed') and panel.date >= today and not next_marked
        if is_next:
            next_marked = True
        referral_count = sum(1 for pr in panel.panel_referrals.all() if pr.removed_at is None)
        discussed_count = sum(
            1 for pr in panel.panel_referrals.all() if pr.removed_at is None and pr.discussion_status == 'discussed'
        )
        total_duration = sum(
            (pr.duration for pr in panel.panel_referrals.all() if pr.removed_at is None and pr.duration),
            datetime.timedelta(),
        )
        if panel.status == 'complete':
            # Frozen historical fact - who actually checked in - not the
            # live group roster, which may have changed since.
            member_count = panel.members.filter(checked_in_at__isnull=False).count()
        else:
            # Nobody's checked in yet for an upcoming/in-progress panel, so
            # the meaningful number here is the group's live roster size.
            member_count = panel.panel_group.members.filter(is_active=True).count() if panel.panel_group_id else 0
        entry = {
            'panel': panel,
            'is_next': is_next,
            'referral_count': referral_count,
            'discussed_count': discussed_count,
            'member_count': member_count,
            'total_duration': total_duration,
        }
        meetings.append(entry)
        (past_meetings if panel.status == 'complete' else upcoming_meetings).append(entry)
    past_meetings.reverse()
    meetings = upcoming_meetings + past_meetings
    panels_needing_referrals = sum(1 for m in upcoming_meetings if not m['referral_count'])
    return render(request, 'hubs/inclusion/panel/meetings.html', {
        **_panel_base_context(request),
        'meetings': meetings,
        'panels_needing_referrals': panels_needing_referrals,
        'panels_this_year': panels_this_year,
        'panels_draft': status_counts['draft'],
        'panels_ready': status_counts['ready'],
        'panels_running': status_counts['running'],
        'panels_delayed': status_counts['delayed'],
        'panels_complete': status_counts['complete'],
        'today': today,
        'is_aggregate_view': is_aggregate_view,
    })


def inclusion_panel_meeting_new(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        date = request.POST.get('date')
        parsed_date = datetime.date.fromisoformat(date) if date else timezone.localdate()
        if parsed_date < timezone.localdate():
            parsed_date = timezone.localdate()
        panel = Panel.objects.create(
            date=parsed_date,
            time=request.POST.get('time') or None,
            panel_group_id=request.POST.get('panel_group') or None,
        )
        setup_url = reverse('inclusion_panel_meeting_setup', args=[panel.id])
        if is_ajax:
            return JsonResponse({'success': True, 'redirect': setup_url})
        return redirect(setup_url)

    school_key = current_school_key(request)
    if school_key in (None, '', 'all'):
        schools = School.objects.filter(is_active=True).order_by('name')
    elif school_key in ('primary', 'secondary'):
        schools = School.objects.filter(is_active=True, category=school_key.capitalize())
    else:
        schools = School.objects.filter(is_active=True, pk=school_key)
    selected_school = schools.first() if schools.count() == 1 else None

    return render(request, 'hubs/inclusion/panel/_panel_meeting_form_modal.html', {
        **_panel_base_context(request),
        'panel_groups': PanelGroup.objects.filter(is_active=True).select_related('school'),
        'today': timezone.localdate(),
        'current_staff': _current_staff(request),
        'schools': schools,
        'selected_school_id': selected_school.id if selected_school else '',
        'school_locked': selected_school is not None,
    })


def inclusion_panel_meeting_start(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    if request.method == 'POST':
        agenda_url = reverse('inclusion_panel_meeting_agenda', args=[panel.id])
        if panel.date == timezone.localdate():
            just_started = panel.started_at is None
            if just_started:
                panel.started_at = timezone.now()
                panel.status = 'running'
                panel.save()
            return redirect(f'{agenda_url}?just_started=1' if just_started else agenda_url)
        return redirect(f'{agenda_url}?not_today=1')
    return redirect('inclusion_panel_meetings')


def inclusion_panel_meeting_delete(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        can_delete = panel.started_at is None and panel.date >= timezone.localdate()
        if can_delete:
            panel.delete()
        if is_ajax:
            return JsonResponse({'success': can_delete})
    return redirect('inclusion_panel_meetings')


def inclusion_panel_meeting_setup(request, panel_id):
    _sync_delayed_panels()
    panel = get_object_or_404(Panel, pk=panel_id)

    # 'closed' means fully handled - no outstanding action, no follow-up due
    # (that's a distinct status; see the Reviews Due / followups_due queue
    # below). A closed referral not currently on an active agenda must not
    # resurface as a "New Referral" - it isn't new, it's finished.
    unassigned_referrals = InclusionReferral.objects.select_related('student', 'raised_by').exclude(
        pk__in=PanelReferral.objects.filter(removed_at__isnull=True).values_list('referral_id', flat=True)
    ).exclude(status='closed').prefetch_related('responses__question__category')
    if panel.panel_group_id and panel.panel_group.school_id:
        unassigned_referrals = unassigned_referrals.filter(student__school_id=panel.panel_group.school_id)

    agenda = panel.panel_referrals.filter(removed_at__isnull=True).select_related(
        'referral__student', 'referral__raised_by'
    ).prefetch_related('referral__responses__question__category').order_by('agenda_order', 'id')

    agenda_student_ids = [a.referral.student_id for a in agenda]
    followups_due = _due_followups(
        panel, as_of=panel.date + datetime.timedelta(days=7),
    ).exclude(referral__student_id__in=agenda_student_ids)

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'update_details':
            new_date = request.POST.get('date')
            panel.update_details(
                date=datetime.date.fromisoformat(new_date) if new_date else None,
                time=request.POST.get('time') or None,
                chair_id=request.POST.get('chair') or None,
                panel_group_id=request.POST.get('panel_group') or None,
            )
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action in ('add_referral', 'add_followup_to_agenda'):
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
                _sync_referral_status(pr.referral)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                # panel_referral_id lets the drag-and-drop client follow up
                # with a reorder_agenda call to place the new row where the
                # user actually dropped it, rather than always at the bottom.
                return JsonResponse({'success': True, 'panel_referral_id': pr.id if pr else None})
        elif action == 'remove_referral_from_agenda':
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            pr.removed_at = timezone.now()
            pr.removed_by_id = request.POST.get('removed_by') or None
            pr.save()
            _sync_referral_status(pr.referral)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action == 'update_priority':
            referral = get_object_or_404(InclusionReferral, pk=request.POST.get('referral_id'))
            priority = request.POST.get('priority', '')
            if priority == '' or priority in dict(InclusionReferral.PRIORITY_CHOICES):
                referral.priority = priority
                referral.save()
        elif action == 'reorder_agenda':
            ordered_ids = request.POST.getlist('panel_referral_id')
            referrals = {pr.id: pr for pr in PanelReferral.objects.filter(panel=panel, pk__in=ordered_ids)}
            updated = []
            for index, pr_id in enumerate(ordered_ids, start=1):
                pr = referrals.get(int(pr_id))
                if pr is not None:
                    pr.agenda_order = index
                    updated.append(pr)
            PanelReferral.objects.bulk_update(updated, ['agenda_order'])
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action == 'move_agenda_referral':
            _move_agenda_referral(agenda, request.POST.get('panel_referral_id'), request.POST.get('direction'))
        elif action == 'toggle_ready':
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

    for referral in unassigned_referrals:
        referral.primary_concern_category = _primary_concern_category(referral)
    for fpr in followups_due:
        fpr.primary_concern_category = _primary_concern_category(fpr.referral)

    is_panel_staff = _is_panel_staff(_current_staff(request))

    # Referral Selection's "All" tab merges New Referrals and Reviews Due
    # into one list - each entry tagged with its origin so the shared row
    # partial knows which pill/fields/add-action to use.
    new_entries = [
        {
            'referral': referral, 'origin': 'new',
            'primary_concern_category': referral.primary_concern_category,
            'follow_up_date': None, 'last_discussed': None,
            'actions_total': None, 'actions_complete': None,
        }
        for referral in unassigned_referrals
    ]

    today = timezone.localdate()
    followup_entries = []
    for fpr in followups_due:
        actions_qs = fpr.referral.actions.all()
        if not is_panel_staff:
            actions_qs = actions_qs.exclude(category__is_sensitive=True)
        status_counts = Counter(actions_qs.values_list('status', flat=True))
        actions_total = status_counts['complete'] + status_counts['incomplete']
        discussed_count = fpr.referral.panel_referrals.filter(
            removed_at__isnull=True, discussion_status='discussed',
        ).count()
        followup_entries.append({
            'referral': fpr.referral, 'origin': 'followup',
            'primary_concern_category': fpr.primary_concern_category,
            'follow_up_date': fpr.follow_up_date, 'last_discussed': fpr.panel.date,
            'follow_up_overdue': bool(fpr.follow_up_date and fpr.follow_up_date < today),
            'review_label': _review_label(discussed_count),
            'actions_total': actions_total, 'actions_complete': status_counts['complete'],
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
        pr.primary_concern_category = _primary_concern_category(pr.referral)
        prev_pr = last_discussed_by_referral.get(pr.referral_id)
        pr.last_discussed_panel = prev_pr.panel if prev_pr else None
        pr.follow_up_date = prev_pr.follow_up_date if prev_pr else None
        pr.follow_up_overdue = bool(pr.follow_up_date and pr.follow_up_date < today)
        pr.review_label = _review_label(discussed_counts_by_referral[pr.referral_id])
        pr.actions_total = None
        pr.actions_complete = None
        if pr.last_discussed_panel:
            actions_qs = pr.referral.actions.all()
            if not is_panel_staff:
                actions_qs = actions_qs.exclude(category__is_sensitive=True)
            status_counts = Counter(actions_qs.values_list('status', flat=True))
            pr.actions_total = status_counts['complete'] + status_counts['incomplete']
            pr.actions_complete = status_counts['complete']

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
    })


def inclusion_panel_meeting_agenda(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    today = timezone.localdate()

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'start_meeting':
            if panel.started_at is None:
                now = timezone.now()
                panel.started_at = now
                panel.date = timezone.localdate(now)
                panel.time = timezone.localtime(now).time()
                panel.status = 'running'
                panel.save()
        elif action == 'check_in':
            gm = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group_id=panel.panel_group_id)
            PanelMember.objects.update_or_create(
                panel=panel, panel_group_member=gm,
                defaults={'checked_in_at': timezone.now(), 'left_at': None},
            )
        elif action == 'mark_left':
            gm = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group_id=panel.panel_group_id)
            PanelMember.objects.filter(panel=panel, panel_group_member=gm).update(left_at=timezone.now())
        elif action == 'unassign_referral':
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            pr.removed_at = timezone.now()
            pr.removed_by_id = request.POST.get('removed_by') or None
            pr.save()
            _sync_referral_status(pr.referral)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action == 'update_priority':
            referral = get_object_or_404(InclusionReferral, pk=request.POST.get('referral_id'))
            priority = request.POST.get('priority', '')
            if priority == '' or priority in dict(InclusionReferral.PRIORITY_CHOICES):
                referral.priority = priority
                referral.save()
        elif action == 'reorder_agenda':
            ordered_ids = request.POST.getlist('panel_referral_id')
            referrals = {pr.id: pr for pr in PanelReferral.objects.filter(panel=panel, pk__in=ordered_ids)}
            updated = []
            for index, pr_id in enumerate(ordered_ids, start=1):
                pr = referrals.get(int(pr_id))
                if pr is not None:
                    pr.agenda_order = index
                    updated.append(pr)
            PanelReferral.objects.bulk_update(updated, ['agenda_order'])
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': True})
        elif action == 'move_agenda_referral':
            pending_siblings = panel.panel_referrals.filter(
                removed_at__isnull=True, discussion_status='pending'
            ).order_by('agenda_order', 'id')
            _move_agenda_referral(pending_siblings, request.POST.get('panel_referral_id'), request.POST.get('direction'))
        elif action == 'end_panel_meeting':
            panel.status = 'complete'
            panel.ended_at = timezone.now()
            panel.save()
            for pr in panel.panel_referrals.filter(discussion_status='pending', discussion_started_at__isnull=False):
                _stop_discussion_timer(pr)
            return redirect('inclusion_panel_meetings')
        elif action == 'start_discussion':
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
                    _stop_discussion_timer(other)
                pr.discussion_status = 'pending'
                pr.discussion_started_at = timezone.now()
                pr.save()
                _sync_referral_status(pr.referral)
            return redirect('inclusion_panel_discussion', panel_referral_id=pr.id)
        return redirect('inclusion_panel_meeting_agenda', panel_id=panel.id)

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
        pr.stage, pr.stage_label = _panel_referral_stage(pr)

    pending = sorted(
        (pr for pr in panel_referrals if pr.discussion_status == 'pending'),
        key=lambda pr: (pr.agenda_order, pr.id),
    )
    discussed = [pr for pr in panel_referrals if pr.discussion_status == 'discussed']
    for pr in discussed:
        if pr.duration:
            total_seconds = int(pr.duration.total_seconds())
            h, rem = divmod(total_seconds, 3600)
            m, s = divmod(rem, 60)
            pr.duration_display = f'{h}:{m:02d}:{s:02d}'
        else:
            pr.duration_display = '—'
    total = len(pending) + len(discussed)
    progress_pct = round(len(discussed) / total * 100) if total else 0

    scheduled_at = timezone.make_aware(
        datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
    )
    show_schedule_warning = panel.started_at is None and timezone.now() < scheduled_at

    members = _panel_member_roster(panel)

    return render(request, 'hubs/inclusion/panel/meeting_agenda.html', {
        **_panel_base_context(request),
        'panel': panel,
        'pending': pending,
        'discussed': discussed,
        'progress_pct': progress_pct,
        'members': members,
        'just_started': request.GET.get('just_started') == '1',
        'scheduled_at': scheduled_at,
        'show_schedule_warning': show_schedule_warning,
        'today': today,
    })


def inclusion_panel_discussion(request, panel_referral_id):
    panel_referral = get_object_or_404(
        PanelReferral.objects.select_related('referral__student', 'referral__raised_by', 'panel'),
        pk=panel_referral_id,
    )
    referral = panel_referral.referral

    current_staff = _current_staff(request)
    is_panel_staff = _is_panel_staff(current_staff)

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'mark_discussed':
            if panel_referral.discussion_started_at:
                elapsed = timezone.now() - panel_referral.discussion_started_at
                panel_referral.duration = (panel_referral.duration or datetime.timedelta()) + elapsed
                panel_referral.discussion_started_at = None
            panel_referral.discussion_status = 'discussed'
            if request.POST.get('requires_followup') == 'yes':
                panel_referral.follow_up_date = request.POST.get('follow_up_date') or None
                panel_referral.follow_up_status = 'incomplete'
            else:
                panel_referral.follow_up_date = None
                panel_referral.follow_up_status = ''
            panel_referral.save()
            _sync_referral_status(referral)
            return redirect('inclusion_panel_meeting_agenda', panel_id=panel_referral.panel_id)
        elif action == 'add_panel_note':
            body = request.POST.get('body', '').strip()
            if body:
                PanelReferralNote.objects.create(
                    panel_referral=panel_referral,
                    author_id=request.POST.get('author') or None,
                    body=body,
                )
        elif action == 'add_note' and is_panel_staff:
            body = request.POST.get('body', '').strip()
            if body:
                StudentNote.objects.create(
                    student=referral.student,
                    author_id=request.POST.get('author') or None,
                    body=body,
                )
        elif action == 'edit_note' and is_panel_staff:
            note = get_object_or_404(StudentNote, pk=request.POST.get('note_id'), student=referral.student)
            note.body = request.POST.get('body', note.body)
            note.save()
        return redirect('inclusion_panel_discussion', panel_referral_id=panel_referral.id)

    # Pure display - starting/resuming the discussion timer happens only via
    # the explicit 'start_discussion' POST action on
    # inclusion_panel_meeting_agenda (the Discuss/Continue Discussion
    # buttons on the Panel Agenda page, gated on panel.started_at). A GET
    # here (a refresh, browser back/forward, or the Referral Details modal's
    # "View Discussion Page" link) must never mutate discussion_status or
    # restart discussion_started_at.
    previous_referrals = list(
        InclusionReferral.objects.filter(student=referral.student)
        .exclude(pk=referral.pk)
        .prefetch_related('responses__question__category')
    )
    for prev in previous_referrals:
        prev.response_groups = _response_groups(prev)

    actions = referral.actions.select_related('assigned_to', 'category')
    if not is_panel_staff:
        actions = actions.exclude(category__is_sensitive=True)

    context = {
        **_panel_base_context(request),
        'panel_referral': panel_referral,
        'referral': referral,
        'student': referral.student,
        'response_groups': _response_groups(referral),
        'previous_referrals': previous_referrals,
        'actions': actions,
        'is_panel_staff': is_panel_staff,
        'panel_notes': panel_referral.notes.select_related('author'),
        'staff_list': Staff.objects.filter(is_active=True),
    }
    if is_panel_staff:
        context['notes'] = referral.student.notes.select_related('author')

    return render(request, 'hubs/inclusion/panel/discussion.html', context)


def inclusion_panel_action_edit(request, action_id):
    action = get_object_or_404(Action.objects.select_related('referral__student'), pk=action_id)
    is_panel_staff = _is_panel_staff(_current_staff(request))
    if not is_panel_staff and action.category_id and action.category.is_sensitive:
        return redirect(_safe_next(request, '/inclusion/panel/actions/'))

    categories = ActionCategory.objects.filter(is_active=True)
    if not is_panel_staff:
        categories = categories.exclude(is_sensitive=True)
    auto_assign_by_category = {
        category.id: (category.resolve_auto_assignee().id if category.resolve_auto_assignee() else None)
        for category in categories
    }

    if request.method == 'POST':
        category_id = request.POST.get('category') or None
        if category_id and not categories.filter(pk=category_id).exists():
            category_id = None
        action.category_id = category_id
        action.assigned_to_id = request.POST.get('assigned_to') or None
        action.due_date = request.POST.get('due_date') or None
        action.note = request.POST.get('note', '')
        new_status = request.POST.get('status', action.status)
        if new_status != action.status:
            action.completed_at = timezone.now() if new_status == 'complete' else None
        action.status = new_status
        action.save()
        return redirect(_safe_next(request, '/inclusion/panel/actions/'))

    return render(request, 'hubs/inclusion/panel/action_form.html', {
        **_panel_base_context(request),
        'is_edit': True,
        'action': action,
        'referral': action.referral,
        'categories': categories,
        'staff_list': Staff.objects.filter(is_active=True),
        'auto_assign_json': json.dumps(auto_assign_by_category),
        'next': request.GET.get('next', ''),
    })
