"""One filter declaration, four derived behaviours.

The point of these is the *agreement* between narrowing, counting and
context. Any one of them working alone was never the problem; the four
drifting apart silently was.
"""

from django.test import RequestFactory, SimpleTestCase, TestCase

from core.dashboard_filters import Filter, FilterSet, equals, flag, tristate
from core.models import School, Student

rf = RequestFactory()


def bind(filter_set, **params):
    return filter_set.bind(rf.get('/', params))


class ReadingTest(SimpleTestCase):
    fs = FilterSet(Filter('year', equals('year_group')), Filter('house', equals('house')))

    def test_a_missing_parameter_reads_as_blank_not_none(self):
        self.assertEqual(bind(self.fs).values, {'year': '', 'house': ''})

    def test_values_are_always_strings(self):
        self.assertEqual(bind(self.fs, year='7')['year'], '7')

    def test_a_duplicate_name_is_refused_at_declaration(self):
        with self.assertRaises(AssertionError):
            FilterSet(Filter('year'), Filter('year'))


class ContextTest(SimpleTestCase):
    fs = FilterSet(
        Filter('year', equals('year_group')),
        Filter('panel_group', context_key='group_filter'),
        Filter('not_ready', active=lambda v: v == '1', context_value=lambda v: v == '1'),
    )

    def test_every_filter_gets_a_context_key_whether_set_or_not(self):
        # The silent failure this removes: a filter whose context key was
        # forgotten renders a control that resets itself on every reload.
        ctx = bind(self.fs).context
        self.assertEqual(set(ctx), {'year_filter', 'group_filter', 'not_ready_filter'})

    def test_the_key_follows_the_name_by_default(self):
        self.assertEqual(bind(self.fs, year='7').context['year_filter'], '7')

    def test_a_declared_key_wins_over_the_convention(self):
        ctx = bind(self.fs, panel_group='3').context
        self.assertEqual(ctx['group_filter'], '3')
        self.assertNotIn('panel_group_filter', ctx)

    def test_a_checkbox_reaches_the_template_as_a_bool(self):
        self.assertIs(bind(self.fs, not_ready='1').context['not_ready_filter'], True)
        self.assertIs(bind(self.fs).context['not_ready_filter'], False)


class CountingTest(SimpleTestCase):
    fs = FilterSet(
        Filter('name'),
        Filter('student', active=lambda v: v.isdigit(), counts=lambda v: False),
        Filter('year', equals('year_group')),
    )

    def test_nothing_set_is_a_count_of_zero(self):
        self.assertEqual(bind(self.fs).active_count, 0)

    def test_each_set_control_counts_once(self):
        self.assertEqual(bind(self.fs, name='a', year='7').active_count, 2)

    def test_a_filter_can_narrow_without_counting(self):
        # Preserves the Students/Referrals behaviour where a student pinned
        # by the picker leaves the badge alone.
        bound = bind(self.fs, student='42')
        self.assertEqual(bound.active_count, 0)
        self.assertEqual([f.name for f in bound.active], ['student'])

    def test_a_superseded_filter_still_counts(self):
        # The badge answers "how many controls has the user set", which is
        # not "how many are narrowing".
        fs = FilterSet(
            Filter('student', active=lambda v: v.isdigit()),
            Filter('name', superseded_by=('student',)),
        )
        bound = bind(fs, student='42', name='Rosa')
        self.assertEqual(bound.active_count, 2)
        self.assertEqual([f.name for f in bound.active], ['student'])


class NarrowingTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        school = School.objects.create(name='Heatherbrook', category='Primary')
        def make(first, upn, year, pp):
            return Student.objects.create(
                first_name=first, last_name='Test', upn=upn, admission_number=upn,
                year_group=year, is_pp=pp, school=school,
            )
        make('Rosa', 'A1', 7, True)
        make('Ada', 'A2', 8, False)
        make('Grace', 'A3', 7, False)

    fs = FilterSet(
        Filter('year', equals('year_group')),
        Filter('is_pp', tristate('is_pp')),
        Filter('flagged', flag('is_pp')),
    )

    def upns(self, **params):
        return set(
            bind(self.fs, **params).narrow(Student.objects.all())
            .values_list('upn', flat=True)
        )

    def test_no_filters_leaves_the_queryset_alone(self):
        self.assertEqual(self.upns(), {'A1', 'A2', 'A3'})

    def test_equals_narrows_on_the_declared_field(self):
        self.assertEqual(self.upns(year='7'), {'A1', 'A3'})

    def test_filters_combine(self):
        self.assertEqual(self.upns(year='7', is_pp='1'), {'A1'})

    def test_tristate_no_is_a_real_filter_not_an_absence(self):
        self.assertEqual(self.upns(is_pp='0'), {'A2', 'A3'})

    def test_tristate_blank_does_not_narrow(self):
        self.assertEqual(self.upns(is_pp=''), {'A1', 'A2', 'A3'})

    def test_a_checkbox_narrows_only_when_ticked(self):
        self.assertEqual(self.upns(flagged='1'), {'A1'})
        self.assertEqual(self.upns(flagged='0'), {'A1', 'A2', 'A3'})

    def test_a_superseded_filter_does_not_narrow(self):
        fs = FilterSet(
            Filter('upn', apply=lambda qs, v, vals: qs.filter(upn=v)),
            Filter('name', apply=lambda qs, v, vals: qs.filter(first_name=v),
                   superseded_by=('upn',)),
        )
        rows = fs.bind(rf.get('/', {'upn': 'A2', 'name': 'Rosa'})).narrow(Student.objects.all())
        self.assertEqual([s.upn for s in rows], ['A2'])


class SetValueTest(SimpleTestCase):
    fs = FilterSet(Filter('academic_year'), Filter('year', equals('year_group')))

    def test_a_corrected_value_reaches_both_the_count_and_the_context(self):
        # A dashboard drops an academic year that isn't in its own choices.
        # Both derived views must follow it, which is what a rebound local
        # variable could not guarantee.
        bound = bind(self.fs, academic_year='999', year='7')
        self.assertEqual(bound.active_count, 2)
        bound.set_value('academic_year', '')
        self.assertEqual(bound.active_count, 1)
        self.assertEqual(bound.context['academic_year_filter'], '')

    def test_correcting_an_unknown_filter_is_refused(self):
        with self.assertRaises(AssertionError):
            bind(self.fs).set_value('nope', '')
