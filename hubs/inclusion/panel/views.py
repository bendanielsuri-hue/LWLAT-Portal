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


def _col_width(strings, max_ch, min_ch=4):
    # Shared by Students/Referrals/Actions row-detail facts columns - each
    # column's width is the longest label+value string actually present
    # across every row currently displayed, clamped to [min_ch, max_ch].
    longest = max((len(s) for s in strings), default=min_ch)
    return f'{max(min_ch, min(longest, max_ch))}ch'


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


def _token_name_filter(tokens, *fields):
    # Every whitespace-separated token must match somewhere across the given
    # fields (AND across tokens, OR across fields per token) - "Be S" finds
    # "Ben Suri" (token "Be" matches first_name, "S" matches last_name), the
    # shared matching rule for every search surface (see InteractionLanguage.md
    # "Search").
    q = Q()
    for token in tokens:
        token_q = Q()
        for field in fields:
            token_q |= Q(**{f'{field}__icontains': token})
        q &= token_q
    return q


# Single shared search endpoint behind every Search box that queries real DB
# data (Panel general search, Add Referral's student picker, Add Member's
# staff/external picker) - one parameterized view rather than one endpoint
# per picker, so debounce/min-chars/token-matching only ever need fixing in
# one place. See docs/adr/0006-shared-search-endpoint-server-fetch-pickers.md.
PICKER_RESULT_LIMIT = 8


def inclusion_panel_search(request):
    q = request.GET.get('q', '').strip()
    tokens = q.split()
    if len(q) < 2:
        return JsonResponse({'results': []})

    kind = request.GET.get('kind', 'all')
    school_key = current_school_key(request)
    scoped_students = student_queryset_for_school_key(school_key)

    if kind == 'student':
        students = scoped_students.filter(_token_name_filter(tokens, 'first_name', 'last_name'))[:PICKER_RESULT_LIMIT]
        results = [{
            'id': s.id,
            'name': f'{s.first_name} {s.last_name}',
            'subtitle': f'Year {s.year_group}' + (f' · {s.reg_form}' if s.reg_form else '') if s.year_group else '',
        } for s in students]
        return JsonResponse({'results': results})

    if kind in ('staff', 'external'):
        exclude_ids = {int(i) for i in request.GET.get('exclude', '').split(',') if i.strip().isdigit()}
        results = []
        if kind == 'staff':
            mode = request.GET.get('mode', 'mat')
            staff_qs = Staff.objects.filter(is_active=True).select_related('school')
            if mode == 'school':
                staff_qs = staff_qs.filter(school_id=request.GET.get('school_id') or None)
            staff_qs = staff_qs.filter(_token_name_filter(tokens, 'first_name', 'last_name'))[:PICKER_RESULT_LIMIT]
            for staff in staff_qs:
                results.append({
                    'source': 'staff',
                    'id': staff.id,
                    'name': f'{staff.first_name} {staff.last_name}',
                    'subtitle': staff.job_title or '',
                    'school_name': staff.school.name if staff.is_mat_staff and staff.school_id else '',
                    'photo_url': staff.photo.url if staff.photo else '',
                    'already_member': staff.id in exclude_ids,
                })
        else:
            contacts = ExternalContact.objects.filter(is_active=True).filter(
                _token_name_filter(tokens, 'name')
            )[:PICKER_RESULT_LIMIT]
            for contact in contacts:
                results.append({
                    'source': 'external',
                    'id': contact.id,
                    'name': contact.name,
                    'subtitle': contact.job_title or '',
                    'school_name': '',
                    'already_member': contact.id in exclude_ids,
                })
        return JsonResponse({'results': results})

    # kind == 'all': Panel's own general search - the only surface that
    # legitimately spans more than one entity type, so it's the only one
    # that groups results by kind (see InteractionLanguage.md "Search").
    is_panel_staff = _is_panel_staff(_current_staff(request))

    students_url = reverse('inclusion_panel_students')
    referrals_url = reverse('inclusion_panel_referrals')
    actions_url = reverse('inclusion_panel_actions')

    def name_param(student):
        return f'name={quote(f"{student.first_name} {student.last_name}")}'

    results = []

    students = scoped_students.filter(_token_name_filter(tokens, 'first_name', 'last_name'))[:5]
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
                # Actions' Name filter is a student-id select, not a text
                # search (issue #13) - unlike Students/Referrals above.
                {'label': f'Actions ({actions_count})', 'url': f'{actions_url}?name={student.id}', 'disabled': actions_count == 0},
            ],
        })

    staff_members = staff_queryset_for_school_key(school_key).filter(
        _token_name_filter(tokens, 'first_name', 'last_name')
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


def _my_actions_context(current_staff, is_panel_staff):
    # Shared by inclusion_panel_home (full page) and
    # inclusion_panel_action_set_status's AJAX branch (re-renders just the My
    # Actions card fragment after a status change) - one place computing
    # these counts so both stay in sync.
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
    actions_ctx = _my_actions_context(current_staff, is_panel_staff)
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
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    today = timezone.localdate()
    school_key = current_school_key(request)
    is_aggregate_view = school_key in (None, '', 'all', 'primary', 'secondary')

    name_filter = request.GET.get('name') or ''
    year_filter = request.GET.get('year') or ''
    house_filter = request.GET.get('house') or ''
    reg_filter = request.GET.get('reg') or ''
    has_referrals_filter = request.GET.get('has_referrals') == '1'
    overdue_actions_filter = request.GET.get('overdue_actions') == '1'
    # Candidate filters behind "More filters" (issue #9).
    sen_status_filter = request.GET.get('sen_status') or ''
    gender_filter = request.GET.get('gender') or ''
    ethnicity_filter = request.GET.get('ethnicity') or ''
    tutor_filter = request.GET.get('tutor') or ''
    is_pp_filter = request.GET.get('is_pp') == '1'
    is_eal_filter = request.GET.get('is_eal') == '1'
    is_lac_filter = request.GET.get('is_lac') == '1'
    is_young_carer_filter = request.GET.get('is_young_carer') == '1'
    is_more_able_filter = request.GET.get('is_more_able') == '1'

    base_students = student_queryset_for_school_key(school_key)

    # Option lists computed from the school-scoped set, before the filters
    # below are applied - same convention as inclusion_panel_meetings'
    # chair/academic-year choices, so Year/Reg don't shrink each other's
    # dropdowns as other filters change.
    years = sorted({y for y in base_students.values_list('year_group', flat=True) if y is not None})
    forms = sorted({f for f in base_students.values_list('reg_form', flat=True) if f})
    forms_by_year = {
        year: sorted({
            f for f in base_students.filter(year_group=year).values_list('reg_form', flat=True) if f
        })
        for year in years
    }
    houses = sorted({h for h in base_students.values_list('house', flat=True) if h})
    has_houses = bool(houses)

    # Count(..., distinct=True) on each reverse relation is immune to the
    # join fan-out from combining referrals and actions in one annotate()
    # call - each COUNT(DISTINCT <that table's pk>) dedupes on its own
    # column regardless of how many joined rows precede it.
    students = base_students.annotate(
        referrals_count=Count('referrals', distinct=True),
        actions_count=Count('referrals__actions', distinct=True),
        overdue_actions_count=Count(
            'referrals__actions',
            filter=Q(referrals__actions__status='incomplete', referrals__actions__due_date__lt=today),
            distinct=True,
        ),
    ).select_related('school', 'form_tutor')
    if name_filter:
        students = students.filter(Q(first_name__icontains=name_filter) | Q(last_name__icontains=name_filter))
    if year_filter:
        students = students.filter(year_group=year_filter)
    if house_filter:
        students = students.filter(house=house_filter)
    if reg_filter:
        students = students.filter(reg_form=reg_filter)
    if has_referrals_filter:
        students = students.filter(referrals_count__gt=0)
    if overdue_actions_filter:
        students = students.filter(overdue_actions_count__gt=0)
    if sen_status_filter:
        students = students.filter(sen_status=sen_status_filter)
    if gender_filter:
        students = students.filter(gender=gender_filter)
    if ethnicity_filter:
        students = students.filter(ethnicity=ethnicity_filter)
    if tutor_filter:
        students = students.filter(form_tutor_id=tutor_filter)
    if is_pp_filter:
        students = students.filter(is_pp=True)
    if is_eal_filter:
        students = students.filter(is_eal=True)
    if is_lac_filter:
        students = students.filter(is_lac=True)
    if is_young_carer_filter:
        students = students.filter(is_young_carer=True)
    if is_more_able_filter:
        students = students.filter(is_more_able=True)
    students = list(students.order_by('last_name', 'first_name'))
    for student in students:
        student.has_pills = bool(
            student.sen_status or student.is_pp or student.is_eal
            or student.is_lac or student.is_young_carer or student.is_more_able
        )

    active_filter_count = sum(
        1 for v in (
            name_filter, year_filter, house_filter, reg_filter, has_referrals_filter, overdue_actions_filter,
            sen_status_filter, gender_filter, ethnicity_filter, tutor_filter,
            is_pp_filter, is_eal_filter, is_lac_filter, is_young_carer_filter, is_more_able_filter,
        ) if v
    )

    col_widths = {
        'yearform': _col_width(
            [f'Year {s.year_group}' + (f' (House {s.house})' if s.house else '') for s in students]
            + [f'Form {s.reg_form}' + (f' ({s.form_tutor})' if s.form_tutor else '') for s in students],
            max_ch=30,
        ),
        'genderethnicity': _col_width(
            [s.get_gender_display() or '—' for s in students]
            + [s.get_ethnicity_display() or '—' for s in students],
            max_ch=22,
        ),
        'counts': _col_width(
            [f'Referrals: {s.referrals_count}' for s in students]
            + [f'Actions: {s.actions_count}' for s in students],
            max_ch=16,
        ),
    }

    context = {
        **_panel_base_context(request),
        'students': students,
        'years': years,
        'forms': forms,
        'forms_by_year_json': json.dumps(forms_by_year),
        'has_houses': has_houses,
        'houses': houses,
        'name_filter': name_filter,
        'year_filter': year_filter,
        'house_filter': house_filter,
        'reg_filter': reg_filter,
        'has_referrals_filter': has_referrals_filter,
        'overdue_actions_filter': overdue_actions_filter,
        'sen_status_filter': sen_status_filter,
        'sen_status_choices': Student.SEN_STATUS_CHOICES,
        'gender_filter': gender_filter,
        'gender_choices': Student.GENDER_CHOICES,
        'ethnicity_filter': ethnicity_filter,
        'ethnicity_choices': Student.ETHNICITY_CHOICES,
        'tutor_filter': tutor_filter,
        'tutors': staff_queryset_for_school_key(school_key).filter(tutees__isnull=False).distinct().order_by('last_name', 'first_name'),
        'is_pp_filter': is_pp_filter,
        'is_eal_filter': is_eal_filter,
        'is_lac_filter': is_lac_filter,
        'is_young_carer_filter': is_young_carer_filter,
        'is_more_able_filter': is_more_able_filter,
        'active_filter_count': active_filter_count,
        'students_count': len(students),
        'referrals_count': sum(s.referrals_count for s in students),
        'actions_count': sum(s.actions_count for s in students),
        'is_aggregate_view': is_aggregate_view,
        'col_widths': col_widths,
    }
    template = 'hubs/inclusion/panel/_students_filtered_content.html' if is_ajax else 'hubs/inclusion/panel/students.html'
    return render(request, template, context)


def inclusion_panel_referrals(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    is_aggregate_view = school_key in (None, '', 'all', 'primary', 'secondary')
    scoped_students = student_queryset_for_school_key(school_key)
    today = timezone.localdate()
    current_staff = _current_staff(request)

    name_filter = request.GET.get('name') or ''
    status_filter = request.GET.get('status') or ''
    # Status (lifecycle: active/closed) and Panel Stage (where in the panel
    # process - unassigned/assigned/discussing/review tiers) are two
    # different questions even though they share the one underlying
    # `status` field - see issue #11.
    stage_filter = request.GET.get('stage') or ''
    raised_by_filter = request.GET.get('raised_by') or ''
    concern_filter = request.GET.get('concern') or ''
    priority_filter = request.GET.get('priority') or ''
    panel_group_filter = request.GET.get('panel_group') or ''
    overdue_actions_filter = request.GET.get('overdue_actions') == '1'

    referrals_qs = InclusionReferral.objects.filter(student__in=scoped_students).select_related(
        'student', 'student__school', 'raised_by',
    ).prefetch_related(
        'responses__question', 'panel_referrals__panel__panel_group',
    )
    if name_filter:
        referrals_qs = referrals_qs.filter(
            Q(student__first_name__icontains=name_filter) | Q(student__last_name__icontains=name_filter)
        )
    if status_filter == 'active':
        referrals_qs = referrals_qs.exclude(status='closed')
    elif status_filter == 'closed':
        referrals_qs = referrals_qs.filter(status='closed')
    if stage_filter:
        referrals_qs = referrals_qs.filter(status=stage_filter)
    if raised_by_filter == 'unassigned':
        referrals_qs = referrals_qs.filter(raised_by__isnull=True)
    elif raised_by_filter:
        referrals_qs = referrals_qs.filter(raised_by_id=raised_by_filter)
    if concern_filter:
        referrals_qs = referrals_qs.filter(
            responses__question__label='Main Concern Category', responses__answer=concern_filter
        )
    if priority_filter:
        referrals_qs = referrals_qs.filter(priority=priority_filter)
    if panel_group_filter:
        referrals_qs = referrals_qs.filter(panel_referrals__panel__panel_group_id=panel_group_filter)
    if overdue_actions_filter:
        referrals_qs = referrals_qs.filter(actions__status='incomplete', actions__due_date__lt=today)
    referrals_qs = referrals_qs.distinct()

    # is_unassigned reads the already-prefetched panel_referrals in Python
    # (same as before) rather than an ORM filter - it needs an exclude()
    # across a multi-valued relation that's easy to get subtly wrong, and
    # referrals_qs is already narrowed by the filters above first, so this
    # loop runs over a bounded set, not every referral.
    referrals = list(referrals_qs)
    for referral in referrals:
        referral.is_unassigned = _is_referral_unassigned(referral)
        referral.actions_count = referral.actions.count()
        referral.completed_actions_count = referral.actions.filter(status='complete').count()
        referral.incomplete_actions_count = referral.actions.filter(status='incomplete').count()
        referral.can_delete = (
            referral.is_unassigned and current_staff is not None and referral.raised_by_id == current_staff.id
        )
        referral.concern_category = _primary_concern_category(referral)
        upcoming_prs = sorted(
            (pr for pr in referral.panel_referrals.all() if pr.removed_at is None and pr.panel.date >= today),
            key=lambda pr: pr.panel.date,
        )
        next_panel = upcoming_prs[0].panel if upcoming_prs else None
        referral.next_panel_group = next_panel.panel_group if next_panel else None
        referral.next_panel_date = next_panel.date if next_panel else None
        past_prs = sorted(
            (pr for pr in referral.panel_referrals.all() if pr.discussion_status == 'discussed' and pr.panel.date < today),
            key=lambda pr: pr.panel.date,
            reverse=True,
        )
        previous_panel = past_prs[0].panel if past_prs else None
        referral.previous_panel_group = previous_panel.panel_group if previous_panel else None
        referral.previous_panel_date = previous_panel.date if previous_panel else None
        next_review_pr = next(
            (pr for pr in referral.panel_referrals.all() if pr.follow_up_status == 'incomplete' and pr.follow_up_date),
            None,
        )
        referral.next_review_date = next_review_pr.follow_up_date if next_review_pr else None
        # New Referral vs Nth Review - same classification/labels/pill
        # classes (type-new/type-followup) as Panel Agenda Setup's referral
        # selection row (_referral_selection_row.html).
        discussed_count = sum(1 for pr in referral.panel_referrals.all() if pr.discussion_status == 'discussed')
        referral.is_new_referral = discussed_count == 0
        referral.review_label = _review_label(discussed_count) if discussed_count else None
        if referral.status == 'closed':
            referral.review_pill_label = 'Closed'
            referral.review_pill_class = 'type-already'
        elif referral.is_new_referral:
            referral.review_pill_label = 'New Referral'
            referral.review_pill_class = 'type-new'
        else:
            referral.review_pill_label = referral.review_label
            referral.review_pill_class = 'type-followup'

    active_filter_count = sum(
        1 for v in (
            name_filter, status_filter, stage_filter, raised_by_filter, concern_filter,
            priority_filter, panel_group_filter, overdue_actions_filter,
        ) if v
    )

    concern_question = ReferralQuestion.objects.filter(label='Main Concern Category', is_active=True).first()
    stage_choices = [
        ('open', 'Unassigned'),
        ('assigned', 'Assigned to Panel'),
        ('discussing', 'Discussing'),
        ('review_scheduled', 'Review Scheduled'),
        ('awaiting_review', 'Awaiting Review'),
        ('overdue_review', 'Overdue Review'),
    ]

    context = {
        **_panel_base_context(request),
        'referrals': referrals,
        'status_choices': InclusionReferral.STATUS_CHOICES,
        'staff_list': staff_queryset_for_school_key(school_key),
        'name_filter': name_filter,
        'status_filter': status_filter,
        'stage_filter': stage_filter,
        'stage_choices': stage_choices,
        'raised_by_filter': raised_by_filter,
        'concern_filter': concern_filter,
        'concern_choices': concern_question.choice_list() if concern_question else [],
        'priority_filter': priority_filter,
        'priority_choices': InclusionReferral.PRIORITY_CHOICES,
        'panel_group_filter': panel_group_filter,
        'panel_groups': PanelGroup.objects.filter(is_active=True).select_related('school').order_by('name'),
        'overdue_actions_filter': overdue_actions_filter,
        'active_filter_count': active_filter_count,
        'students_count': len({r.student_id for r in referrals}),
        'actions_count': sum(r.actions_count for r in referrals),
        'is_aggregate_view': is_aggregate_view,
    }
    context['col_widths'] = {
        'raisedby': _col_width(
            [f'Raised by: {r.raised_by.first_name} {r.raised_by.last_name}' if r.raised_by else 'Raised by: Unassigned' for r in referrals]
            + [f'Raised on: {r.created_at:%d %b %Y}' for r in referrals],
            max_ch=26,
        ),
        'panels': _col_width(
            [f'Prev Panel: {r.previous_panel_date:%d %b %Y}' if r.previous_panel_date else 'Prev Panel: —' for r in referrals]
            + [f'Next Panel: {r.next_panel_date:%d %b %Y}' if r.next_panel_date else 'Next Panel: —' for r in referrals],
            max_ch=23,
        ),
        'priorityreview': _col_width(
            [f'Priority: {r.get_priority_display()}' if r.priority else 'Priority: —' for r in referrals]
            + [f'Review Due: {r.next_review_date:%d %b %Y}' if r.next_review_date else 'Review Due: —' for r in referrals],
            max_ch=23,
        ),
        'actionsstatus': _col_width(
            [f'Completed Actions: {r.completed_actions_count}' for r in referrals]
            + [f'Incomplete Actions: {r.incomplete_actions_count}' for r in referrals],
            max_ch=22,
        ),
    }
    template = 'hubs/inclusion/panel/_referrals_filtered_content.html' if is_ajax else 'hubs/inclusion/panel/referrals.html'
    return render(request, template, context)


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
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        # Fired from the Home page's My Actions card (see home.html) so the
        # tab counts/rows can update in place with the InteractionLanguage.md
        # "Tab count-delta pulse" / "Status-filter tab entering/leaving the
        # tab row" animations, instead of a full page reload snapping them.
        current_staff = _current_staff(request)
        is_panel_staff = _is_panel_staff(current_staff)
        return render(request, 'hubs/inclusion/panel/_my_actions_card.html', _my_actions_context(current_staff, is_panel_staff))
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
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    is_aggregate_view = school_key in (None, '', 'all', 'primary', 'secondary')
    current_staff = _current_staff(request)
    today = timezone.localdate()
    week_start = today - datetime.timedelta(days=today.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    next_week_start = week_start + datetime.timedelta(days=7)
    next_week_end = week_end + datetime.timedelta(days=7)

    name_filter = request.GET.get('name') or ''
    category_filter = request.GET.get('category') or ''
    assigned_filter = request.GET.get('assigned') or ''
    status_filter = request.GET.get('status') or ''
    # Due Date consolidates the old separate Overdue Only/Due This Week
    # toggles into one dropdown with a few more tiers (issue #13).
    due_filter = request.GET.get('due') or ''

    scoped_students = student_queryset_for_school_key(school_key)
    actions_qs = Action.objects.filter(referral__student__in=scoped_students).select_related(
        'referral__student', 'referral__student__school', 'assigned_to', 'category', 'created_by',
    )
    actions_qs = visible_actions_for(current_staff, actions_qs)
    categories = visible_categories_for(current_staff)

    if name_filter:
        actions_qs = actions_qs.filter(referral__student_id=name_filter)
    if category_filter:
        actions_qs = actions_qs.filter(category_id=category_filter)
    if assigned_filter == 'unassigned':
        actions_qs = actions_qs.filter(assigned_to__isnull=True)
    elif assigned_filter:
        actions_qs = actions_qs.filter(assigned_to_id=assigned_filter)
    if status_filter:
        actions_qs = actions_qs.filter(status=status_filter)
    if due_filter == 'overdue':
        actions_qs = actions_qs.filter(status='incomplete', due_date__lt=today)
    elif due_filter == 'today':
        actions_qs = actions_qs.filter(due_date=today)
    elif due_filter == 'this_week':
        actions_qs = actions_qs.filter(due_date__gte=week_start, due_date__lte=week_end)
    elif due_filter == 'next_week':
        actions_qs = actions_qs.filter(due_date__gte=next_week_start, due_date__lte=next_week_end)
    elif due_filter == 'no_due_date':
        actions_qs = actions_qs.filter(due_date__isnull=True)

    actions = list(actions_qs)

    # Row-detail candidates (issue #12): title row + facts row + an
    # Overdue callout pill.
    for action in actions:
        action.is_overdue = action.status == 'incomplete' and action.due_date is not None and action.due_date < today
        action.days_overdue = (today - action.due_date).days if action.is_overdue else 0

    active_filter_count = sum(
        1 for v in (name_filter, category_filter, assigned_filter, status_filter, due_filter) if v
    )

    col_widths = {
        'created': _col_width(
            [f'Created At: {a.created_at:%d %b %Y}' if a.created_at else 'Created At: —' for a in actions]
            + [f'Created By: {a.created_by}' if a.created_by else 'Created By: —' for a in actions],
            max_ch=26,
        ),
        'assigned': _col_width(
            [f'Assigned to: {a.assigned_to}' if a.assigned_to else 'Assigned to: Unassigned' for a in actions]
            + [f'Due: {a.due_date:%d %b %Y}' if a.due_date else 'Due: —' for a in actions],
            max_ch=26,
        ),
    }

    context = {
        **_panel_base_context(request),
        'actions': actions,
        'categories': categories,
        'staff_list': staff_queryset_for_school_key(school_key),
        'status_choices': Action.STATUS_CHOICES,
        'today': today,
        'week_start': week_start,
        'week_end': week_end,
        'name_filter': name_filter,
        # Name is a dropdown of students who actually have an action,
        # scoped to the current school selection, rather than a free-text
        # search - bounded list, not every student (issue #13). Filtered
        # through visible_actions_for so a student whose only actions are
        # sensitive-category ones invisible to this viewer doesn't show up
        # with an empty result when selected.
        'students_with_actions': Student.objects.filter(
            pk__in=visible_actions_for(
                current_staff, Action.objects.filter(referral__student__in=scoped_students)
            ).values('referral__student_id')
        ).order_by('last_name', 'first_name'),
        'category_filter': category_filter,
        'assigned_filter': assigned_filter,
        'status_filter': status_filter,
        'due_filter': due_filter,
        'active_filter_count': active_filter_count,
        'actions_count': len(actions),
        'students_count': len({a.referral.student_id for a in actions}),
        'referrals_count': len({a.referral_id for a in actions}),
        'is_aggregate_view': is_aggregate_view,
        'col_widths': col_widths,
    }
    template = 'hubs/inclusion/panel/_actions_filtered_content.html' if is_ajax else 'hubs/inclusion/panel/actions.html'
    return render(request, template, context)


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
            created_by=_current_staff(request),
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


def _format_duration(td):
    # "2h 15m" / "45m" / "3h" - short form for the meeting card, not the
    # verbose default str(timedelta) ("2:15:00") the raw value would render as.
    if not td:
        return None
    total_minutes = int(td.total_seconds() // 60)
    hours, minutes = divmod(total_minutes, 60)
    if hours and minutes:
        return f'{hours}h {minutes}m'
    if hours:
        return f'{hours}h'
    return f'{minutes}m'


def _academic_year_key(d):
    # Sept-Aug academic year, keyed by its start calendar year (e.g. a date
    # in Sept 2025-Aug 2026 both key to 2025) - no academic-year concept
    # exists anywhere else in the codebase, so this is deliberately the only
    # place that boundary is defined.
    return d.year if d.month >= 9 else d.year - 1


def _academic_year_label(start_year):
    return f'{start_year}/{str(start_year + 1)[-2:]}'


def _effective_chair_q(staff_id):
    # Mirrors Panel.effective_chair_id as a queryset filter: chair_id when
    # not following the group default, panel_group.default_chair_id when it is.
    return Q(chair_follows_default=False, chair_id=staff_id) | Q(
        chair_follows_default=True, panel_group__default_chair_id=staff_id,
    )


def inclusion_panel_meetings(request):
    _sync_delayed_panels()
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    today = timezone.localdate()
    school_key = current_school_key(request)
    is_aggregate_view = school_key in (None, '', 'all', 'primary', 'secondary')
    current_staff = _current_staff(request)

    panel_group_filter = request.GET.get('panel_group') or ''
    chair_filter = request.GET.get('chair') or ''
    academic_year_filter = request.GET.get('academic_year') or ''
    status_filter = request.GET.get('status') or ''
    my_meetings_filter = request.GET.get('my_meetings') == '1' and current_staff is not None

    # Option lists computed from the school-scoped set, before the filters
    # below are applied, same convention as inclusion_hub's year_group_choices -
    # so Panel Group/Chair/Academic Year don't shrink each other's dropdowns.
    base_panels = _panels_for_school_key(
        Panel.objects.select_related('chair', 'panel_group__default_chair'),
        school_key,
    )
    chairs_by_id = {}
    academic_years_present = set()
    for panel in base_panels:
        chair = panel.effective_chair
        if chair:
            chairs_by_id[chair.id] = chair
        academic_years_present.add(_academic_year_key(panel.date))
    chair_choices = sorted(chairs_by_id.values(), key=lambda s: (s.last_name, s.first_name))
    academic_year_choices = [
        (year, _academic_year_label(year)) for year in sorted(academic_years_present, reverse=True)
    ]
    current_academic_year = _academic_year_key(today)
    if academic_year_filter and not any(str(year) == academic_year_filter for year, _ in academic_year_choices):
        academic_year_filter = ''

    panels = _panels_for_school_key(
        Panel.objects.select_related('chair', 'panel_group__school', 'panel_group__default_chair').prefetch_related(
            'panel_referrals__referral',
        ).order_by('date'),
        school_key,
    )
    if panel_group_filter:
        panels = panels.filter(panel_group_id=panel_group_filter)
    if chair_filter:
        panels = panels.filter(_effective_chair_q(chair_filter))
    if academic_year_filter:
        start, end = datetime.date(int(academic_year_filter), 9, 1), datetime.date(int(academic_year_filter) + 1, 8, 31)
        panels = panels.filter(date__gte=start, date__lte=end)
    if status_filter:
        panels = panels.filter(status=status_filter)
    if my_meetings_filter:
        my_group_ids = PanelGroupMember.objects.filter(
            staff=current_staff, is_active=True,
        ).values_list('panel_group_id', flat=True)
        panels = panels.filter(_effective_chair_q(current_staff.id) | Q(panel_group_id__in=my_group_ids))

    # Batched once for every referral appearing on any panel in this list
    # (rather than one query per panel/card) - same "has this referral been
    # discussed on some other panel before" check inclusion_panel_meeting_setup
    # uses to distinguish New vs Review agenda items (last_discussed_panel).
    all_referral_ids = {
        pr.referral_id for panel in panels for pr in panel.panel_referrals.all() if pr.removed_at is None
    }
    discussed_panels_by_referral = {}
    for referral_id, panel_id in PanelReferral.objects.filter(
        discussion_status='discussed', referral_id__in=all_referral_ids,
    ).values_list('referral_id', 'panel_id'):
        discussed_panels_by_referral.setdefault(referral_id, set()).add(panel_id)

    meetings = []
    upcoming_meetings = []
    past_meetings = []
    next_marked = False
    for panel in panels:
        active_referrals = [pr for pr in panel.panel_referrals.all() if pr.removed_at is None]
        referral_count = len(active_referrals)
        is_next = panel.status not in ('complete', 'delayed') and panel.date >= today and not next_marked
        if is_next:
            next_marked = True

        if panel.status == 'complete':
            discussed = [pr for pr in active_referrals if pr.discussion_status == 'discussed']
            new_count = sum(
                1 for pr in discussed
                if not (discussed_panels_by_referral.get(pr.referral_id, set()) - {panel.id})
            )
            review_count = len(discussed) - new_count
            duration_display = _format_duration(sum(
                (pr.duration for pr in discussed if pr.duration), datetime.timedelta(),
            ))
            priority_counts = None
        else:
            new_count = sum(
                1 for pr in active_referrals
                if not (discussed_panels_by_referral.get(pr.referral_id, set()) - {panel.id})
            )
            review_count = referral_count - new_count
            priority_counts = Counter(pr.referral.priority or 'untriaged' for pr in active_referrals)
            duration_display = None

        entry = {
            'panel': panel,
            'is_next': is_next,
            'referral_count': referral_count,
            'new_count': new_count,
            'review_count': review_count,
            'priority_counts': priority_counts,
            'duration_display': duration_display,
        }
        meetings.append(entry)
        (past_meetings if panel.status == 'complete' else upcoming_meetings).append(entry)
    past_meetings.reverse()
    meetings = upcoming_meetings + past_meetings

    panel_groups = PanelGroup.objects.filter(is_active=True).select_related('school').order_by('name')
    if not is_aggregate_view:
        panel_groups = panel_groups.filter(Q(school_id=school_key) | Q(school__isnull=True))

    active_filter_count = sum(
        1 for v in (panel_group_filter, chair_filter, academic_year_filter, status_filter, my_meetings_filter) if v
    )

    context = {
        **_panel_base_context(request),
        'meetings': meetings,
        'today': today,
        'is_aggregate_view': is_aggregate_view,
        'panel_groups': panel_groups,
        'panel_group_filter': panel_group_filter,
        'chair_choices': chair_choices,
        'chair_filter': chair_filter,
        'academic_year_choices': academic_year_choices,
        'academic_year_filter': academic_year_filter,
        'current_academic_year': current_academic_year,
        'status_choices': Panel.STATUS_CHOICES,
        'status_filter': status_filter,
        'my_meetings_filter': my_meetings_filter,
        'active_filter_count': active_filter_count,
    }
    template = 'hubs/inclusion/panel/_meetings_filtered_content.html' if is_ajax else 'hubs/inclusion/panel/meetings.html'
    return render(request, template, context)


def inclusion_panel_meeting_new(request, panel_id=None):
    # One dialog/template (_panel_meeting_form_modal.html) serves both
    # "Create Panel Meeting" (panel_id is None) and "Edit Panel Settings"
    # (panel_id set) - they share the same School/Panel Group/Date/Time
    # fields and the same explicit-Save submit model, so a single view
    # branching on whether `panel` exists is more honest than two near-
    # duplicate ones. Chair is deliberately not part of this form in
    # either mode - it stays directly editable from the Panel Settings
    # summary itself (see inclusion_panel_meeting_setup's `update_chair`
    # action), independent of this dialog.
    panel = get_object_or_404(Panel, pk=panel_id) if panel_id else None
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        date = request.POST.get('date')

        if panel is None:
            parsed_date = datetime.date.fromisoformat(date) if date else timezone.localdate()
            if parsed_date < timezone.localdate():
                parsed_date = timezone.localdate()
            panel = Panel.objects.create(
                date=parsed_date,
                time=request.POST.get('time') or None,
                panel_group_id=request.POST.get('panel_group') or None,
                chair_follows_default=True,
            )
        else:
            panel.update_details(
                date=datetime.date.fromisoformat(date) if date else None,
                time=request.POST.get('time') or None,
                chair_id=panel.chair_id,
                panel_group_id=request.POST.get('panel_group') or None,
            )

        setup_url = reverse('inclusion_panel_meeting_setup', args=[panel.id])
        if is_ajax:
            return JsonResponse({'success': True, 'redirect': setup_url})
        return redirect(setup_url)

    # School is only ever a field on this form in create mode - an
    # existing Panel has no school of its own (only via panel.panel_group.
    # school, itself nullable), so editing one never shows or sets it
    # directly, same as before the two dialogs were merged.
    schools = selected_school_id = school_locked = None
    if panel is None:
        school_key = current_school_key(request)
        if school_key in (None, '', 'all'):
            schools = School.objects.filter(is_active=True).order_by('name')
        elif school_key in ('primary', 'secondary'):
            schools = School.objects.filter(is_active=True, category=school_key.capitalize())
        else:
            schools = School.objects.filter(is_active=True, pk=school_key)
        selected_school = schools.first() if schools.count() == 1 else None
        selected_school_id = selected_school.id if selected_school else ''
        school_locked = selected_school is not None

    return render(request, 'hubs/inclusion/panel/_panel_meeting_form_modal.html', {
        **_panel_base_context(request),
        'panel': panel,
        'panel_groups': PanelGroup.objects.filter(is_active=True).select_related('school'),
        'today': timezone.localdate(),
        'current_staff': _current_staff(request),
        'schools': schools,
        'selected_school_id': selected_school_id,
        'school_locked': school_locked,
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
        if action == 'update_chair':
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
            # Freeze whatever chair this panel was following into a plain
            # snapshot before completing it - a completed panel's chair is a
            # historical record and must not keep moving if the group's
            # default_chair changes later (same reasoning as _panel_member_roster
            # only trusting checked-in PanelMember rows once complete).
            if panel.chair_follows_default:
                panel.chair_id = panel.effective_chair_id
                panel.chair_follows_default = False
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
