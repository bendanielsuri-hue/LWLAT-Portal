import json

from django.db.models import Count, Max
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme

from core.identity import current_staff as _current_staff
from core.models import School, Staff, Student

from .models import (
    Action,
    ActionCategory,
    Escalation,
    Expertise,
    Panel,
    PanelGroup,
    PanelGroupMember,
    PanelMember,
    PanelReferral,
    Referral,
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
    StudentNote,
)

INCLUSION_MENU = [
    {'name': 'Provision & Strategies', 'url': '/inclusion/provision-strategies/', 'icon': 'icons/registers_svg.html'},
    {'name': 'Inclusion Panel', 'url': '/inclusion/panel/', 'icon': 'icons/people_svg.html'},
    {'name': 'SEND Diagnosis Tracker', 'url': '/inclusion/diagnosis-tracker/', 'icon': 'icons/reports_svg.html'},
]

PANEL_MENU = [
    {'name': 'Home', 'url': '/inclusion/panel/', 'icon': 'icons/house_svg.html'},
    {'name': 'Students', 'url': '/inclusion/panel/students/', 'icon': 'icons/people_svg.html'},
    {'name': 'Referrals', 'url': '/inclusion/panel/referrals/', 'icon': 'icons/document_svg.html'},
    {'name': 'Actions', 'url': '/inclusion/panel/actions/', 'icon': 'icons/checkmark_svg.html'},
    {'name': 'Panel Meetings', 'url': '/inclusion/panel/meetings/', 'icon': 'icons/clock_svg.html'},
    {'name': 'Escalations', 'url': '/inclusion/panel/escalations/', 'icon': 'icons/document_svg.html'},
    {'name': 'Admin', 'url': '/inclusion/panel/settings/referral-questions/', 'icon': 'icons/registers_svg.html'},
]

# Shared sidebar context for every page inside the Inclusion Panel sub-app, so the
# sidebar can offer a way back up to the SEND & Provision hub (3rd nav level).
PANEL_BASE_CONTEXT = {
    'local_menu': PANEL_MENU,
    'hub_title': 'Inclusion Panel',
    'back_to_hub_url': '/inclusion/',
    'back_to_hub_label': 'SEND & Provision',
}


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
    return PanelGroupMember.objects.filter(staff=staff).exists()


def _is_referral_unassigned(referral):
    return not any(pr.removed_at is None for pr in referral.panel_referrals.all())


def _due_followups(panel):
    # Scoped strictly to the panel's own group so a follow-up never surfaces
    # in a different group's meeting. Ungrouped panels see nothing due.
    if panel.panel_group_id is None:
        return PanelReferral.objects.none()
    return PanelReferral.objects.filter(
        follow_up_status='incomplete',
        follow_up_date__lte=timezone.localdate(),
        removed_at__isnull=True,
        panel__panel_group_id=panel.panel_group_id,
    ).select_related('referral__student', 'panel')


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


def inclusion_hub(request):
    return render(request, 'hubs/inclusion/hub.html', {'local_menu': INCLUSION_MENU, 'hub_title': 'SEND & Provision'})


def inclusion_provision_strategies(request):
    return render(request, 'hubs/inclusion/provision_strategies.html', {'local_menu': INCLUSION_MENU, 'hub_title': 'SEND & Provision'})


def inclusion_diagnosis_tracker(request):
    return render(request, 'hubs/inclusion/diagnosis_tracker.html', {'local_menu': INCLUSION_MENU, 'hub_title': 'SEND & Provision'})


def inclusion_panel_home(request):
    current_staff = _current_staff(request)
    is_panel_staff = _is_panel_staff(current_staff)

    my_referrals = list(
        Referral.objects.filter(status='open', raised_by=current_staff)
        .select_related('student')
        .prefetch_related('panel_referrals', 'actions')
    ) if current_staff is not None else []
    for referral in my_referrals:
        referral.discussed_pr = next(
            (pr for pr in referral.panel_referrals.all() if pr.discussion_status == 'discussed'), None
        )
        referral.actions_count = len(referral.actions.all())
        referral.is_unassigned = _is_referral_unassigned(referral)
        referral.can_delete = referral.is_unassigned
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

    next_panel = Panel.objects.filter(status='upcoming').order_by('date').first()
    show_referral_tabs = sum(1 for c in (referrals_awaiting_count, referrals_discussed_count) if c) > 1
    show_action_tabs = sum(1 for c in (actions_incomplete_count, overdue_actions, actions_not_needed_count, actions_complete_count) if c) > 1
    return render(request, 'hubs/inclusion/panel/home.html', {
        **PANEL_BASE_CONTEXT,
        'current_staff': current_staff,
        'my_referrals': my_referrals,
        'my_actions': my_actions,
        'referrals_awaiting': len(my_referrals),
        'referrals_awaiting_count': referrals_awaiting_count,
        'referrals_discussed_count': referrals_discussed_count,
        'overdue_actions': overdue_actions,
        'actions_incomplete_count': actions_incomplete_count,
        'actions_complete_count': actions_complete_count,
        'actions_not_needed_count': actions_not_needed_count,
        'show_referral_tabs': show_referral_tabs,
        'show_action_tabs': show_action_tabs,
        'next_panel_date': next_panel.date if next_panel else None,
    })


def inclusion_panel_students(request):
    today = timezone.localdate()
    students = []
    for student in Student.objects.filter(is_active=True):
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
        **PANEL_BASE_CONTEXT,
        'students': students,
        'years': years,
        'forms': forms,
        'forms_by_year_json': json.dumps(forms_by_year),
        'students_count': len(students),
        'referrals_count': Referral.objects.filter(student__in=[s['id'] for s in students]).count(),
        'actions_count': Action.objects.filter(referral__student_id__in=[s['id'] for s in students]).count(),
    })


def inclusion_panel_referrals(request):
    referrals = Referral.objects.select_related('student').prefetch_related('responses__question', 'panel_referrals')
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
    return render(request, 'hubs/inclusion/panel/referrals.html', {
        **PANEL_BASE_CONTEXT,
        'referrals': referrals,
        'status_choices': Referral.STATUS_CHOICES,
        'students_count': Student.objects.filter(is_active=True, referrals__isnull=False).distinct().count(),
        'actions_count': Action.objects.filter(referral__in=referrals).count(),
    })


def inclusion_panel_referral_new(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    student_id = request.GET.get('student') or request.POST.get('student')
    selected_student = Student.objects.filter(pk=student_id).first() if student_id else None

    if request.method == 'POST':
        student = get_object_or_404(Student, pk=request.POST.get('student'))
        referral = Referral.objects.create(student=student, raised_by=_current_staff(request))
        for group in _grouped_questions():
            for question in group['questions']:
                answer = request.POST.get(f'question_{question.id}', '')
                ReferralResponse.objects.create(referral=referral, question=question, answer=answer)
        if is_ajax:
            return JsonResponse({'success': True})
        return redirect(_safe_next(request, '/inclusion/panel/referrals/'))

    context = {
        **PANEL_BASE_CONTEXT,
        'students': Student.objects.filter(is_active=True),
        'selected_student': selected_student,
        'question_groups': _grouped_questions(),
        'next': request.GET.get('next', ''),
    }
    return render(request, 'hubs/inclusion/panel/_referral_form_modal.html', context)


def inclusion_panel_referral_edit(request, referral_id):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    referral = get_object_or_404(Referral.objects.select_related('student'), pk=referral_id)
    question_groups = _grouped_questions()

    if request.method == 'POST':
        for group in question_groups:
            for question in group['questions']:
                answer = request.POST.get(f'question_{question.id}', '')
                ReferralResponse.objects.update_or_create(
                    referral=referral, question=question, defaults={'answer': answer},
                )
        if is_ajax:
            return JsonResponse({'success': True})
        return redirect(_safe_next(request, '/inclusion/panel/'))

    existing_answers = {r.question_id: r.answer for r in referral.responses.all()}
    for group in question_groups:
        for question in group['questions']:
            question.existing_answer = existing_answers.get(question.id, '')

    return render(request, 'hubs/inclusion/panel/_referral_form_modal.html', {
        **PANEL_BASE_CONTEXT,
        'is_edit': True,
        'referral': referral,
        'selected_student': referral.student,
        'question_groups': question_groups,
        'next': request.GET.get('next', ''),
    })


def inclusion_panel_referral_delete(request, referral_id):
    referral = get_object_or_404(Referral, pk=referral_id)
    if request.method == 'POST':
        current_staff = _current_staff(request)
        can_delete = (
            current_staff is not None
            and referral.raised_by_id == current_staff.id
            and _is_referral_unassigned(referral)
        )
        if can_delete:
            referral.delete()
    return redirect(_safe_next(request, '/inclusion/panel/referrals/'))


def inclusion_panel_action_set_status(request, action_id):
    action = get_object_or_404(Action, pk=action_id)
    if request.method == 'POST':
        status = request.POST.get('status')
        if status in dict(Action.STATUS_CHOICES):
            action.status = status
            action.save()
    return redirect(_safe_next(request, '/inclusion/panel/'))


def inclusion_panel_referral_escalate(request, referral_id):
    referral = get_object_or_404(Referral, pk=referral_id)

    if request.method == 'POST':
        staff_id = request.POST.get('escalated_by') or None
        Escalation.objects.create(
            referral=referral,
            escalated_by_id=staff_id,
            reason=request.POST.get('reason', ''),
        )
        if referral.status == 'open':
            referral.status = 'in_panel'
            referral.save()
        return redirect(_safe_next(request, '/inclusion/panel/referrals/'))

    return render(request, 'hubs/inclusion/panel/escalate_form.html', {
        **PANEL_BASE_CONTEXT,
        'referral': referral,
        'staff_list': Staff.objects.filter(is_active=True),
        'next': request.GET.get('next', ''),
    })


def inclusion_panel_escalations(request):
    escalations = Escalation.objects.filter(status='open').select_related('referral__student')
    return render(request, 'hubs/inclusion/panel/escalations.html', {
        **PANEL_BASE_CONTEXT,
        'escalations': escalations,
    })


def inclusion_panel_escalation_resolve(request, escalation_id):
    escalation = get_object_or_404(Escalation, pk=escalation_id)
    if request.method == 'POST':
        escalation.status = 'resolved'
        escalation.resolution_notes = request.POST.get('resolution_notes', '')
        escalation.resolved_at = timezone.now()
        escalation.save()
    return redirect('inclusion_panel_escalations')


def inclusion_panel_actions(request):
    is_panel_staff = _is_panel_staff(_current_staff(request))
    actions = Action.objects.select_related('referral__student', 'assigned_to', 'category')
    categories = ActionCategory.objects.filter(is_active=True)
    if not is_panel_staff:
        actions = actions.exclude(category__is_sensitive=True)
        categories = categories.exclude(is_sensitive=True)
    return render(request, 'hubs/inclusion/panel/actions.html', {
        **PANEL_BASE_CONTEXT,
        'actions': actions,
        'categories': categories,
        'staff_list': Staff.objects.filter(is_active=True),
        'status_choices': Action.STATUS_CHOICES,
        'today': timezone.localdate(),
        'actions_count': actions.count(),
        'students_count': Student.objects.filter(referrals__actions__in=actions).distinct().count(),
        'referrals_count': Referral.objects.filter(actions__in=actions).distinct().count(),
    })


def inclusion_panel_action_new(request, referral_id):
    referral = get_object_or_404(Referral, pk=referral_id)
    categories = ActionCategory.objects.filter(is_active=True)
    if not _is_panel_staff(_current_staff(request)):
        categories = categories.exclude(is_sensitive=True)
    auto_assign_by_category = {
        category.id: (category.resolve_auto_assignee().id if category.resolve_auto_assignee() else None)
        for category in categories
    }

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
        )
        return redirect(_safe_next(request, '/inclusion/panel/actions/'))

    return render(request, 'hubs/inclusion/panel/action_form.html', {
        **PANEL_BASE_CONTEXT,
        'referral': referral,
        'categories': categories,
        'staff_list': Staff.objects.filter(is_active=True),
        'auto_assign_json': json.dumps(auto_assign_by_category),
        'next': request.GET.get('next', ''),
    })


def inclusion_panel_referral_question_settings(request):
    if request.method == 'POST':
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
        return redirect('inclusion_panel_referral_question_settings')

    categories = ReferralCategory.objects.filter(is_active=True).prefetch_related('questions')
    flat_questions = ReferralQuestion.objects.filter(category__isnull=True, is_active=True).order_by('order')
    return render(request, 'hubs/inclusion/panel/referral_question_settings.html', {
        **PANEL_BASE_CONTEXT,
        'categories': categories,
        'flat_questions': flat_questions,
    })


ACTION_CATEGORY_PRESETS = ['Parent Meeting', 'Intervention', 'Other']


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
        **PANEL_BASE_CONTEXT,
        'categories': ActionCategory.objects.filter(is_active=True),
        'missing_presets': missing_presets,
    })


def inclusion_panel_group_settings(request):
    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'add_group':
            PanelGroup.objects.create(
                name=request.POST.get('name', ''),
                default_chair_id=request.POST.get('default_chair') or None,
            )
        elif action == 'update_group':
            group = get_object_or_404(PanelGroup, pk=request.POST.get('group_id'))
            group.name = request.POST.get('name', group.name)
            group.default_chair_id = request.POST.get('default_chair') or None
            group.save()
        elif action == 'deactivate_group':
            PanelGroup.objects.filter(pk=request.POST.get('group_id')).update(is_active=False)
        elif action == 'add_group_member':
            group_id = request.POST.get('group_id')
            staff_id = request.POST.get('staff')
            if group_id and staff_id:
                PanelGroupMember.objects.update_or_create(
                    panel_group_id=group_id, staff_id=staff_id,
                    defaults={'expertise_id': request.POST.get('expertise') or None},
                )
        elif action == 'remove_group_member':
            PanelGroupMember.objects.filter(pk=request.POST.get('member_id')).delete()
        return redirect('inclusion_panel_group_settings')

    return render(request, 'hubs/inclusion/panel/panel_group_settings.html', {
        **PANEL_BASE_CONTEXT,
        'groups': PanelGroup.objects.filter(is_active=True).prefetch_related('members__staff'),
        'staff_list': Staff.objects.filter(is_active=True),
        'expertise_list': Expertise.objects.filter(is_active=True),
    })


def inclusion_panel_group_new(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_id = request.GET.get('school') or request.POST.get('school')
    preselect_school = School.objects.filter(pk=school_id).first() if school_id else None

    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        post_school_id = request.POST.get('school') or None
        if PanelGroup.objects.filter(is_active=True, name__iexact=name, school_id=post_school_id).exists():
            if is_ajax:
                return JsonResponse({'success': False})
            return redirect('inclusion_panel_group_settings')
        group = PanelGroup.objects.create(
            name=name,
            school_id=post_school_id,
            default_chair_id=request.POST.get('default_chair') or None,
        )
        staff_ids = request.POST.getlist('member_staff')
        guest_names = request.POST.getlist('member_guest_name')
        expertise_ids = request.POST.getlist('member_expertise')
        for staff_id, guest_name, expertise_id in zip(staff_ids, guest_names, expertise_ids):
            guest_name = guest_name.strip()
            if staff_id:
                PanelGroupMember.objects.update_or_create(
                    panel_group=group, staff_id=staff_id,
                    defaults={'expertise_id': expertise_id or None},
                )
            elif guest_name:
                PanelGroupMember.objects.create(
                    panel_group=group, guest_name=guest_name, expertise_id=expertise_id or None,
                )
        if is_ajax:
            return JsonResponse({
                'success': True,
                'group': {'id': group.id, 'name': group.name, 'school_id': group.school_id},
            })
        return redirect('inclusion_panel_group_settings')

    staff_options = [
        {
            'id': staff.id,
            'name': f'{staff.first_name} {staff.last_name}',
            'school_id': staff.school_id,
            'is_mat_staff': staff.is_mat_staff,
        }
        for staff in Staff.objects.filter(is_active=True).order_by('last_name', 'first_name')
    ]
    return render(request, 'hubs/inclusion/panel/_panel_group_form_modal.html', {
        **PANEL_BASE_CONTEXT,
        'schools': School.objects.filter(is_active=True),
        'expertise_list': Expertise.objects.filter(is_active=True),
        'preselect_school_id': school_id,
        'preselect_school_name': preselect_school.name if preselect_school else '',
        'existing_groups': list(PanelGroup.objects.filter(is_active=True).values('name', 'school_id')),
        'staff_options': staff_options,
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
        return redirect('inclusion_panel_expertise_settings')

    return render(request, 'hubs/inclusion/panel/expertise_settings.html', {
        **PANEL_BASE_CONTEXT,
        'expertise_list': Expertise.objects.filter(is_active=True),
    })


def inclusion_panel_meetings(request):
    today = timezone.localdate()
    current_staff = _current_staff(request)
    upcoming_meetings = []
    past_meetings = []
    next_marked = False
    panels_this_year = 0
    panels_ive_been_on = 0
    panels = Panel.objects.select_related('chair').prefetch_related('panel_referrals', 'members').order_by('date')
    for panel in panels:
        if panel.date.year == today.year:
            panels_this_year += 1
        if current_staff is not None and (
            panel.chair_id == current_staff.id
            or any(m.staff_id == current_staff.id for m in panel.members.all())
        ):
            panels_ive_been_on += 1
        is_next = panel.status == 'upcoming' and panel.date >= today and not next_marked
        if is_next:
            next_marked = True
        referral_count = sum(1 for pr in panel.panel_referrals.all() if pr.removed_at is None)
        discussed_count = sum(
            1 for pr in panel.panel_referrals.all() if pr.removed_at is None and pr.discussion_status == 'discussed'
        )
        entry = {
            'panel': panel,
            'is_next': is_next,
            'referral_count': referral_count,
            'discussed_count': discussed_count,
            'member_count': panel.members.count(),
        }
        if panel.date < today:
            past_meetings.append(entry)
        else:
            upcoming_meetings.append(entry)
    past_meetings.reverse()
    panels_needing_referrals = sum(1 for m in upcoming_meetings if not m['referral_count'])
    return render(request, 'hubs/inclusion/panel/meetings.html', {
        **PANEL_BASE_CONTEXT,
        'upcoming_meetings': upcoming_meetings,
        'past_meetings': past_meetings,
        'panels_needing_referrals': panels_needing_referrals,
        'panels_this_year': panels_this_year,
        'panels_ive_been_on': panels_ive_been_on,
        'today': today,
    })


def inclusion_panel_meeting_new(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        panel = Panel.objects.create(
            date=request.POST.get('date') or timezone.localdate(),
            time=request.POST.get('time') or None,
            panel_group_id=request.POST.get('panel_group') or None,
        )
        setup_url = reverse('inclusion_panel_meeting_setup', args=[panel.id])
        if is_ajax:
            return JsonResponse({'success': True, 'redirect': setup_url})
        return redirect(setup_url)

    return render(request, 'hubs/inclusion/panel/_panel_meeting_form_modal.html', {
        **PANEL_BASE_CONTEXT,
        'panel_groups': PanelGroup.objects.filter(is_active=True).select_related('school'),
        'today': timezone.localdate(),
    })


def inclusion_panel_meeting_start(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    if request.method == 'POST':
        agenda_url = reverse('inclusion_panel_meeting_agenda', args=[panel.id])
        if panel.date == timezone.localdate():
            just_started = panel.started_at is None
            if just_started:
                panel.started_at = timezone.now()
                panel.save()
            return redirect(f'{agenda_url}?just_started=1' if just_started else agenda_url)
        return redirect(f'{agenda_url}?not_today=1')
    return redirect('inclusion_panel_meetings')


def inclusion_panel_meeting_delete(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    if request.method == 'POST' and panel.started_at is None and panel.date >= timezone.localdate():
        panel.delete()
    return redirect('inclusion_panel_meetings')


def inclusion_panel_meeting_setup(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'update_details':
            panel.date = request.POST.get('date') or panel.date
            panel.chair_id = request.POST.get('chair') or None
            panel.panel_group_id = request.POST.get('panel_group') or None
            if not panel.chair_id and panel.panel_group_id:
                panel.chair_id = panel.panel_group.default_chair_id
            panel.save()
        elif action == 'add_member':
            staff_id = request.POST.get('staff') or None
            guest_name = request.POST.get('guest_name', '').strip()
            expertise_id = request.POST.get('expertise') or None
            if staff_id:
                PanelMember.objects.update_or_create(
                    panel=panel, staff_id=staff_id,
                    defaults={'expertise_id': expertise_id},
                )
            elif guest_name:
                PanelMember.objects.create(panel=panel, guest_name=guest_name, expertise_id=expertise_id)
        elif action == 'apply_group_roster':
            if panel.panel_group_id:
                for group_member in panel.panel_group.members.all():
                    if group_member.staff_id:
                        PanelMember.objects.get_or_create(
                            panel=panel, staff_id=group_member.staff_id,
                            defaults={'expertise_id': group_member.expertise_id},
                        )
                    else:
                        PanelMember.objects.create(
                            panel=panel, guest_name=group_member.guest_name,
                            expertise_id=group_member.expertise_id,
                        )
        elif action == 'add_referral':
            referral_id = request.POST.get('referral_id')
            if referral_id:
                pr, created = PanelReferral.objects.get_or_create(panel=panel, referral_id=referral_id)
                if not created and pr.removed_at is not None:
                    pr.removed_at = None
                    pr.removed_by = None
                    pr.save()
        return redirect('inclusion_panel_meeting_setup', panel_id=panel.id)

    unassigned_referrals = Referral.objects.select_related('student').exclude(
        pk__in=PanelReferral.objects.filter(removed_at__isnull=True).values_list('referral_id', flat=True)
    )

    return render(request, 'hubs/inclusion/panel/meeting_setup.html', {
        **PANEL_BASE_CONTEXT,
        'panel': panel,
        'staff_list': Staff.objects.filter(is_active=True).select_related('school'),
        'schools': School.objects.filter(is_active=True),
        'panel_groups': PanelGroup.objects.filter(is_active=True).select_related('school'),
        'expertise_list': Expertise.objects.filter(is_active=True),
        'members': panel.members.select_related('staff', 'expertise'),
        'unassigned_referrals': unassigned_referrals,
        'agenda': panel.panel_referrals.select_related('referral__student'),
    })


def inclusion_panel_meeting_agenda(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    today = timezone.localdate()

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'update_attendance':
            for member in panel.members.all():
                member.attended = f'attended_{member.id}' in request.POST
                member.save()
        elif action == 'unassign_referral':
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            pr.removed_at = timezone.now()
            pr.removed_by_id = request.POST.get('removed_by') or None
            pr.save()
        elif action == 'update_priority':
            pr = get_object_or_404(PanelReferral, pk=request.POST.get('panel_referral_id'), panel=panel)
            if request.POST.get('priority') in dict(PanelReferral.PRIORITY_CHOICES):
                pr.priority = request.POST.get('priority')
                pr.save()
        elif action == 'add_followup_to_agenda':
            referral_id = request.POST.get('referral_id')
            if referral_id:
                pr, created = PanelReferral.objects.get_or_create(panel=panel, referral_id=referral_id)
                if not created and pr.removed_at is not None:
                    pr.removed_at = None
                    pr.removed_by = None
                    pr.save()
        elif action == 'pull_in_followups':
            for due in _due_followups(panel):
                PanelReferral.objects.get_or_create(panel=panel, referral_id=due.referral_id)
        return redirect('inclusion_panel_meeting_agenda', panel_id=panel.id)

    panel_referrals = list(
        panel.panel_referrals.filter(removed_at__isnull=True).select_related('referral__student')
    )
    student_ids = [pr.referral.student_id for pr in panel_referrals]
    referral_counts = dict(
        Referral.objects.filter(student_id__in=student_ids)
        .values('student_id').annotate(c=Count('id')).values_list('student_id', 'c')
    )
    for pr in panel_referrals:
        pr.is_followup = referral_counts.get(pr.referral.student_id, 0) > 1

    priority_order = {'high': 0, 'medium': 1, 'low': 2}
    pending = sorted(
        (pr for pr in panel_referrals if pr.discussion_status == 'pending'),
        key=lambda pr: priority_order.get(pr.priority, 1),
    )
    discussed = [pr for pr in panel_referrals if pr.discussion_status == 'discussed']
    total = len(pending) + len(discussed)
    progress_pct = round(len(discussed) / total * 100) if total else 0

    followups_due = _due_followups(panel).exclude(referral__student_id__in=student_ids)

    return render(request, 'hubs/inclusion/panel/meeting_agenda.html', {
        **PANEL_BASE_CONTEXT,
        'panel': panel,
        'pending': pending,
        'discussed': discussed,
        'progress_pct': progress_pct,
        'members': panel.members.select_related('staff', 'expertise'),
        'staff_list': Staff.objects.filter(is_active=True),
        'followups_due': followups_due,
        'just_started': request.GET.get('just_started') == '1',
        'not_today': request.GET.get('not_today') == '1',
        'today': today,
    })


def inclusion_panel_discussion(request, panel_referral_id):
    panel_referral = get_object_or_404(
        PanelReferral.objects.select_related('referral__student', 'panel'), pk=panel_referral_id
    )
    referral = panel_referral.referral

    current_staff = _current_staff(request)
    is_panel_staff = _is_panel_staff(current_staff)

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'mark_discussed':
            if panel_referral.discussion_started_at:
                panel_referral.duration = timezone.now() - panel_referral.discussion_started_at
            panel_referral.discussion_status = 'discussed'
            panel_referral.notes = request.POST.get('notes', panel_referral.notes)
            panel_referral.follow_up_date = request.POST.get('follow_up_date') or None
            panel_referral.follow_up_status = request.POST.get('follow_up_status', '')
            panel_referral.save()
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

    if panel_referral.discussion_status == 'pending' and panel_referral.discussion_started_at is None:
        panel_referral.discussion_started_at = timezone.now()
        panel_referral.save()

    previous_referrals = list(
        Referral.objects.filter(student=referral.student)
        .exclude(pk=referral.pk)
        .prefetch_related('responses__question__category')
    )
    for prev in previous_referrals:
        prev.response_groups = _response_groups(prev)

    actions = referral.actions.select_related('assigned_to', 'category')
    if not is_panel_staff:
        actions = actions.exclude(category__is_sensitive=True)

    context = {
        **PANEL_BASE_CONTEXT,
        'panel_referral': panel_referral,
        'referral': referral,
        'student': referral.student,
        'response_groups': _response_groups(referral),
        'previous_referrals': previous_referrals,
        'actions': actions,
        'is_panel_staff': is_panel_staff,
    }
    if is_panel_staff:
        context['notes'] = referral.student.notes.select_related('author')
        context['staff_list'] = Staff.objects.filter(is_active=True)

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
        action.status = request.POST.get('status', action.status)
        action.save()
        return redirect(_safe_next(request, '/inclusion/panel/actions/'))

    return render(request, 'hubs/inclusion/panel/action_form.html', {
        **PANEL_BASE_CONTEXT,
        'is_edit': True,
        'action': action,
        'referral': action.referral,
        'categories': categories,
        'staff_list': Staff.objects.filter(is_active=True),
        'auto_assign_json': json.dumps(auto_assign_by_category),
        'next': request.GET.get('next', ''),
    })


def _response_groups(referral):
    # Built from the referral's actual saved responses (not the live active-question
    # list), so historic answers still display correctly even if a question was later
    # deactivated.
    groups = {}
    order = []
    for response in referral.responses.select_related('question__category').order_by(
        'question__category__order', 'question__order'
    ):
        category = response.question.category
        key = category.id if category else None
        if key not in groups:
            groups[key] = {'category': category, 'rows': []}
            order.append(key)
        groups[key]['rows'].append({'question': response.question, 'answer': response.answer})
    return [groups[cid] for cid in order]
