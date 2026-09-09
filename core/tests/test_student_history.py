"""Derived student history.

The easiest module in the repo to test - every helper takes a student and
returns a value, no request involved - and until now the only one with no
tests at all.

The query-count test is the point of the file. These helpers are called inside
a per-student loop on the Students list page, so whether one uses `.count()`
or reads through a prefetch is the difference between 4 queries and 150 on a
50-row page. That is invisible in review and invisible in the rendered output;
it only shows up as a page that got slower, which is exactly the kind of
regression a test should hold.
"""

import datetime

from django.test import TestCase
from django.utils import timezone

from core import student_history as history
from core.models import (
    AttendanceDay,
    BehaviourIncident,
    Exclusion,
    PositiveBehaviourIncident,
    School,
    Student,
)


def make_student(upn='UPN1', **kwargs):
    kwargs.setdefault('admission_number', f'ADM{upn}')
    return Student.objects.create(
        upn=upn, first_name='Rosa', last_name='Parks', year_group=9, **kwargs
    )


class AttendanceTest(TestCase):
    def setUp(self):
        self.student = make_student()

    def add_days(self, specs):
        base = timezone.localdate() - datetime.timedelta(days=30)
        for i, (am, pm) in enumerate(specs):
            AttendanceDay.objects.create(
                student=self.student, date=base + datetime.timedelta(days=i),
                am_status=am, pm_status=pm,
            )

    def test_percentage_counts_am_and_pm_as_separate_sessions(self):
        # 2 days = 4 sessions; 3 present = 75%.
        self.add_days([('present', 'present'), ('present', 'absent_authorised')])
        self.assertEqual(history.attendance_percentage(self.student), 75.0)
        self.assertEqual(history.attendance_sessions_possible(self.student), 4)

    def test_no_attendance_recorded_is_none_everywhere_not_zero(self):
        # "Nothing recorded" and "recorded, and it was zero" are different
        # facts. These three used to disagree: one returned None, the other two
        # returned 0 for the same condition.
        self.assertIsNone(history.attendance_percentage(self.student))
        self.assertIsNone(history.attendance_authorised_pct(self.student))
        self.assertIsNone(history.attendance_unauthorised_pct(self.student))

    def test_authorised_and_unauthorised_split(self):
        self.add_days([
            ('present', 'present'),
            ('absent_authorised', 'absent_unauthorised'),
        ])
        self.assertEqual(history.attendance_authorised_pct(self.student), 25.0)
        self.assertEqual(history.attendance_unauthorised_pct(self.student), 25.0)

    def test_the_three_percentages_are_a_partition(self):
        # The attendance ring stacks them as cumulative gradient stops, so they
        # have to sum to 100 or the ring shows a gap.
        self.add_days([
            ('present', 'present'),
            ('absent_authorised', 'absent_unauthorised'),
            ('present', 'absent_authorised'),
        ])
        total = (
            history.attendance_percentage(self.student)
            + history.attendance_authorised_pct(self.student)
            + history.attendance_unauthorised_pct(self.student)
        )
        self.assertEqual(total, 100.0)


class BehaviourTest(TestCase):
    def setUp(self):
        self.student = make_student()

    def add_incident(self, severity='low'):
        BehaviourIncident.objects.create(
            student=self.student, date=timezone.localdate(),
            category='disruption', severity=severity,
        )

    def test_summary_pluralises(self):
        self.assertEqual(history.behaviour_summary(self.student), 'No incidents logged')
        self.add_incident()
        self.assertEqual(history.behaviour_summary(self.student), '1 incident logged')
        self.add_incident()
        self.assertEqual(history.behaviour_summary(self.student), '2 incidents logged')

    def test_severity_percentages_are_of_the_total_not_of_possible_sessions(self):
        self.add_incident('low')
        self.add_incident('high')
        pct = history.behaviour_severity_pct(self.student)
        self.assertEqual(pct['low'], 50.0)
        self.assertEqual(pct['high'], 50.0)
        self.assertEqual(pct['medium'], 0)

    def test_positive_summary_mirrors_the_negative_one(self):
        self.assertEqual(history.positive_behaviour_summary(self.student), 'No positive logged')
        PositiveBehaviourIncident.objects.create(
            student=self.student, date=timezone.localdate(), category='effort', points=3,
        )
        self.assertEqual(history.positive_behaviour_summary(self.student), '1 positive logged')
        self.assertEqual(history.positive_behaviour_points(self.student), 3)


class ExclusionTest(TestCase):
    def test_count_and_most_recent(self):
        student = make_student()
        self.assertEqual(history.exclusion_count(student), 0)
        Exclusion.objects.create(
            student=student, start_date=timezone.localdate(), type='fixed',
        )
        self.assertEqual(history.exclusion_count(student), 1)
        self.assertIsNotNone(history.exclusion_most_recent(student))


class PrefetchTest(TestCase):
    """The N+1 guard.

    Every helper here counts through the prefetch cache rather than issuing its
    own .count(), so the whole per-student summary block costs a fixed number
    of queries no matter how many students are on the page.
    """

    @classmethod
    def setUpTestData(cls):
        school = School.objects.create(name='Test Academy', category='Secondary')
        for i in range(5):
            student = make_student(upn=f'UPN{i}', school=school)
            AttendanceDay.objects.create(
                student=student, date=timezone.localdate(), am_status='present', pm_status='present',
            )
            BehaviourIncident.objects.create(
                student=student, date=timezone.localdate(), category='disruption', severity='low',
            )
            PositiveBehaviourIncident.objects.create(
                student=student, date=timezone.localdate(), category='effort', points=2,
            )
            Exclusion.objects.create(
                student=student, start_date=timezone.localdate(), type='fixed',
            )

    def test_the_summary_block_is_a_fixed_number_of_queries(self):
        students = history.prefetch_history(Student.objects.all())
        # 1 for the students + 1 per prefetched relation. Crucially this does
        # NOT grow with the number of students: before, attendance sessions,
        # the behaviour count and the positive count were each their own query
        # per row, so five students cost fifteen extra.
        with self.assertNumQueries(1 + len(history.HISTORY_RELATIONS)):
            for student in students:
                history.attendance_percentage(student)
                history.attendance_authorised_pct(student)
                history.attendance_unauthorised_pct(student)
                history.behaviour_summary(student)
                history.positive_behaviour_summary(student)
                history.exclusion_count(student)

    def test_prefetch_history_covers_every_relation_the_helpers_read(self):
        # If a new helper reads a relation missing from HISTORY_RELATIONS, the
        # query-count test above starts failing rather than the page quietly
        # getting slower.
        self.assertEqual(
            set(history.HISTORY_RELATIONS),
            {'attendance_days', 'behaviour_incidents', 'positive_behaviour_incidents', 'exclusions'},
        )
