import datetime
import json

from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.shortcuts import render
from django.utils import timezone

from core.identity import (
    current_school_key,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import Student
from core.modules import filter_by_module, module_map

from hubs.inclusion.panel.models import Action, InclusionReferral

INCLUSION_MENU = [
    {'name': 'Provision & Strategies', 'url': '/inclusion/provision-strategies/', 'icon': 'icons/registers_svg.html', 'module_key': 'inclusion_provision_strategies'},
    {'name': 'Inclusion Panel', 'url': '/inclusion/panel/', 'icon': 'icons/people_svg.html', 'module_key': 'inclusion_panel'},
    {'name': 'SEND Diagnosis Tracker', 'url': '/inclusion/diagnosis-tracker/', 'icon': 'icons/reports_svg.html', 'module_key': 'inclusion_diagnosis_tracker'},
]


def _local_menu(request):
    return filter_by_module(INCLUSION_MENU, module_map(), request)


def _hub_context(request):
    return {'local_menu': _local_menu(request), 'hub_title': 'SEND & Provision'}


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
            'total': total,
            'k_count': k_count,
            'e_count': e_count,
            'n_count': n_count,
            'k_pct': _pct(k_count, total),
            'e_pct': _pct(e_count, total),
            'n_pct': _pct(n_count, total),
            'send_pct': _pct(k_count + e_count, total),
        })
    return breakdown


def _referral_trend(students):
    # Full academic year (August-July) containing today, so months with
    # zero referrals still appear (TruncMonth+annotate alone would silently
    # drop empty months) and the chart doesn't shrink back to a rolling
    # window as the year progresses.
    today = timezone.localdate()
    academic_start_year = today.year if today.month >= 8 else today.year - 1
    start = datetime.date(academic_start_year, 8, 1)
    buckets = []
    cursor = start
    for _ in range(12):
        buckets.append(cursor)
        month = cursor.month + 1
        year = cursor.year
        if month > 12:
            month = 1
            year += 1
        cursor = datetime.date(year, month, 1)

    counts = dict(
        InclusionReferral.objects.filter(student__in=students, created_at__date__gte=start)
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(count=Count('id'))
        .values_list('month', 'count')
    )
    counts_by_date = {k.date().replace(day=1): v for k, v in counts.items()}

    max_count = max(counts_by_date.values(), default=0)
    return [
        {
            'label': bucket.strftime('%b %y'),
            'count': counts_by_date.get(bucket, 0),
            'pct': _pct(counts_by_date.get(bucket, 0), max_count) if max_count else 0,
        }
        for bucket in buckets
    ]


def inclusion_hub(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    base_students = student_queryset_for_school_key(school_key)

    # Option lists computed from the school-scoped set, before the filters
    # below are applied, so the dropdowns don't shrink as they're used —
    # except Reg Group, which is deliberately scoped to the selected Year
    # Group below, since a reg form belongs to exactly one year group and
    # showing every school's reg forms regardless of year picked is just
    # confusing/unusable on a real school roll.
    year_group_choices = list(base_students.order_by('year_group').values_list('year_group', flat=True).distinct())

    # The filter bar itself isn't part of the AJAX-swapped region (see
    # hub.html), so once JS is driving, Year -> Reg Group narrowing has to
    # happen client-side — this is the same {year: [reg_forms]} shape as
    # forms_by_year_json in hubs/inclusion/panel/views.py::inclusion_panel_students.
    reg_groups_by_year = {
        year: sorted({
            reg_form for reg_form in base_students.filter(year_group=year)
            .exclude(reg_form='').values_list('reg_form', flat=True)
        })
        for year in year_group_choices
    }
    reg_groups_by_year_json = json.dumps(reg_groups_by_year)

    selected_year_group = request.GET.get('year_group') or ''

    reg_group_scope = base_students.filter(year_group=selected_year_group) if selected_year_group else base_students
    reg_group_choices = list(
        reg_group_scope.exclude(reg_form='').order_by('reg_form').values_list('reg_form', flat=True).distinct()
    )

    selected_reg_group = request.GET.get('reg_group') or ''
    # A reg group chosen before switching Year Group may no longer be a valid
    # option for the new year — drop it rather than silently filtering by a
    # reg form that isn't even shown as selected in the (now-narrowed) list.
    if selected_reg_group and selected_reg_group not in reg_group_choices:
        selected_reg_group = ''
    selected_pp = request.GET.get('pp') or ''
    selected_ethnicity = request.GET.get('ethnicity') or ''
    selected_more_able = request.GET.get('more_able') or ''
    selected_gender = request.GET.get('gender') or ''
    selected_send_code = request.GET.get('send_code') or ''
    selected_prior_attainment = request.GET.get('prior_attainment') or ''

    students = base_students
    if selected_year_group:
        students = students.filter(year_group=selected_year_group)
    if selected_reg_group:
        students = students.filter(reg_form=selected_reg_group)
    if selected_pp in ('1', '0'):
        students = students.filter(is_pp=(selected_pp == '1'))
    if selected_ethnicity:
        students = students.filter(ethnicity=selected_ethnicity)
    if selected_more_able in ('1', '0'):
        students = students.filter(is_more_able=(selected_more_able == '1'))
    if selected_gender in ('M', 'F'):
        students = students.filter(gender=selected_gender)
    if selected_send_code in ('K', 'E'):
        students = students.filter(sen_status=selected_send_code)
    elif selected_send_code == 'N':
        students = students.filter(sen_status='')
    if selected_prior_attainment:
        students = students.filter(prior_attainment_band=selected_prior_attainment)

    total_students = students.count()
    send_students = students.exclude(sen_status='')
    send_count = send_students.count()
    k_count = students.filter(sen_status='K').count()
    e_count = students.filter(sen_status='E').count()

    code_breakdown = [
        {'label': 'EHCP (E)', 'count': e_count, 'pct': _pct(e_count, total_students), 'code': 'e'},
        {'label': 'SEN Support (K)', 'count': k_count, 'pct': _pct(k_count, total_students), 'code': 'k'},
        {'label': 'None', 'count': total_students - send_count, 'pct': _pct(total_students - send_count, total_students), 'code': 'n'},
    ]

    year_rows = list(
        students.values('year_group').annotate(
            k_count=Count('id', filter=Q(sen_status='K')),
            e_count=Count('id', filter=Q(sen_status='E')),
            total=Count('id'),
        ).order_by('year_group')
    )
    for row in year_rows:
        row['year_group'] = f"Year {row['year_group']}"
    year_breakdown = _ken_breakdown(year_rows, 'year_group')

    gender_rows = list(
        students.exclude(gender='').values('gender').annotate(
            k_count=Count('id', filter=Q(sen_status='K')),
            e_count=Count('id', filter=Q(sen_status='E')),
            total=Count('id'),
        )
    )
    gender_labels = dict(Student.GENDER_CHOICES)
    for row in gender_rows:
        row['gender'] = gender_labels.get(row['gender'], row['gender'])
    gender_breakdown = _ken_breakdown(gender_rows, 'gender')

    referrals_this_year = InclusionReferral.objects.filter(
        student__in=students, created_at__year=timezone.localdate().year
    ).count()

    referral_status_counts = dict(
        InclusionReferral.objects.filter(student__in=students).values('status')
        .annotate(count=Count('id')).values_list('status', 'count')
    )
    referral_breakdown = [
        {'label': label, 'count': referral_status_counts.get(key, 0)}
        for key, label in InclusionReferral.STATUS_CHOICES
    ]
    overdue_referrals = InclusionReferral.objects.filter(
        student__in=students, status='open',
        created_at__lt=timezone.now() - datetime.timedelta(days=14),
    ).count()

    need_counts = dict(
        send_students.exclude(send_need='').values('send_need').annotate(count=Count('id'))
        .values_list('send_need', 'count')
    )
    need_breakdown = sorted(
        (
            {'label': label, 'count': need_counts.get(key, 0), 'pct': _pct(need_counts.get(key, 0), send_count)}
            for key, label in Student.SEND_NEED_CHOICES
        ),
        key=lambda row: row['count'],
        reverse=True,
    )

    show_school_breakdown = school_key in ('all', 'primary', 'secondary')
    school_breakdown = []
    if show_school_breakdown:
        school_rows = list(
            students.exclude(school__isnull=True).values('school__name').annotate(
                k_count=Count('id', filter=Q(sen_status='K')),
                e_count=Count('id', filter=Q(sen_status='E')),
                total=Count('id'),
            ).order_by('-total')
        )
        school_breakdown = _ken_breakdown(school_rows, 'school__name')

    sencos = (
        staff_queryset_for_school_key(school_key)
        .filter(job_title='SENDCo', is_active=True)
        .order_by('school__name', 'last_name')
    )
    senco_multi_school = len({s.school_id for s in sencos}) > 1

    send_pct = _pct(send_count, total_students)
    ehcp_pct = _pct(e_count, total_students)

    kpi_cards = [
        {'label': 'Total Students', 'value': total_students, 'accent': 'neutral'},
        {'label': 'SEND (K + E)', 'value': send_count, 'accent': 'neutral', 'sublabel': f'{send_pct}% of cohort'},
        {'label': 'EHCP (E)', 'value': e_count, 'accent': 'primary', 'sublabel': f'{ehcp_pct}% of cohort'},
        {'label': 'Referrals This Year', 'value': referrals_this_year, 'accent': 'positive'},
        {'label': 'Overdue Referrals', 'value': overdue_referrals,
         'accent': 'negative' if overdue_referrals else 'positive'},
    ]

    referral_trend = _referral_trend(students)
    code_pcts = {row['code']: row['pct'] for row in code_breakdown}
    active_filter_count = sum(1 for v in (
        selected_year_group, selected_reg_group, selected_pp, selected_ethnicity,
        selected_more_able, selected_gender, selected_send_code, selected_prior_attainment,
    ) if v)

    context = {
        **_hub_context(request),
        'total_students': total_students,
        'send_count': send_count,
        'send_pct': send_pct,
        'k_count': k_count,
        'e_count': e_count,
        'code_breakdown': code_breakdown,
        'year_breakdown': year_breakdown,
        'need_breakdown': need_breakdown,
        'gender_breakdown': gender_breakdown,
        'referrals_this_year': referrals_this_year,
        'referral_breakdown': referral_breakdown,
        'overdue_referrals': overdue_referrals,
        'show_school_breakdown': show_school_breakdown,
        'school_breakdown': school_breakdown,
        'sencos': sencos,
        'senco_multi_school': senco_multi_school,
        'kpi_cards': kpi_cards,
        'referral_trend': referral_trend,
        'code_pcts': code_pcts,
        'year_group_choices': year_group_choices,
        'reg_group_choices': reg_group_choices,
        'reg_groups_by_year_json': reg_groups_by_year_json,
        'ethnicity_choices': Student.ETHNICITY_CHOICES,
        'prior_attainment_choices': Student.PRIOR_ATTAINMENT_CHOICES,
        'selected_year_group': selected_year_group,
        'selected_reg_group': selected_reg_group,
        'selected_pp': selected_pp,
        'selected_ethnicity': selected_ethnicity,
        'selected_more_able': selected_more_able,
        'selected_gender': selected_gender,
        'selected_send_code': selected_send_code,
        'selected_prior_attainment': selected_prior_attainment,
        'active_filter_count': active_filter_count,
    }
    template = 'hubs/inclusion/_hub_dashboard_content.html' if is_ajax else 'hubs/inclusion/hub.html'
    return render(request, template, context)


def inclusion_provision_strategies(request):
    return render(request, 'hubs/inclusion/provision_strategies.html', _hub_context(request))


def inclusion_diagnosis_tracker(request):
    return render(request, 'hubs/inclusion/diagnosis_tracker.html', _hub_context(request))
