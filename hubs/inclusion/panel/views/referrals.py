"""Referrals: the dashboard, the questionnaire create/edit flow and referral detail.

The questionnaire helpers (_grouped_questions and friends) are here rather than
in a module of their own because the referral form is the only thing that groups
questions; the live discussion page borrows _response_groups to read them back.
"""

from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    is_aggregate_school_key,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import AcademicYear, Student
from core.dashboard_filters import Filter, FilterSet, equals

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import lifecycle, presenters, reasons
from ..models import (
    Action,
    Escalation,
    InclusionReferral,
    PanelGroup,
    PanelMember,
    PresetReason,
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
)

from .base import _panel_base_context
from .shared import (
    TICKED,
    _is_referral_unassigned,
    _paginate_for_infinite_scroll,
    _referral_escalation_pill,
    _referral_review_pill,
    _review_label,
    _safe_next,
    _term_choices_and_ranges,
    _token_name_filter,
    visible_actions_for,
)

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
    # InclusionReferral.primary_concern_category above. Only ever affects display; POST
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


# The Referrals dashboard's filters. `academic_year` and `term` declare
# themselves here for the badge and the context, but narrow by hand below -
# both are normalised against choices built from the database first, and term
# filtering goes through _term_choices_and_ranges' date-range Q.
REFERRAL_FILTERS = FilterSet(
    Filter(
        'student',
        apply=lambda qs, v, vals: qs.filter(student_id=int(v)),
        active=lambda v: v.isdigit(),
        counts=lambda v: False,   # as Students: narrows without counting
        context_value=lambda v: int(v) if v.isdigit() else '',
    ),
    Filter(
        'name',
        apply=lambda qs, v, vals: qs.filter(_token_name_filter(
            v.split(), 'student__first_name', 'student__last_name', 'student__admission_number',
        )),
        superseded_by=('student',),
    ),
    # Status (lifecycle: active/closed) and Panel Stage (where in the panel
    # process) are two different questions sharing one underlying `status`
    # field - see issue #11.
    Filter('status', apply=lambda qs, v, vals: (
        qs.exclude(status='closed') if v == 'active'
        else qs.filter(status='closed') if v == 'closed'
        else qs
    )),
    Filter('stage', equals('status')),
    Filter('raised_by', apply=lambda qs, v, vals: (
        qs.filter(raised_by__isnull=True) if v == 'unassigned'
        else qs.filter(raised_by_id=v)
    )),
    Filter('concern', apply=lambda qs, v, vals: qs.filter(
        responses__question__label='Main Concern Category', responses__answer=v,
    )),
    Filter('priority', equals('priority')),
    Filter('panel_group', equals('panel_referrals__panel__panel_group_id')),
    Filter('overdue_actions', apply=lambda qs, v, vals: qs.filter(
        actions__status='incomplete', actions__due_date__lt=timezone.localdate(),
    ), active=TICKED, context_value=TICKED),
    Filter('academic_year'),
    Filter('term'),
    # Group Info (live feedback: "too many groups with one or two items") -
    # the referred student's own cohort fields, same params and choices as
    # the Students dashboard's own Group Info group.
    Filter('year', equals('student__year_group')),
    Filter('house', equals('student__house')),
    Filter('reg', equals('student__reg_form')),
)


def inclusion_panel_referrals(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    is_aggregate_view = is_aggregate_school_key(school_key)
    scoped_students = student_queryset_for_school_key(school_key)
    today = timezone.localdate()
    current_staff = _current_staff(request)

    filters = REFERRAL_FILTERS.bind(request)
    academic_year_filter = filters['academic_year']
    term_filter = filters['term']

    academic_years_present = {
        ay.id: ay for ay in AcademicYear.objects.filter(
            referrals__inclusion_detail__student__in=scoped_students,
        ).distinct()
    }
    academic_year_choices = [
        (ay.id, ay.label)
        for ay in sorted(academic_years_present.values(), key=lambda ay: ay.start_date, reverse=True)
    ]
    # No default academic year applied on first load - same #121 follow-up
    # call as inclusion_panel_meetings' own identical comment: "should not
    # have any default filters applied, academic year seem to be added".
    # current_academic_year is still exposed to the template (highlighting
    # "today's" year in the dropdown) even though it no longer drives a
    # default filter.
    current_academic_year = AcademicYear.for_date(today).id
    if academic_year_filter and not any(str(year) == academic_year_filter for year, _ in academic_year_choices):
        academic_year_filter = filters.set_value('academic_year', '')

    # Term filter (#121 follow-up applied to Referrals too - live feedback:
    # "add Term to Actions and referrals like meeting page") - see
    # _term_choices_and_ranges' own comment for the school-override lookup
    # and why this filters by date range at the DB level rather than
    # resolving one Term per referral in Python the way Meetings does.
    school_ids_for_terms = list(scoped_students.order_by().values_list('school_id', flat=True).distinct())
    term_filter, term_choices, terms_by_academic_year, term_q = _term_choices_and_ranges(
        InclusionReferral.objects.filter(student__in=scoped_students),
        school_ids_for_terms, academic_years_present.keys(), term_filter, academic_year_filter,
        'referral__created_at', 'student__school_id',
    )
    filters.set_value('term', term_filter)

    # Option lists computed from the school-scoped set, before the filters
    # below are applied - same convention as inclusion_panel_students' own
    # years/forms/forms_by_year/houses (views.py, above), so Year/Reg don't
    # shrink each other's dropdowns as other filters change.
    years = sorted({y for y in scoped_students.values_list('year_group', flat=True) if y is not None})
    forms = sorted({f for f in scoped_students.values_list('reg_form', flat=True) if f})
    forms_by_year = {
        year: sorted({
            f for f in scoped_students.filter(year_group=year).values_list('reg_form', flat=True) if f
        })
        for year in years
    }
    houses = sorted({h for h in scoped_students.values_list('house', flat=True) if h})
    has_houses = bool(houses)

    referrals_qs = InclusionReferral.objects.filter(student__in=scoped_students).select_related(
        'student', 'student__school', 'raised_by', 'referral',
    ).prefetch_related(
        'responses__question', 'panel_referrals__panel__panel_group', 'escalations', 'actions',
    )
    # Academic year and term first, by hand: both were normalised against
    # database-built choices above, and term is a date-range Q rather than a
    # field match.
    if academic_year_filter:
        referrals_qs = referrals_qs.filter(referral__academic_year_id=academic_year_filter)
    if term_q is not None:
        referrals_qs = referrals_qs.filter(term_q)
    referrals_qs = filters.narrow(referrals_qs).distinct()

    # Totals for the stats-strip ("59 Referrals · 240 Students · 82
    # Actions") - computed against the full filtered queryset before
    # pagination slices it down, same convention as inclusion_panel_students'
    # own total_students_count/etc (views.py, above). student_id/actions
    # counted via direct queries against referrals_qs rather than summing
    # the per-row Python counts below (those only ever run over the current
    # page once pagination is applied).
    total_referrals_count = referrals_qs.count()
    total_students_count = referrals_qs.values('student_id').distinct().count()
    total_actions_count = Action.objects.filter(referral__in=referrals_qs).count()

    # REFERRALS_PAGE_SIZE referrals per page (infinite scroll, wired via
    # initListPage in referrals.js - shared with Students' own
    # inclusion_panel_students, above) - only this page's referrals go
    # through the per-row lookups below (actions counts, panel history),
    # not the full filtered set.
    REFERRALS_PAGE_SIZE = 50
    page_obj, page_number, is_continuation = _paginate_for_infinite_scroll(
        referrals_qs, request, is_ajax, REFERRALS_PAGE_SIZE
    )

    # is_unassigned reads the already-prefetched panel_referrals in Python
    # (same as before) rather than an ORM filter - it needs an exclude()
    # across a multi-valued relation that's easy to get subtly wrong, and
    # referrals_qs is already narrowed by the filters above first, so this
    # loop runs over a bounded set, not every referral.
    referrals = list(page_obj.object_list)
    for referral in referrals:
        referral.is_unassigned = _is_referral_unassigned(referral)
        referral_actions = referral.actions.all()
        referral.actions_count = len(referral_actions)
        referral.completed_actions_count = sum(1 for a in referral_actions if a.status == 'complete')
        referral.incomplete_actions_count = sum(1 for a in referral_actions if a.status == 'incomplete')
        referral.can_delete = (
            referral.is_unassigned and current_staff is not None and referral.raised_by_id == current_staff.id
        )
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
        referral.review_pill_label, referral.review_pill_class = _referral_review_pill(referral)
        referral.escalation_pill_label, referral.escalation_pill_class = _referral_escalation_pill(referral)

    concern_question = ReferralQuestion.objects.filter(label='Main Concern Category', is_active=True).first()
    stage_choices = [
        ('open', 'Unassigned'),
        ('assigned', 'Assigned'),
        ('discussing', 'Discussing'),
        ('review_scheduled', 'Review Scheduled'),
        ('awaiting_review', 'Awaiting Review'),
        ('overdue_review', 'Overdue'),
    ]

    context = {
        **_panel_base_context(request),
        'referrals': referrals,
        'status_choices': InclusionReferral.STATUS_CHOICES,
        'staff_list': staff_queryset_for_school_key(school_key),
        **filters.context,
        'stage_choices': stage_choices,
        'academic_year_choices': academic_year_choices,
        'term_choices': term_choices,
        # Raw dicts for json_script (referrals.js reads them as data
        # islands, not the escapejs-in-a-string-literal convention the
        # inline <script> used before #210).
        'terms_by_academic_year': terms_by_academic_year,
        'concern_choices': concern_question.choice_list() if concern_question else [],
        'priority_choices': InclusionReferral.PRIORITY_CHOICES,
        'panel_groups': PanelGroup.objects.filter(is_active=True).select_related('school').order_by('name'),
        'years': years,
        'forms': forms,
        'forms_by_year': forms_by_year,
        'has_houses': has_houses,
        'houses': houses,
        'active_filter_count': filters.active_count,
        'students_count': total_students_count,
        'referrals_count': total_referrals_count,
        'actions_count': total_actions_count,
        'is_aggregate_view': is_aggregate_view,
        'page_obj': page_obj,
    }
    if page_obj.has_next():
        next_params = request.GET.copy()
        next_params['page'] = page_number + 1
        context['next_page_url'] = request.path + '?' + next_params.urlencode()
    if is_continuation:
        template = 'hubs/inclusion/panel/_referrals_rows.html'
    elif is_ajax:
        template = 'hubs/inclusion/panel/_referrals_filtered_content.html'
    else:
        template = 'hubs/inclusion/panel/referrals.html'
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
    strip, Panel History and Actions (with is_overdue) sections. Used
    by both inclusion_panel_referral_edit (viewing/editing a referral) and
    inclusion_panel_action_status_update (toggling one action's status from
    within that same modal) so the two can never drift apart the way the
    old, separate Actions modal used to (action.is_overdue and the
    sensitive-category filter both used to only exist on one of the two
    views)."""
    today = timezone.localdate()

    # A referral currently on a panel's agenda but not yet discussed - takes
    # priority over discussion history below for the decision strip's status
    # line, since "assigned to a panel" is the most current, actionable fact
    # about the referral when it's true.
    pending_pr = (
        referral.panel_referrals.filter(removed_at__isnull=True, discussion_status='pending')
        .select_related('panel', 'panel__chair').order_by('-panel__date').first()
    )

    # No removed_at__isnull filter here, unlike pending_pr above - a
    # discussion that actually happened stays part of the referral's history
    # even if the PanelReferral row was later removed from that panel's live
    # agenda. The real UI enforces this already (remove_referral_from_agenda
    # refuses to remove a 'discussed' row - "a historical record of this
    # meeting, not agenda composition"), so removed_at can only ever be set
    # on an already-discussed row by seed data faking an edge case (My
    # Referrals' Discussed tab needs a still-'open' referral with discussion
    # history - see seed_benjamin_referral_demo.py) - Panel History/Actions
    # should still show it rather than reading as empty for that referral.
    discussed_prs = list(
        referral.panel_referrals.filter(discussion_status='discussed')
        .select_related('panel', 'panel__chair', 'panel__panel_group').order_by('-panel__date')
    )
    discussion_count = len(discussed_prs)
    discussions = []
    for idx, pr in enumerate(discussed_prs):
        pr.duration_display = presenters.clock_duration(pr.duration)
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

    referral_actions = referral.actions.select_related('category', 'assigned_to_staff', 'origin_panel_referral__panel')
    referral_actions = list(visible_actions_for(current_staff, referral_actions))
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
        stage_key, stage_label = lifecycle.stage(pending_pr)
    elif latest_discussion:
        stage_key, stage_label = lifecycle.stage(latest_discussion['pr'])
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


def inclusion_panel_action_status_update(request, referral_id):
    # Posted from the status dropdown in Referral Details' own Actions
    # section - the standalone "View Actions" modal this used to back has
    # been folded into that one view, so this is now
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
    already_escalated = referral.escalations.filter(status='open').exists()

    if request.method == 'POST':
        # A referral's escalation state is binary - at most one open
        # Escalation at a time (see CONTEXT.md, backed by
        # unique_open_escalation_per_referral). Silently no-op a resubmit
        # instead of letting the constraint raise.
        if not already_escalated:
            Escalation.objects.create(
                referral=referral,
                escalated_by_id=request.POST.get('escalated_by') or None,
                # One sentence either way - whichever preset was picked, or
                # whatever was typed into "Other". See reasons.py for the
                # field pair this reads, and Escalation.reason for why it's
                # stored as text rather than pointing back at the preset.
                reason=reasons.reason_from_post(request.POST),
            )
        # Escalating doesn't change anything about this referral's own
        # panel/discussion state, so its status is left as whatever
        # lifecycle.sync_referral_status already computed (normally 'open', since
        # escalation typically happens before any panel discussion) rather
        # than forcing a value that doesn't actually fit what happened.
        return redirect(_safe_next(request, '/inclusion/panel/referrals/'))

    return render(request, 'hubs/inclusion/panel/escalate_form.html', {
        **_panel_base_context(request),
        'referral': referral,
        'already_escalated': already_escalated,
        'staff_list': staff_queryset_for_school_key(current_school_key(request)),
        'reason_presets': PresetReason.objects.for_context(PresetReason.CONTEXT_ESCALATION),
        'next': request.GET.get('next', ''),
    })
