import datetime

from django.db.models import Count, Q
from django.shortcuts import render
from django.utils import timezone

from core.identity import (
    current_school_key,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import Student
from core.modules import filter_by_module, module_map

from hubs.inclusion.panel.models import Action, Referral

INCLUSION_MENU = [
    {'name': 'Provision & Strategies', 'url': '/inclusion/provision-strategies/', 'icon': 'icons/registers_svg.html', 'module_key': 'inclusion_provision_strategies'},
    {'name': 'Inclusion Panel', 'url': '/inclusion/panel/', 'icon': 'icons/people_svg.html', 'module_key': 'inclusion_panel'},
    {'name': 'SEND Diagnosis Tracker', 'url': '/inclusion/diagnosis-tracker/', 'icon': 'icons/reports_svg.html', 'module_key': 'inclusion_diagnosis_tracker'},
]


def _local_menu(request):
    return filter_by_module(INCLUSION_MENU, module_map(), request)


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


def inclusion_hub(request):
    school_key = current_school_key(request)
    students = student_queryset_for_school_key(school_key)

    total_students = students.count()
    send_students = students.exclude(sen_status='')
    send_count = send_students.count()
    k_count = students.filter(sen_status='K').count()
    e_count = students.filter(sen_status='E').count()

    code_breakdown = [
        {'label': 'SEN Support (K)', 'count': k_count, 'pct': _pct(k_count, total_students)},
        {'label': 'EHCP (E)', 'count': e_count, 'pct': _pct(e_count, total_students)},
        {'label': 'None', 'count': total_students - send_count, 'pct': _pct(total_students - send_count, total_students)},
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

    referrals_this_year = Referral.objects.filter(
        student__in=students, created_at__year=timezone.localdate().year
    ).count()

    referral_status_counts = dict(
        Referral.objects.filter(student__in=students).values('status')
        .annotate(count=Count('id')).values_list('status', 'count')
    )
    referral_breakdown = [
        {'label': label, 'count': referral_status_counts.get(key, 0)}
        for key, label in Referral.STATUS_CHOICES
    ]
    overdue_referrals = Referral.objects.filter(
        student__in=students, status='open',
        created_at__lt=timezone.now() - datetime.timedelta(days=14),
    ).count()

    need_counts = dict(
        send_students.exclude(send_need='').values('send_need').annotate(count=Count('id'))
        .values_list('send_need', 'count')
    )
    need_breakdown = [
        {'label': label, 'count': need_counts.get(key, 0), 'pct': _pct(need_counts.get(key, 0), send_count)}
        for key, label in Student.SEND_NEED_CHOICES
    ]

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

    return render(request, 'hubs/inclusion/hub.html', {
        'local_menu': _local_menu(request),
        'hub_title': 'SEND & Provision',
        'total_students': total_students,
        'send_count': send_count,
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
    })


def inclusion_provision_strategies(request):
    return render(request, 'hubs/inclusion/provision_strategies.html', {'local_menu': _local_menu(request), 'hub_title': 'SEND & Provision'})


def inclusion_diagnosis_tracker(request):
    return render(request, 'hubs/inclusion/diagnosis_tracker.html', {'local_menu': _local_menu(request), 'hub_title': 'SEND & Provision'})
