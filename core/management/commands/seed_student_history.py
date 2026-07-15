import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import AttendanceDay, BehaviourIncident, Exclusion, Staff, Student

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


class Command(BaseCommand):
    help = (
        'Seeds AttendanceDay/BehaviourIncident/Exclusion history for every seeded '
        'Student (see docs/adr/0007-student-history-tables-not-summary-fields.md) - '
        'run after seed_dummy_data. Deterministic (student.id-keyed) and idempotent: '
        'AttendanceDay/Exclusion use get_or_create on their natural key; '
        'BehaviourIncident tops up to a target count per student rather than '
        're-creating rows each run.'
    )

    def handle(self, *args, **options):
        students = list(Student.objects.select_related('school', 'form_tutor').order_by('id'))
        today = timezone.localdate()

        attendance_created = self._seed_attendance(students, today)
        self.stdout.write(self.style.SUCCESS(f'AttendanceDay rows created: {attendance_created}.'))

        behaviour_created = self._seed_behaviour(students, today)
        self.stdout.write(self.style.SUCCESS(f'BehaviourIncident rows created: {behaviour_created}.'))

        exclusions_created = self._seed_exclusions(students, today)
        self.stdout.write(self.style.SUCCESS(f'Exclusion rows created: {exclusions_created}.'))

    def _school_weekdays_before(self, end_date, count):
        # Walks backwards from end_date (exclusive) skipping weekends, so a
        # rerun always targets the same calendar dates regardless of what
        # day it's actually run on.
        days = []
        d = end_date - datetime.timedelta(days=1)
        while len(days) < count:
            if d.weekday() < 5:
                days.append(d)
            d -= datetime.timedelta(days=1)
        return days

    def _seed_attendance(self, students, today):
        # Last 20 school days (~4 weeks) - enough for a percentage that
        # actually means something without seeding years of daily rows.
        school_days = self._school_weekdays_before(today, 20)
        created = 0
        for student in students:
            pattern = ATTENDANCE_PATTERNS[student.id % len(ATTENDANCE_PATTERNS)]
            for i, date in enumerate(school_days):
                status = pattern[i % len(pattern)]
                # AM/PM diverge slightly (offset by one slot) so a day isn't
                # always identically marked in both sessions.
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

    def _seed_behaviour(self, students, today):
        # Sparse by design - most students have no behaviour incidents at
        # all. Every 6th student gets 2, matching the "top up to a target
        # count" idempotency convention used by seed_referral_actions.
        created = 0
        categories = [c for c, _ in BehaviourIncident.CATEGORY_CHOICES]
        for student in students:
            if student.id % 6 != 0:
                continue
            existing = student.behaviour_incidents.count()
            for slot in range(existing, 2):
                category = categories[(student.id + slot) % len(categories)]
                date = today - datetime.timedelta(days=7 * (slot + 1))
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

    def _seed_exclusions(self, students, today):
        # Rarer still - only a handful of students across the whole seeded
        # set have ever been excluded.
        created = 0
        for student in students:
            if student.id % 25 != 0:
                continue
            start_date = today - datetime.timedelta(days=60)
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
