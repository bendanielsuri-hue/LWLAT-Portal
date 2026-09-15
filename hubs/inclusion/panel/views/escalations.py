"""Escalations: the dashboard, resolving one, and launching a MAT-level panel from one."""

from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone

from core.identity import (
    current_school_key,
    is_aggregate_school_key,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import AcademicYear
from core.dashboard_filters import Filter, FilterSet, equals

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import lifecycle
from ..models import Escalation, InclusionReferral, Panel, PanelReferral, ReferralQuestion

from .base import _panel_base_context
from .shared import _paginate_for_infinite_scroll, _term_choices_and_ranges, _token_name_filter
from .meeting_shared import _mat_panel_group, _mat_panel_running, _next_agenda_order

# The Escalations dashboard's filters. Modelled on Referrals (live feedback:
# "lets do escalations page, this can be modelled after the Referrals page"),
# with every field path walked one hop further through Escalation.referral.
# No House/Reg: both are school-internal pastoral groupings with no meaning
# MAT-wide, unlike Year Group.
ESCALATION_FILTERS = FilterSet(
    Filter(
        'student',
        apply=lambda qs, v, vals: qs.filter(referral__student_id=int(v)),
        active=lambda v: v.isdigit(),
        counts=lambda v: False,
        context_value=lambda v: int(v) if v.isdigit() else '',
    ),
    Filter(
        'name',
        apply=lambda qs, v, vals: qs.filter(_token_name_filter(
            v.split(), 'referral__student__first_name', 'referral__student__last_name',
            'referral__student__admission_number',
        )),
        superseded_by=('student',),
    ),
    Filter('status', equals('status')),
    Filter('escalated_by', apply=lambda qs, v, vals: (
        qs.filter(escalated_by__isnull=True) if v == 'unassigned'
        else qs.filter(escalated_by_id=v)
    )),
    Filter('concern', apply=lambda qs, v, vals: qs.filter(
        referral__responses__question__label='Main Concern Category',
        referral__responses__answer=v,
    )),
    Filter('priority', equals('referral__priority')),
    Filter('academic_year'),
    Filter('term'),
    Filter('year', equals('referral__student__year_group')),
)


def inclusion_panel_escalations(request):
    # Modelled directly on inclusion_panel_referrals (live feedback: "lets
    # do escalations page, this can be modelled after the Referrals page")
    # - same filter-bar/facts-strip/infinite-scroll chrome, field paths
    # walked one hop further through Escalation.referral (an InclusionReferral)
    # to reach the same underlying student/priority/responses/panel_referrals/
    # actions relations Referrals already filters on.
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    is_aggregate_view = is_aggregate_school_key(school_key)
    scoped_students = student_queryset_for_school_key(school_key)
    today = timezone.localdate()

    filters = ESCALATION_FILTERS.bind(request)
    academic_year_filter = filters['academic_year']
    term_filter = filters['term']

    academic_years_present = {
        ay.id: ay for ay in AcademicYear.objects.filter(
            referrals__inclusion_detail__escalations__isnull=False,
            referrals__inclusion_detail__student__in=scoped_students,
        ).distinct()
    }
    academic_year_choices = [
        (ay.id, ay.label)
        for ay in sorted(academic_years_present.values(), key=lambda ay: ay.start_date, reverse=True)
    ]
    # No default academic year applied on first load - same #121 follow-up
    # call as Referrals'/Meetings' own identical comment.
    current_academic_year = AcademicYear.for_date(today).id
    if academic_year_filter and not any(str(year) == academic_year_filter for year, _ in academic_year_choices):
        academic_year_filter = filters.set_value('academic_year', '')

    school_ids_for_terms = list(scoped_students.order_by().values_list('school_id', flat=True).distinct())
    # escalated_at (Escalation's own field), not the referral's created_at -
    # Term should place this by when it was actually escalated, not when the
    # underlying referral was first raised.
    term_filter, term_choices, terms_by_academic_year, term_q = _term_choices_and_ranges(
        Escalation.objects.filter(referral__student__in=scoped_students),
        school_ids_for_terms, academic_years_present.keys(), term_filter, academic_year_filter,
        'escalated_at', 'referral__student__school_id',
    )
    filters.set_value('term', term_filter)

    # Year only - not House/Reg (live feedback: "MAT level are not going to
    # care about house and reg" - both are school-internal pastoral
    # groupings with no meaning across schools, unlike Year Group, which is
    # still a real cohort comparison MAT-wide (a Year 9 at one school is a
    # genuine peer of a Year 9 at another). Referrals/Students keep House/
    # Reg since those pages are worked school-by-school, not MAT-wide.
    years = sorted({y for y in scoped_students.values_list('year_group', flat=True) if y is not None})

    escalations_qs = Escalation.objects.filter(referral__student__in=scoped_students).select_related(
        'referral', 'referral__student', 'referral__student__school', 'escalated_by', 'resolved_by', 'referral__referral',
    ).prefetch_related(
        'referral__responses__question', 'referral__panel_referrals__panel__panel_group', 'referral__actions',
    )
    if academic_year_filter:
        escalations_qs = escalations_qs.filter(referral__referral__academic_year_id=academic_year_filter)
    if term_q is not None:
        escalations_qs = escalations_qs.filter(term_q)
    escalations_qs = filters.narrow(escalations_qs).distinct()

    # Totals for the stats-strip - computed against the full filtered
    # queryset before pagination slices it down, same convention as
    # Referrals' own total_referrals_count/etc.
    total_escalations_count = escalations_qs.count()
    total_students_count = escalations_qs.values('referral__student_id').distinct().count()
    total_resolved_count = escalations_qs.filter(status='resolved').count()

    ESCALATIONS_PAGE_SIZE = 50
    page_obj, page_number, is_continuation = _paginate_for_infinite_scroll(
        escalations_qs, request, is_ajax, ESCALATIONS_PAGE_SIZE
    )

    escalations = list(page_obj.object_list)
    for escalation in escalations:
        referral = escalation.referral
        referral_actions = referral.actions.all()
        escalation.actions_count = len(referral_actions)
        escalation.completed_actions_count = sum(1 for a in referral_actions if a.status == 'complete')
        escalation.incomplete_actions_count = sum(1 for a in referral_actions if a.status == 'incomplete')
        upcoming_prs = sorted(
            (pr for pr in referral.panel_referrals.all() if pr.removed_at is None and pr.panel.date >= today),
            key=lambda pr: pr.panel.date,
        )
        next_panel = upcoming_prs[0].panel if upcoming_prs else None
        escalation.next_panel_group = next_panel.panel_group if next_panel else None
        escalation.next_panel_date = next_panel.date if next_panel else None

    concern_question = ReferralQuestion.objects.filter(label='Main Concern Category', is_active=True).first()
    running_mat_panel = _mat_panel_running()

    context = {
        **_panel_base_context(request),
        'escalations': escalations,
        'status_choices': Escalation.STATUS_CHOICES,
        'staff_list': staff_queryset_for_school_key(school_key),
        **filters.context,
        'academic_year_choices': academic_year_choices,
        'term_choices': term_choices,
        # Raw dict for json_script (escalations.js reads it as a data
        # island, not the escapejs-in-a-string-literal convention the
        # inline <script> used before #210).
        'terms_by_academic_year': terms_by_academic_year,
        'concern_choices': concern_question.choice_list() if concern_question else [],
        'priority_choices': InclusionReferral.PRIORITY_CHOICES,
        'years': years,
        'active_filter_count': filters.active_count,
        'students_count': total_students_count,
        'escalations_count': total_escalations_count,
        'resolved_count': total_resolved_count,
        'is_aggregate_view': is_aggregate_view,
        'page_obj': page_obj,
        # Drives the Launch/Add-to-running-meeting button label - see
        # inclusion_panel_escalation_quick_launch, which re-checks this
        # server-side rather than trusting this page-load snapshot.
        'running_mat_panel': running_mat_panel,
        'mat_group_missing': _mat_panel_group() is None,
    }
    if page_obj.has_next():
        next_params = request.GET.copy()
        next_params['page'] = page_number + 1
        context['next_page_url'] = request.path + '?' + next_params.urlencode()
    if is_continuation:
        template = 'hubs/inclusion/panel/_escalations_rows.html'
    elif is_ajax:
        template = 'hubs/inclusion/panel/_escalations_filtered_content.html'
    else:
        template = 'hubs/inclusion/panel/escalations.html'
    return render(request, template, context)


def inclusion_panel_escalation_resolve(request, escalation_id):
    escalation = get_object_or_404(Escalation, pk=escalation_id)
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        escalation.status = 'resolved'
        escalation.resolved_by = _current_staff(request)
        escalation.resolved_at = timezone.now()
        escalation.save()
        if is_ajax:
            return JsonResponse({'success': True})
    return redirect('inclusion_panel_escalations')


def inclusion_panel_escalation_quick_launch(request, escalation_id):
    # "Launch MAT Meeting" from the Escalations screen - see CONTEXT.md's MAT
    # Panel Meeting entry and docs/adr/0015. Branches on whether a MAT panel
    # is already running: if so, append this escalation's referral onto its
    # live agenda (the same generic add_referral path Setup uses); otherwise
    # create one directly in 'running' status with this referral pre-added
    # and discussion already started. Only one MAT Panel Meeting may run at
    # a time, so this is also the only place a MAT Panel is ever created
    # outside the normal "New Panel Meeting" flow.
    escalation = get_object_or_404(Escalation, pk=escalation_id, status='open')
    if request.method != 'POST':
        return redirect('inclusion_panel_escalations')

    mat_group = _mat_panel_group()
    if mat_group is None:
        return redirect('inclusion_panel_escalations')

    running = _mat_panel_running()
    if running is not None:
        pr, created = PanelReferral.objects.get_or_create(panel=running, referral=escalation.referral)
        if created:
            pr.agenda_order = _next_agenda_order(running)
            pr.save()
        elif pr.removed_at is not None:
            pr.removed_at = None
            pr.removed_by = None
            pr.agenda_order = _next_agenda_order(running)
            pr.save()
        lifecycle.sync_referral_status(pr.referral)
        return redirect('inclusion_panel_meeting_agenda', panel_id=running.id)

    now = timezone.now()
    panel = Panel.objects.create(
        date=timezone.localdate(now), time=timezone.localtime(now).time(),
        panel_group=mat_group, chair_follows_default=True,
        status='running', started_at=now,
    )
    pr = PanelReferral.objects.create(
        panel=panel, referral=escalation.referral, agenda_order=_next_agenda_order(panel),
        discussion_status='pending', discussion_started_at=now,
    )
    lifecycle.sync_referral_status(pr.referral)
    # Same query-string convention as start_discussion above - this is the
    # actual start-of-discussion moment, so the Discussion page may auto-pop
    # the Safeguarding Note modal.
    return redirect(reverse('inclusion_panel_discussion', kwargs={'panel_referral_id': pr.id}) + '?discussion_started=1')
