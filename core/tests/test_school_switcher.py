"""One selected school, one representation of it.

The switcher used to be stored twice - a cookie holding a key ('all',
'primary', 'secondary' or a School.id) that the server reads, and a
localStorage copy holding the school's *display name* that the Panel Groups
picker read. Nothing could reconcile the two (a rename desynchronised them
permanently), and a browser with one but not the other scoped its rows to one
school and its picker to another with no error. #196 deleted the copy, so
these tests are about the surviving key: that a cookie nobody validates can't
break the page, and that the key, the label beside it and the data agree in
every state the cookie can be in.
"""

from django.test import RequestFactory, SimpleTestCase, TestCase

from core.identity import current_school_key, student_queryset_for_school_key
from core.models import School, Student
from core.school_scope import SchoolScope, canonical_key

rf = RequestFactory()


def request_with_cookie(value=None):
    request = rf.get('/')
    if value is not None:
        request.COOKIES['current_school_key'] = value
    return request


class CanonicalKeyTest(SimpleTestCase):
    def test_the_key_space_passes_through_untouched(self):
        for key in (None, '', 'all', 'primary', 'secondary', '7'):
            self.assertEqual(canonical_key(key), key, key)

    def test_a_value_outside_the_key_space_reads_as_no_school_chosen(self):
        # The regression #196 names: `current_school_key=nonexistent` reached
        # Q(school_id='nonexistent') and raised ValueError out of the sidebar's
        # own context processor, 500ing every page until the cookie was found.
        for key in ('nonexistent', '3; DROP TABLE', '7a', '-1'):
            self.assertEqual(canonical_key(key), 'all', key)

    def test_whitespace_reads_as_no_selection(self):
        self.assertTrue(SchoolScope(' ').selects_every_school)

    def test_a_key_outside_the_key_space_narrows_nothing_instead_of_raising(self):
        scope = SchoolScope('nonexistent')
        self.assertTrue(scope.selects_every_school)
        self.assertTrue(scope.is_aggregate)
        self.assertIsNone(scope.school_id)

    def test_an_integer_id_is_accepted_as_well_as_its_string(self):
        self.assertEqual(SchoolScope(7).school_id, '7')


class CookieResolutionTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.school = School.objects.create(name='Heatherbrook', category='Primary')
        cls.closed = School.objects.create(name='Closed Academy', category='Secondary', is_active=False)

    def test_no_cookie_means_every_school(self):
        self.assertEqual(current_school_key(request_with_cookie()), 'all')
        self.assertEqual(current_school_key(request_with_cookie('')), 'all')

    def test_an_aggregate_cookie_is_kept(self):
        for key in ('all', 'primary', 'secondary'):
            self.assertEqual(current_school_key(request_with_cookie(key)), key)

    def test_a_live_school_id_is_kept(self):
        key = str(self.school.pk)
        self.assertEqual(current_school_key(request_with_cookie(key)), key)

    def test_an_id_for_a_school_that_no_longer_exists_falls_back(self):
        # Deleting a School leaves every browser that had it selected holding
        # a cookie pointing at nothing. Without this, the sidebar label said
        # "All Schools" (no nav entry matched, so the first one won) while the
        # data was filtered to a school id that matches no row - the exact
        # label/data disagreement this ticket is about, just server-side.
        stale = str(self.school.pk + 1000)
        self.assertEqual(current_school_key(request_with_cookie(stale)), 'all')

    def test_a_deactivated_school_falls_back_too(self):
        # is_active=False is how a school leaves the switcher (build_school_nav
        # filters on it), so a cookie naming one is stale in the same way.
        self.assertEqual(current_school_key(request_with_cookie(str(self.closed.pk))), 'all')

    def test_a_garbage_cookie_does_not_raise(self):
        request = request_with_cookie('nonexistent')
        self.assertEqual(current_school_key(request), 'all')
        self.assertEqual(student_queryset_for_school_key(current_school_key(request)).count(), 0)

    def test_the_answer_is_resolved_once_per_request(self):
        request = request_with_cookie(str(self.school.pk))
        with self.assertNumQueries(1):
            current_school_key(request)
            current_school_key(request)


class SidebarAgreementTest(TestCase):
    """The label the sidebar shows and the data the page is scoped to, together.

    One assertion per cookie state, because the failure mode is never "the
    page broke" - it is one of the two quietly describing a different school
    from the other.
    """

    @classmethod
    def setUpTestData(cls):
        cls.primary = School.objects.create(name='Heatherbrook', category='Primary')
        cls.secondary = School.objects.create(name='Babington Academy', category='Secondary')
        for index, school in enumerate((cls.primary, cls.secondary)):
            Student.objects.create(
                first_name='Ada', last_name=school.name, upn=f'U{index}',
                admission_number=f'U{index}', year_group=7, school=school,
            )

    def render(self, cookie=None):
        if cookie is not None:
            self.client.cookies['current_school_key'] = cookie
        # Any page carrying the sidebar will do; the Staff hub home is the
        # cheapest one that renders (MAT home has an unrelated missing-icon
        # template problem on main).
        response = self.client.get('/staff/')
        self.assertEqual(response.status_code, 200)
        return response

    def assert_agrees(self, cookie, expected_key, expected_label, expected_students):
        response = self.render(cookie)
        key = response.context['current_school_key']
        self.assertEqual(key, expected_key, cookie)
        self.assertEqual(response.context['current_school_label'], expected_label, cookie)
        self.assertEqual(
            sorted(student_queryset_for_school_key(key).values_list('last_name', flat=True)),
            expected_students,
            cookie,
        )
        # The label in the context is the one the sidebar actually renders.
        self.assertContains(response, expected_label)

    def test_absent_cookie(self):
        self.assert_agrees(None, 'all', 'All Schools', ['Babington Academy', 'Heatherbrook'])

    def test_aggregate_cookie(self):
        self.assert_agrees('all', 'all', 'All Schools', ['Babington Academy', 'Heatherbrook'])
        self.assert_agrees('primary', 'primary', 'All Primary', ['Heatherbrook'])
        self.assert_agrees('secondary', 'secondary', 'All Secondary', ['Babington Academy'])

    def test_a_concrete_school_cookie(self):
        self.assert_agrees(str(self.primary.pk), str(self.primary.pk), 'Heatherbrook', ['Heatherbrook'])

    def test_a_stale_id_shows_all_schools_rather_than_an_empty_page(self):
        self.assert_agrees('999999', 'all', 'All Schools', ['Babington Academy', 'Heatherbrook'])

    def test_a_garbage_cookie_renders_instead_of_500ing(self):
        self.assert_agrees('nonexistent', 'all', 'All Schools', ['Babington Academy', 'Heatherbrook'])
