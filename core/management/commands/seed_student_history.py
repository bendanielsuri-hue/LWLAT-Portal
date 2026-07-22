import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import AcademicYear, AttendanceDay, BehaviourIncident, Exclusion, PositiveBehaviourIncident, Staff, Student
from core.term_dates import terms_for_school

# Deterministic (student.id-keyed) attendance pattern, not random - most
# students are present every session; a minority run a bit lower to make the
# derived percentage (core.student_history.attendance_percentage) actually
# vary once seeded. Cycled per weekday so it isn't a flat repeat.
ATTENDANCE_PATTERNS = [
    ['present'] * 5,
    ['present', 'present', 'late', 'present', 'present'],
    ['present', 'absent_authorised', 'present', 'present', 'present'],
    ['present', 'present', 'present', 'absent_unauthorised', 'late'],
]

BEHAVIOUR_DESCRIPTIONS = {
    'disruption': 'Repeated calling out and interrupting the lesson.',
    'aggression': 'Verbal altercation with a peer during break time.',
    'defiance': 'Refused to follow staff instruction after a warning.',
    'other': 'Incident logged for pastoral follow-up.',
}

POSITIVE_BEHAVIOUR_DESCRIPTIONS = {
    'merit': 'Awarded a merit for consistently high-quality classwork.',
    'effort': 'Recognised for sustained effort despite a difficult topic.',
    'achievement': 'Recognised for a notable academic achievement.',
    'kindness': 'Recognised for helping a peer without being asked.',
    'other': 'Positive recognition logged.',
}


class Command(BaseCommand):
    help = (
        'Seeds a full academic year (plus the previous year, for Attendance\'s '
        'Year-comparison view) of AttendanceDay/BehaviourIncident/Exclusion/'
        'PositiveBehaviourIncident history for every seeded Student (see '
        'docs/adr/0007-student-history-tables-not-summary-fields.md) - run after '
        'seed_dummy_data and seed_term_dates. Deterministic (student.id-keyed) and '
        'idempotent: AttendanceDay/Exclusion use get_or_create on their natural key; '
        'BehaviourIncident/PositiveBehaviourIncident top up to a target count per '
        'student rather than re-creating rows each run.'
    )

    def handle(self, *args, **options):
        # Reseeding from scratch each run (not topping up) - the previous
        # scheme only covered the last 20 school days with recent-relative
        # dates, which isn't a shape this run's full-academic-year/evenly-
        # spread scheme can safely top up onto. No real data to lose (this
        # table is 100% seed data) - same "drop and reseed" default as root
        # CLAUDE.md's guidance for any other seed-shape change.
        AttendanceDay.objects.all().delete()
        BehaviourIncident.objects.all().delete()
        Exclusion.objects.all().delete()
        PositiveBehaviourIncident.objects.all().delete()

        students = list(Student.objects.select_related('school', 'form_tutor').order_by('id'))
        today = timezone.localdate()
        current_year = AcademicYear.for_date(today)
        previous_year = AcademicYear.objects.filter(start_date__lt=current_year.start_date).order_by('-start_date').first()

        attendance_created = self._seed_attendance(students, today, current_year, previous_year)
        self.stdout.write(self.style.SUCCESS(f'AttendanceDay rows created: {attendance_created}.'))

        behaviour_created = self._seed_behaviour(students, current_year, today)
        self.stdout.write(self.style.SUCCESS(f'BehaviourIncident rows created: {behaviour_created}.'))

        exclusions_created = self._seed_exclusions(students, current_year, today)
        self.stdout.write(self.style.SUCCESS(f'Exclusion rows created: {exclusions_created}.'))

        positive_created = self._seed_positive_behaviour(students, current_year, today)
        self.stdout.write(self.style.SUCCESS(f'PositiveBehaviourIncident rows created: {positive_created}.'))

    def _school_days_in_year(self, school, academic_year, cutoff):
        # Every weekday that falls inside one of this school's (tiered)
        # Terms for the given academic year - skips weekends AND holiday
        # gaps between terms, not just weekends, so "by Half Term"/"by Term"
        # grouping has real, holiday-free boundaries to work with. Capped at
        # `cutoff` (today) since attendance can't exist for the future.
        days = []
        terms = terms_for_school(school).filter(academic_year=academic_year).order_by('start_date')
        for term in terms:
            d = term.start_date
            end = min(term.end_date, cutoff)
            while d <= end:
                if d.weekday() < 5:
                    days.append(d)
                d += datetime.timedelta(days=1)
        return days

    def _seed_attendance(self, students, today, current_year, previous_year):
        created = 0
        # Cache per (school_id, academic_year_id) - only a handful of
        # distinct schools, no need to recompute the day list per student.
        day_cache = {}
        years = [y for y in (previous_year, current_year) if y]
        for student in students:
            pattern = ATTENDANCE_PATTERNS[student.id % len(ATTENDANCE_PATTERNS)]
            for year in years:
                cache_key = (student.school_id, year.id)
                if cache_key not in day_cache:
                    day_cache[cache_key] = self._school_days_in_year(student.school, year, today)
                school_days = day_cache[cache_key]
                for i, date in enumerate(school_days):
                    status = pattern[i % len(pattern)]
                    # AM/PM diverge slightly (offset by one slot) so a day
                    # isn't always identically marked in both sessions.
                    am_status = status
                    pm_status = pattern[(i + 1) % len(pattern)]
                    _, was_created = AttendanceDay.objects.get_or_create(
                        student=student, date=date,
                        defaults={'am_status': am_status, 'pm_status': pm_status},
                    )
                    if was_created:
                        created += 1
        return created

    def _logged_by_for(self, student):
        if student.form_tutor_id:
            return student.form_tutor
        if student.school_id:
            school_staff = Staff.objects.filter(school=student.school, is_active=True).order_by('id').first()
            if school_staff:
                return school_staff
        return Staff.objects.filter(is_active=True).order_by('id').first()

    def _seed_behaviour(self, students, current_year, today):
        # Sparse by design - most students have no behaviour incidents at
        # all. Every 6th student gets 6, spread evenly across the current
        # academic year (not clustered near today) so week/month/half-term/
        # term groupings all have something to show.
        created = 0
        categories = [c for c, _ in BehaviourIncident.CATEGORY_CHOICES]
        target = 6
        year_start = current_year.start_date
        span_days = (min(today, current_year.end_date) - year_start).days or 1
        for student in students:
            if student.id % 6 != 0:
                continue
            existing = student.behaviour_incidents.count()
            for slot in range(existing, target):
                category = categories[(student.id + slot) % len(categories)]
                offset = round((slot + 1) / (target + 1) * span_days)
                date = year_start + datetime.timedelta(days=offset)
                severity = ['low', 'medium', 'high'][(student.id + slot) % 3]
                incident, was_created = BehaviourIncident.objects.get_or_create(
                    student=student, date=date, category=category,
                    defaults={
                        'description': BEHAVIOUR_DESCRIPTIONS[category],
                        'severity': severity,
                        'logged_by': self._logged_by_for(student),
                    },
                )
                if was_created:
                    created += 1
        return created

    def _seed_exclusions(self, students, current_year, today):
        # Rarer still - only a handful of students across the whole seeded
        # set have ever been excluded, placed a quarter of the way into the
        # current academic year.
        created = 0
        year_start = current_year.start_date
        span_days = (min(today, current_year.end_date) - year_start).days or 1
        for student in students:
            if student.id % 25 != 0:
                continue
            start_date = year_start + datetime.timedelta(days=round(span_days / 4))
            _, was_created = Exclusion.objects.get_or_create(
                student=student, start_date=start_date,
                defaults={
                    'end_date': start_date + datetime.timedelta(days=2),
                    'type': 'fixed_term',
                    'reason': 'Fixed-term exclusion following a serious behaviour incident.',
                },
            )
            if was_created:
                created += 1
        return created

    def _seed_positive_behaviour(self, students, current_year, today):
        # More common than behaviour incidents (real-world merit logging
        # tends to run more freely than sanctions) - every 4th student gets
        # 8, spread evenly across the current academic year like Behaviour.
        created = 0
        categories = [c for c, _ in PositiveBehaviourIncident.CATEGORY_CHOICES]
        target = 8
        year_start = current_year.start_date
        span_days = (min(today, current_year.end_date) - year_start).days or 1
        for student in students:
            if student.id % 4 != 0:
                continue
            existing = student.positive_behaviour_incidents.count()
            for slot in range(existing, target):
                category = categories[(student.id + slot) % len(categories)]
                offset = round((slot + 1) / (target + 1) * span_days)
                date = year_start + datetime.timedelta(days=offset)
                points = [1, 2, 3][(student.id + slot) % 3]
                _, was_created = PositiveBehaviourIncident.objects.get_or_create(
                    student=student, date=date, category=category,
                    defaults={
                        'description': POSITIVE_BEHAVIOUR_DESCRIPTIONS[category],
                        'points': points,
                        'logged_by': self._logged_by_for(student),
                    },
                )
                if was_created:
                    created += 1
        return created
