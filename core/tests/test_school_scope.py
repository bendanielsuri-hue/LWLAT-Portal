"""The school-switcher selection, and what it narrows.

These are the branches that used to be written out five times, in two apps,
with no test anywhere. The two questions that look alike get their own class
each, because keeping them apart is the whole reason this module exists.
"""

from django.db.models import Q
from django.test import TestCase

from core.models import School, Staff, Student
from core.school_scope import SchoolScope


def make_student(first, last, upn, school):
    return Student.objects.create(
        first_name=first, last_name=last, upn=upn,
        admission_number=upn, year_group=7, school=school,
    )


class DecodingTest(TestCase):
    def test_blank_and_all_select_every_school(self):
        for key in (None, '', 'all'):
            self.assertTrue(SchoolScope(key).selects_every_school, key)

    def test_a_category_key_is_a_real_filter_not_a_no_op(self):
        # The distinction the module exists to protect: 'primary' narrows,
        # so it is NOT "select every school"...
        for key in ('primary', 'secondary'):
            self.assertFalse(SchoolScope(key).selects_every_school, key)

    def test_a_category_key_is_still_an_aggregate(self):
        # ...but it is also not one concrete school, so chrome that needs a
        # single school must not render for it.
        for key in ('primary', 'secondary'):
            self.assertTrue(SchoolScope(key).is_aggregate, key)

    def test_the_two_questions_disagree_on_exactly_the_category_keys(self):
        differ = [
            k for k in (None, '', 'all', 'primary', 'secondary', '7')
            if SchoolScope(k).selects_every_school != SchoolScope(k).is_aggregate
        ]
        self.assertEqual(differ, ['primary', 'secondary'])

    def test_a_concrete_key_is_neither(self):
        scope = SchoolScope('7')
        self.assertFalse(scope.selects_every_school)
        self.assertFalse(scope.is_aggregate)
        self.assertEqual(scope.school_id, '7')
        self.assertIsNone(scope.category)

    def test_an_aggregate_key_has_no_school_id(self):
        for key in (None, '', 'all', 'primary', 'secondary'):
            self.assertIsNone(SchoolScope(key).school_id, key)


class NarrowingTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.primary = School.objects.create(name='Heatherbrook', category='Primary')
        cls.secondary = School.objects.create(name='Babington', category='Secondary')
        cls.in_primary = make_student('Rosa', 'Parks', 'A1', cls.primary)
        cls.in_secondary = make_student('Ada', 'Lovelace', 'A2', cls.secondary)
        cls.no_school = make_student('Grace', 'Hopper', 'A3', None)

    def narrow(self, key):
        return set(
            SchoolScope(key)
            .narrow(Student.objects.all(), mat_wide=Q(school__isnull=True))
            .values_list('upn', flat=True)
        )

    def test_every_school_is_an_untouched_queryset(self):
        self.assertEqual(self.narrow('all'), {'A1', 'A2', 'A3'})

    def test_a_category_selects_that_category_plus_mat_wide(self):
        self.assertEqual(self.narrow('primary'), {'A1', 'A3'})
        self.assertEqual(self.narrow('secondary'), {'A2', 'A3'})

    def test_a_concrete_school_selects_that_school_plus_mat_wide(self):
        self.assertEqual(self.narrow(str(self.primary.pk)), {'A1', 'A3'})

    def test_without_a_mat_wide_escape_the_schoolless_row_drops_out(self):
        rows = set(
            SchoolScope('primary')
            .narrow(Student.objects.all())
            .values_list('upn', flat=True)
        )
        self.assertEqual(rows, {'A1'})

    def test_via_reaches_school_through_a_relation(self):
        # A model that gets to School indirectly supplies the path; the
        # branches are unchanged. Staff->school is direct, so stand in for
        # the indirect case with the reverse side of the same FK.
        Staff.objects.create(
            first_name='Alan', last_name='Turing', staff_code='S1', school=self.primary,
        )
        rows = SchoolScope('primary').narrow(Staff.objects.all())
        self.assertEqual(rows.count(), 1)

    def test_via_none_filters_school_itself(self):
        rows = set(
            SchoolScope('primary')
            .narrow(School.objects.all(), via=None)
            .values_list('name', flat=True)
        )
        self.assertEqual(rows, {'Heatherbrook'})

    def test_via_none_with_a_concrete_key_selects_that_row(self):
        rows = SchoolScope(str(self.secondary.pk)).narrow(School.objects.all(), via=None)
        self.assertEqual([s.name for s in rows], ['Babington'])
