"""The single shared search endpoint behind every DB-backed picker."""

from urllib.parse import quote

from django.db.models import Q
from django.http import JsonResponse
from django.urls import reverse

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import Staff, StaffGroup

from ..models import Action, ExternalContact, InclusionReferral

from .shared import _token_name_filter, visible_actions_for

# Single shared search endpoint behind every Search box that queries real DB
# data (Panel general search, Add Referral's student picker, Add Member's
# staff/external picker) - one parameterized view rather than one endpoint
# per picker, so debounce/min-chars/token-matching only ever need fixing in
# one place. See docs/adr/0006-shared-search-endpoint-server-fetch-pickers.md.
PICKER_RESULT_LIMIT = 8


def inclusion_panel_search(request):
    q = request.GET.get('q', '').strip()
    tokens = q.split()
    kind = request.GET.get('kind', 'all')

    if kind == 'group':
        # Listed in full as soon as this source is picked, not gated behind
        # 2+ typed characters like every other kind below - a school's
        # StaffGroup roster is small enough that "browse the whole list" is
        # the more useful default than "type to search" (#98). An empty
        # `tokens` still filters correctly: _token_name_filter's loop never
        # runs, leaving an unconstrained Q() that matches every group.
        #
        # Scoped the same way Action assignment's own staff_groups queryset
        # already was (views.py's inclusion_panel_discussion/_action_new/
        # _action_inline_update) - MAT-wide or this student's school, and
        # either not year-specific or matching this student's year group -
        # not every Head of Year group portal-wide.
        school_id = request.GET.get('school_id') or None
        year_group = request.GET.get('year_group') or None
        groups = StaffGroup.objects.filter(
            Q(school__isnull=True) | Q(school_id=school_id), is_active=True,
        ).filter(
            Q(year_group__isnull=True) | Q(year_group=year_group)
        ).filter(_token_name_filter(tokens, 'name'))[:PICKER_RESULT_LIMIT]
        results = [{
            'source': 'group',
            'id': group.id,
            'name': group.name,
            'subtitle': '',
            'school_name': group.school.name if group.school_id else '',
        } for group in groups]
        return JsonResponse({'results': results})

    if len(q) < 2:
        return JsonResponse({'results': []})

    school_key = current_school_key(request)
    scoped_students = student_queryset_for_school_key(school_key)

    if kind == 'student':
        students = scoped_students.filter(_token_name_filter(tokens, 'first_name', 'last_name'))[:PICKER_RESULT_LIMIT]
        results = [{
            'id': s.id,
            'name': f'{s.first_name} {s.last_name}',
            'subtitle': (f'Year {s.year_group}' + (f' · {s.reg_form}' if s.reg_form else '') if s.year_group else '')
                + f' · #{s.admission_number}',
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
    # that groups results by kind (INT-P4).
    current_staff = _current_staff(request)

    students_url = reverse('inclusion_panel_students')
    referrals_url = reverse('inclusion_panel_referrals')
    actions_url = reverse('inclusion_panel_actions')

    def name_param(student):
        # `student=<id>` makes the match exact even when another student
        # shares this name; `name=` stays alongside it purely to populate
        # the destination page's search box with something readable.
        return f'name={quote(f"{student.first_name} {student.last_name}")}&student={student.id}'

    results = []

    students = scoped_students.filter(_token_name_filter(tokens, 'first_name', 'last_name'))[:5]
    for student in students:
        param = name_param(student)
        referrals_count = student.referrals.count()
        actions_count = Action.objects.filter(referral__student=student).count()
        results.append({
            'kind': 'student',
            'title': f'{student.last_name}, {student.first_name}',
            'subtitle': (f'Year {student.year_group}' if student.year_group else 'Student') + f' · #{student.admission_number}',
            'links': [
                {'label': 'Student', 'url': f'{students_url}?{param}', 'disabled': False},
                {'label': f'Referrals ({referrals_count})', 'url': f'{referrals_url}?{param}', 'disabled': referrals_count == 0},
                {'label': f'Actions ({actions_count})', 'url': f'{actions_url}?{param}', 'disabled': actions_count == 0},
            ],
        })

    staff_members = staff_queryset_for_school_key(school_key).filter(
        _token_name_filter(tokens, 'first_name', 'last_name')
    )[:5]
    for staff in staff_members:
        referrals_raised = InclusionReferral.objects.filter(student__in=scoped_students, raised_by=staff).count()
        actions_assigned = Action.objects.filter(referral__student__in=scoped_students, assigned_to_staff=staff)
        actions_assigned = visible_actions_for(current_staff, actions_assigned)
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
