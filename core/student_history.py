import datetime

from django.db import models
from django.utils import timezone

from core.models import AcademicYear
from core.term_dates import terms_for_school

# Derived views over AttendanceDay/BehaviourIncident/Exclusion/
# PositiveBehaviourIncident - the "never stored" half of
# docs/adr/0007-student-history-tables-not-summary-fields.md. Every
# percentage/summary/count shown anywhere in the app comes from one of these,
# never a field on Student directly.


def attendance_percentage(student):
    """Percentage of AM+PM sessions marked 'present' across every recorded
    AttendanceDay. None (not 0) when no attendance has been recorded yet, so
    callers can render "—" instead of a misleading 0%."""
    days = list(student.attendance_days.all())
    if not days:
        return None
    total_sessions = len(days) * 2
    present_sessions = sum(
        (d.am_status == 'present') + (d.pm_status == 'present') for d in days
    )
    return round(present_sessions / total_sessions * 100, 1)


def attendance_sessions_possible(student):
    return student.attendance_days.count() * 2


def attendance_authorised_absences(student):
    days = student.attendance_days.all()
    return sum((d.am_status == 'absent_authorised') + (d.pm_status == 'absent_authorised') for d in days)


def attendance_unauthorised_absences(student):
    days = student.attendance_days.all()
    return sum((d.am_status == 'absent_unauthorised') + (d.pm_status == 'absent_unauthorised') for d in days)


def attendance_authorised_pct(student):
    possible = attendance_sessions_possible(student)
    if not possible:
        return 0
    return round(attendance_authorised_absences(student) / possible * 100, 1)


def attendance_unauthorised_pct(student):
    possible = attendance_sessions_possible(student)
    if not possible:
        return 0
    return round(attendance_unauthorised_absences(student) / possible * 100, 1)


def _week_bounds(date):
    monday = date - datetime.timedelta(days=date.weekday())
    return monday, monday + datetime.timedelta(days=4)


def _month_bounds(date):
    start = date.replace(day=1)
    if date.month == 12:
        end = date.replace(year=date.year + 1, month=1, day=1) - datetime.timedelta(days=1)
    else:
        end = date.replace(month=date.month + 1, day=1) - datetime.timedelta(days=1)
    return start, end


_UNSCHEDULED_KEY = datetime.date.min


def _half_term_bucket(date, terms):
    for term in terms:
        if term.start_date <= date <= term.end_date:
            if term.half_term_start and date >= term.half_term_start:
                return term.half_term_start, f'{term.get_name_display()} 2'
            label = f'{term.get_name_display()} 1' if term.half_term_start else term.get_name_display()
            return term.start_date, label
    # Falls outside every known Term row (e.g. a school holiday) - one
    # shared bucket for every such day, not one per day.
    return _UNSCHEDULED_KEY, 'Unscheduled'


def _term_bucket(date, terms):
    for term in terms:
        if term.start_date <= date <= term.end_date:
            return term.start_date, term.get_name_display()
    return _UNSCHEDULED_KEY, 'Unscheduled'


def _year_bucket(date, years):
    for year in years:
        if year.start_date <= date <= year.end_date:
            return year.start_date, year.label
    return _UNSCHEDULED_KEY, 'Unscheduled'


def _period_key_label(date, granularity, terms=None, years=None):
    """Bucket key/label for one date under a given granularity - shared by
    every '<thing>_periods' builder below so week/month/half_term/term/year
    bucketing logic lives in exactly one place."""
    if granularity == 'month':
        key, _ = _month_bounds(date)
        return key, key.strftime('%B %Y')
    elif granularity == 'half_term':
        return _half_term_bucket(date, terms)
    elif granularity == 'term':
        return _term_bucket(date, terms)
    elif granularity == 'year':
        return _year_bucket(date, years)
    else:
        key, _ = _week_bounds(date)
        return key, f'Week of {key.strftime("%d/%m")}'


def _periods_scope(student, records, granularity, date_attr='date'):
    """Scopes records (anything with a `date_attr` date field) to the current
    academic year for every granularity except 'year' (which deliberately
    spans the whole log to compare this year against last), and builds the
    terms/years lookups each bucketer needs. Returns (records, terms, years),
    or None if nothing is left to bucket."""
    if not records:
        return None
    if granularity != 'year':
        current_year = AcademicYear.for_date(timezone.localdate())
        records = [r for r in records if current_year.start_date <= getattr(r, date_attr) <= current_year.end_date]
        if not records:
            return None
    terms = list(terms_for_school(student.school).order_by('start_date')) if granularity in ('half_term', 'term') else None
    years = list(AcademicYear.objects.order_by('start_date')) if granularity == 'year' else None
    return records, terms, years


def attendance_periods(student, granularity='week'):
    """Buckets the student's AttendanceDay log into period-level attendance
    breakdowns for the Attendance card's 'View details' disclosure.
    granularity: 'week' | 'month' | 'half_term' | 'term' | 'year'.
    half_term/term bucketing uses the same school-tiered Term resolution as
    core.term_dates (a school's own calendar overrides the MAT-wide one);
    'year' groups by AcademicYear (e.g. "2025/26" vs "2024/25") so last
    year can be compared against this one."""
    scope = _periods_scope(student, list(student.attendance_days.all().order_by('date')), granularity)
    if scope is None:
        return []
    days, terms, years = scope

    buckets = {}
    for day in days:
        key, label = _period_key_label(day.date, granularity, terms, years)
        bucket = buckets.setdefault(key, {'label': label, 'present': 0, 'authorised': 0, 'unauthorised': 0, 'sessions': 0})
        bucket['sessions'] += 2
        bucket['present'] += (day.am_status == 'present') + (day.pm_status == 'present')
        bucket['authorised'] += (day.am_status == 'absent_authorised') + (day.pm_status == 'absent_authorised')
        bucket['unauthorised'] += (day.am_status == 'absent_unauthorised') + (day.pm_status == 'absent_unauthorised')

    periods = []
    for key in sorted(buckets):
        b = buckets[key]
        sessions = b['sessions']
        periods.append({
            'label': b['label'],
            'percentage': round(b['present'] / sessions * 100, 1) if sessions else 0,
            'authorised_pct': round(b['authorised'] / sessions * 100, 1) if sessions else 0,
            'unauthorised_pct': round(b['unauthorised'] / sessions * 100, 1) if sessions else 0,
        })
    return periods


def behaviour_periods(student, granularity='week'):
    """Buckets the student's BehaviourIncident log into period-level
    low/medium/high breakdowns for the Behaviour card's 'View details'
    disclosure - same granularity/scoping rules as attendance_periods."""
    scope = _periods_scope(student, list(student.behaviour_incidents.all().order_by('date')), granularity)
    if scope is None:
        return []
    incidents, terms, years = scope

    buckets = {}
    for incident in incidents:
        key, label = _period_key_label(incident.date, granularity, terms, years)
        bucket = buckets.setdefault(key, {'label': label, 'low': 0, 'medium': 0, 'high': 0})
        bucket[incident.severity] += 1

    periods = []
    for key in sorted(buckets):
        b = buckets[key]
        total = b['low'] + b['medium'] + b['high']
        periods.append({
            'label': b['label'],
            'low': b['low'], 'medium': b['medium'], 'high': b['high'],
            'total': total,
            'low_pct': round(b['low'] / total * 100, 1) if total else 0,
            'medium_pct': round(b['medium'] / total * 100, 1) if total else 0,
            'high_pct': round(b['high'] / total * 100, 1) if total else 0,
        })
    return periods


def positive_behaviour_periods(student, granularity='week'):
    """Buckets the student's PositiveBehaviourIncident log into period-level
    points/entry totals for the Positive Behaviour card's 'View details'
    disclosure - same granularity/scoping rules as attendance_periods."""
    scope = _periods_scope(student, list(student.positive_behaviour_incidents.all().order_by('date')), granularity)
    if scope is None:
        return []
    entries, terms, years = scope

    buckets = {}
    for entry in entries:
        key, label = _period_key_label(entry.date, granularity, terms, years)
        bucket = buckets.setdefault(key, {'label': label, 'points': 0, 'entries': 0})
        bucket['points'] += entry.points
        bucket['entries'] += 1

    return [{'label': buckets[key]['label'], 'points': buckets[key]['points'], 'entries': buckets[key]['entries']} for key in sorted(buckets)]


def behaviour_summary(student):
    """One-line derived summary of a student's behaviour incident log, for
    display where the old freeform Student.behaviour_summary field used to
    be read directly."""
    count = student.behaviour_incidents.count()
    if count == 0:
        return 'No incidents logged'
    return f'{count} incident{"s" if count != 1 else ""} logged'


def behaviour_severity_counts(student):
    """Count of logged incidents per severity tier — the axis that matters
    for a quick 'how bad' read, distinct from category."""
    counts = {'low': 0, 'medium': 0, 'high': 0}
    rows = student.behaviour_incidents.values('severity').annotate(total=models.Count('id'))
    for row in rows:
        counts[row['severity']] = row['total']
    return counts


def behaviour_severity_pct(student):
    """Low/medium/high incident counts as percentages of the total - the
    same shape attendance_authorised_pct/attendance_unauthorised_pct give
    the Attendance ring, so the Behaviour card can drive an identical
    conic-gradient ring off cumulative percentage stops."""
    counts = behaviour_severity_counts(student)
    total = sum(counts.values())
    if not total:
        return {'low': 0, 'medium': 0, 'high': 0}
    return {tier: round(count / total * 100, 1) for tier, count in counts.items()}


def exclusion_count(student):
    return student.exclusions.count()


def exclusion_most_recent(student):
    return student.exclusions.first()


def positive_behaviour_points(student):
    """Summed points across a student's whole positive-recognition log —
    summable, unlike BehaviourIncident's per-event severity tier."""
    return student.positive_behaviour_incidents.aggregate(
        total=models.Sum('points')
    )['total'] or 0


def positive_behaviour_entry_count(student):
    return student.positive_behaviour_incidents.count()
