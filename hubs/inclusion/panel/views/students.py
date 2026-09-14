"""The Students dashboard and its filter set."""

from django.db.models import Count, Exists, OuterRef
from django.shortcuts import render
from django.utils import timezone

from core.identity import (
    current_school_key,
    is_aggregate_school_key,
    student_queryset_for_school_key,
)
from core.models import StaffGroup, Student
from core.dashboard_filters import Filter, FilterSet, equals, flag, tristate
from core.student_history import (
    attendance_authorised_pct,
    attendance_percentage,
    attendance_unauthorised_pct,
    behaviour_summary,
    positive_behaviour_summary,
    prefetch_history,
)

from ..models import Action, InclusionReferral

from .base import _panel_base_context
from .shared import TICKED, _paginate_for_infinite_scroll, _token_name_filter

# The Students dashboard's filters, declared once. Each entry is the whole
# fact: the query-string name, and how it narrows. The reading, the badge
# count and the context keys the template reads back are all derived from
# this list - see core.dashboard_filters for why that matters.
STUDENT_FILTERS = FilterSet(
    # An exact pick from the search picker. Supersedes the free-text name
    # match below, which used to be an if/elif whose ordering carried the
    # rule silently.
    Filter(
        'student',
        apply=lambda qs, v, vals: qs.filter(pk=int(v)),
        active=lambda v: v.isdigit(),
        # Narrows but doesn't count: the sum this replaced listed every other
        # filter and not this one, so a pinned student left the badge reading
        # zero while a typed name read one. Preserved exactly rather than
        # quietly corrected - it is a real inconsistency, but a visible one,
        # and not this refactor's to change.
        counts=lambda v: False,
        context_value=lambda v: int(v) if v.isdigit() else '',
    ),
    Filter(
        'name',
        apply=lambda qs, v, vals: qs.filter(
            _token_name_filter(v.split(), 'first_name', 'last_name', 'admission_number')
        ),
        superseded_by=('student',),
    ),
    Filter('year', equals('year_group')),
    Filter('house', equals('house')),
    Filter('reg', equals('reg_form')),
    # Both narrow against annotations added further down the view, which is
    # why narrowing stays a separate call from binding.
    Filter('has_referrals',
           apply=lambda qs, v, vals: qs.filter(referrals_count__gt=0),
           active=TICKED, context_value=TICKED),
    Filter('overdue_actions', flag('has_overdue_actions'),
           active=TICKED, context_value=TICKED),
    # Candidate filters behind "More filters" (issue #9).
    Filter('sen_status', equals('sen_status')),
    Filter('gender', equals('gender')),
    Filter('ethnicity', equals('ethnicity')),
    Filter('is_pp', tristate('is_pp')),
    Filter('is_eal', tristate('is_eal')),
    Filter('is_lac', tristate('is_lac')),
    Filter('is_young_carer', tristate('is_young_carer')),
    Filter('is_more_able', tristate('is_more_able')),
)


def inclusion_panel_students(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    is_aggregate_view = is_aggregate_school_key(school_key)

    filters = STUDENT_FILTERS.bind(request)

    today = timezone.localdate()
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
    overdue_actions_subquery = Action.objects.filter(
        referral__student=OuterRef('pk'), status='incomplete', due_date__lt=today,
    )
    students = base_students.annotate(
        referrals_count=Count('referrals', distinct=True),
        actions_count=Count('referrals__actions', distinct=True),
        # Exists(), not a further Count(..., distinct=True) - a plain
        # .filter('referrals__actions__...') on this same relation path
        # would apply its WHERE clause to the join the two Count()s above
        # already share, throwing off their aggregation (rows the overdue
        # filter excludes would also disappear from the counts). A
        # correlated subquery sidesteps that entirely - it's evaluated
        # independently per student, so it can't interact with the joins
        # above at all.
        has_overdue_actions=Exists(overdue_actions_subquery),
    ).select_related('school', 'form_tutor')
    # prefetch_history owns the relation list rather than spelling it out here -
    # positive_behaviour_incidents was missing from this call, so every row's
    # positive_behaviour_summary() was its own query.
    students = prefetch_history(students)
    students = filters.narrow(students).order_by('last_name', 'first_name')

    # Totals for the header/footer stats strip ("240 Students · 59
    # Referrals · 82 Actions") - computed against the full filtered
    # queryset before pagination slices it down (live feedback: "maybe its
    # the number of students?... cap the number of results. This will be
    # for a MAT so roughly 4000 students eventually!" - the stutter turned
    # out to be plain DOM-size layout cost, confirmed by testing with all
    # page JS disabled and it still being slow, so rendering only one
    # page's worth of rows at a time is the actual fix). Separate direct
    # counts against Referral/Action, not Sum() over the referrals_count/
    # actions_count annotations already on `students` - those are each
    # their own Count(..., distinct=True) specifically to dodge a join
    # fan-out between the two relations (see the comment above where
    # they're defined); aggregating Sum() on top of them in the same query
    # risks reopening exactly that bug. Three simple COUNT queries instead,
    # each against its own table, filtered by the same student set (ENG-D1:
    # against the full filtered set, before pagination slices it below).
    total_students_count = students.count()
    total_referrals_count = InclusionReferral.objects.filter(student__in=students).count()
    total_actions_count = Action.objects.filter(referral__student__in=students).count()

    # STUDENTS_PAGE_SIZE students per page (infinite scroll,
    # wireStudentsInfiniteScroll in students.html) - only this page's
    # students go through the per-row lookups below (Head of Year,
    # attendance %, behaviour incidents), not the full filtered set.
    STUDENTS_PAGE_SIZE = 50
    page_obj, page_number, is_continuation = _paginate_for_infinite_scroll(
        students, request, is_ajax, STUDENTS_PAGE_SIZE
    )
    students = list(page_obj.object_list)
    for student in students:
        student.has_pills = bool(
            student.sen_status or student.is_pp or student.is_eal
            or student.is_lac or student.is_young_carer or student.is_more_able
        )

    # Head of Year, for the row-detail column below - seed_staff_groups
    # (core) creates a "Head of Year N" StaffGroup per school/year group but
    # deliberately seeds it with zero members ("real holder TBD"), so this
    # resolves to nobody for every student today; wired up properly now
    # (rather than hardcoding an em dash) so it starts showing real names
    # the moment someone's actually added to one of those groups.
    # year_group__isnull=False is what's unique to Head of Year among
    # StaffGroup's other rows (SENCo Team/Careers Team never set it) - see
    # core/CONTEXT.md.
    hoy_by_school_year = {}
    for group in StaffGroup.objects.filter(year_group__isnull=False).prefetch_related('members__staff'):
        member = next(iter(group.members.all()), None)
        hoy_by_school_year[(group.school_id, group.year_group)] = member.staff if member else None
    for student in students:
        student.head_of_year = hoy_by_school_year.get((student.school_id, student.year_group))
    # Attendance % / Behaviour incident count, for the row-detail column
    # below (live feedback: "pair Prior Attainment Band with... Attendance
    # %", then "Lose Attainment and add in Negative Behaviour Points" ->
    # "Incident count" once it turned out BehaviourIncident has no summable
    # points field, only a severity tier - core.student_history.
    # behaviour_summary() is the existing "N incidents logged" derived
    # view). Both always derived at query time via core.student_history
    # (see docs/adr/0007), never a stored field - attendance_percentage()/
    # behaviour_summary() read student.attendance_days.all()/
    # student.behaviour_incidents.all(), which the queryset's own
    # prefetch_related(...) above already warms, so this is one query per
    # relation for the whole list, not one per row.
    for student in students:
        student.attendance_pct = attendance_percentage(student)
        # PA pill, not a coloured percentage (live feedback: "I did not
        # want attendance to be a pill" [on the percentage] -> "maybe we
        # add a PA pill instead") - PA (Persistent Absence) is the DfE's
        # own standard flag for attendance below 90%, so it's a real
        # threshold crossing worth calling out, not an invented tier;
        # unlike the percentage (always shown), the pill only appears once
        # a student actually crosses it - same "callout only when it means
        # something" convention Actions' own Overdue pill uses.
        student.is_persistently_absent = student.attendance_pct is not None and student.attendance_pct < 90
        # AA/UA % alongside the overall percentage (live feedback:
        # "Attendance needs an extra field" -> "what about PA vs AA %" ->
        # "I meant AA and UA" - Authorised/Unauthorised absence percentage,
        # same breakdown the Student Details attendance card's own legend
        # already shows, not a new metric invented for this column).
        student.attendance_authorised_pct = attendance_authorised_pct(student)
        student.attendance_unauthorised_pct = attendance_unauthorised_pct(student)
        student.behaviour_incidents_summary = behaviour_summary(student)
        # Positive alongside negative (live feedback: "Behaviour Should
        # have positive and negative behaviour") - positive_behaviour_
        # summary mirrors behaviour_summary's own phrasing/shape exactly so
        # the two read as a matched pair in the same column.
        student.positive_behaviour_summary_text = positive_behaviour_summary(student)
        # Current age, not year-arrived (live feedback: "DOB could include
        # current age" -> "lose YOA") - whole years as of today, the
        # standard "subtract a year if this year's birthday hasn't happened
        # yet" calculation.
        student.current_age = None
        if student.date_of_birth:
            student.current_age = today.year - student.date_of_birth.year - (
                (today.month, today.day) < (student.date_of_birth.month, student.date_of_birth.day)
            )

    context = {
        **_panel_base_context(request),
        'students': students,
        'is_aggregate_view': is_aggregate_view,
        'years': years,
        'forms': forms,
        # Raw dict for json_script (students.js reads it as a data island,
        # not the escapejs-in-a-string-literal convention the inline
        # <script> used before #210).
        'forms_by_year': forms_by_year,
        'has_houses': has_houses,
        'houses': houses,
        **filters.context,
        'sen_status_choices': Student.SEN_STATUS_CHOICES,
        'gender_choices': Student.GENDER_FILTER_CHOICES,
        'ethnicity_choices': Student.ETHNICITY_CHOICES,
        'active_filter_count': filters.active_count,
        'students_count': total_students_count,
        'referrals_count': total_referrals_count,
        'actions_count': total_actions_count,
        'page_obj': page_obj,
    }
    if page_obj.has_next():
        next_params = request.GET.copy()
        next_params['page'] = page_number + 1
        context['next_page_url'] = request.path + '?' + next_params.urlencode()
    if is_continuation:
        template = 'hubs/inclusion/panel/_students_rows.html'
    elif is_ajax:
        template = 'hubs/inclusion/panel/_students_filtered_content.html'
    else:
        template = 'hubs/inclusion/panel/students.html'
    return render(request, template, context)
