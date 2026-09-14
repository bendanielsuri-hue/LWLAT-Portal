"""`terms_for_school`: the calendar's own tiered resolution, and its blast radius.

`core.term_dates` says it is "the same tiered resolution as
core.portal_settings", and in one important respect it is not: portal settings
fall through **per field**, so a school that overrides one setting still
inherits the other six. A term calendar falls through **per school, all or
nothing** — one seeded `Term` row takes the school off the MAT-wide calendar
entirely, including for the terms it did not override.

That is the right shape for a calendar (a half-overridden year would produce
overlapping terms), but it is the opposite of the sibling it cites, so the
all-or-nothing boundary is pinned here. Every other helper in the module reads
its rows through this one function, so the boundary applies to all of them; the
last class checks that it actually does rather than assuming it.
"""

import datetime

from django.test import TestCase

from core.models import AcademicYear, School, Term
from core.term_dates import (
    next_autumn_term, next_half_term, next_term, remaining_terms_in_year,
    terms_for_school, upcoming_review_terms,
)


def d(year, month, day):
    return datetime.date(year, month, day)


class TieredResolutionTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.year = AcademicYear.objects.create(start_date=d(2025, 9, 1), end_date=d(2026, 8, 31))
        cls.school = School.objects.create(name='Heatherbrook', category='Primary')
        cls.other = School.objects.create(name='Babington', category='Secondary')
        cls.mat_autumn = Term.objects.create(
            academic_year=cls.year, name=Term.TERM_AUTUMN,
            start_date=d(2025, 9, 1), end_date=d(2025, 12, 19), school=None,
        )
        cls.mat_spring = Term.objects.create(
            academic_year=cls.year, name=Term.TERM_SPRING,
            start_date=d(2026, 1, 5), end_date=d(2026, 3, 27), school=None,
        )

    def test_a_school_with_no_rows_of_its_own_gets_the_mat_wide_calendar(self):
        self.assertEqual(
            set(terms_for_school(self.school)), {self.mat_autumn, self.mat_spring},
        )

    def test_no_school_at_all_gets_the_mat_wide_calendar(self):
        self.assertEqual(set(terms_for_school(None)), {self.mat_autumn, self.mat_spring})

    def test_a_school_with_its_own_rows_gets_only_those(self):
        own = Term.objects.create(
            academic_year=self.year, name=Term.TERM_AUTUMN,
            start_date=d(2025, 9, 3), end_date=d(2025, 12, 18), school=self.school,
        )
        self.assertEqual(list(terms_for_school(self.school)), [own])

    def test_one_overriding_row_takes_the_school_off_the_mat_calendar_entirely(self):
        # The difference from core.portal_settings' per-field fallthrough: the
        # school overrides Autumn only, and loses the MAT-wide Spring with it.
        Term.objects.create(
            academic_year=self.year, name=Term.TERM_AUTUMN,
            start_date=d(2025, 9, 3), end_date=d(2025, 12, 18), school=self.school,
        )
        self.assertNotIn(self.mat_spring, terms_for_school(self.school))

    def test_one_school_s_override_does_not_reach_another_school(self):
        Term.objects.create(
            academic_year=self.year, name=Term.TERM_AUTUMN,
            start_date=d(2025, 9, 3), end_date=d(2025, 12, 18), school=self.school,
        )
        self.assertEqual(set(terms_for_school(self.other)), {self.mat_autumn, self.mat_spring})

    def test_a_school_s_own_rows_never_include_the_mat_wide_ones(self):
        # The "and also the MAT-wide ones" failure mode: overlapping terms,
        # each a plausible answer to next_term(), picked by ordering luck.
        Term.objects.create(
            academic_year=self.year, name=Term.TERM_SPRING,
            start_date=d(2026, 1, 6), end_date=d(2026, 3, 26), school=self.school,
        )
        self.assertEqual(
            [t.school_id for t in terms_for_school(self.school)], [self.school.pk],
        )


class DerivedHelpersRespectTheTierTest(TestCase):
    """Every helper reads its rows through terms_for_school, so all of them tier."""

    @classmethod
    def setUpTestData(cls):
        cls.year = AcademicYear.objects.create(start_date=d(2025, 9, 1), end_date=d(2026, 8, 31))
        cls.next_year = AcademicYear.objects.create(
            start_date=d(2026, 9, 1), end_date=d(2027, 8, 31),
        )
        cls.school = School.objects.create(name='Heatherbrook', category='Primary')
        for name, start, end, half in (
            (Term.TERM_AUTUMN, d(2025, 9, 1), d(2025, 12, 19), d(2025, 10, 27)),
            (Term.TERM_SPRING, d(2026, 1, 5), d(2026, 3, 27), d(2026, 2, 16)),
            (Term.TERM_SUMMER, d(2026, 4, 13), d(2026, 7, 17), d(2026, 5, 25)),
        ):
            Term.objects.create(
                academic_year=cls.year, name=name, start_date=start, end_date=end,
                half_term_start=half, school=None,
            )
        Term.objects.create(
            academic_year=cls.next_year, name=Term.TERM_AUTUMN,
            start_date=d(2026, 9, 1), end_date=d(2026, 12, 18), school=None,
        )

    def override_autumn(self):
        # A single school row, deliberately a week later than the MAT's, so
        # every helper below gives a visibly different answer if it tiers.
        return Term.objects.create(
            academic_year=self.year, name=Term.TERM_AUTUMN,
            start_date=d(2025, 9, 8), end_date=d(2025, 12, 19),
            half_term_start=d(2025, 11, 3), school=self.school,
        )

    def test_next_half_term_reads_the_school_s_own_calendar(self):
        self.assertEqual(next_half_term(self.school, d(2025, 10, 1)), d(2025, 10, 27))
        self.override_autumn()
        self.assertEqual(next_half_term(self.school, d(2025, 10, 1)), d(2025, 11, 3))

    def test_next_term_reads_the_school_s_own_calendar(self):
        self.assertEqual(next_term(self.school, d(2025, 12, 20)), d(2026, 1, 5))
        self.override_autumn()
        # Off the MAT calendar entirely, so there is no Spring row left to find.
        self.assertIsNone(next_term(self.school, d(2025, 12, 20)))

    def test_remaining_terms_lists_the_rest_of_the_year_not_just_the_next_one(self):
        remaining = remaining_terms_in_year(self.school, d(2025, 10, 1))
        self.assertEqual([t.name for t in remaining], [Term.TERM_SPRING, Term.TERM_SUMMER])

    def test_next_autumn_term_rolls_into_the_following_academic_year(self):
        term = next_autumn_term(self.school, d(2026, 6, 1))
        self.assertEqual(term.academic_year, self.next_year)

    def test_the_review_picker_falls_back_to_the_rollover_only_when_empty(self):
        this_year = upcoming_review_terms(self.school, d(2025, 10, 1))
        self.assertEqual(
            [(t.name, rollover) for t, rollover in this_year],
            [(Term.TERM_SPRING, False), (Term.TERM_SUMMER, False)],
        )
        rolled = upcoming_review_terms(self.school, d(2026, 6, 1))
        self.assertEqual([(t.academic_year, r) for t, r in rolled], [(self.next_year, True)])
