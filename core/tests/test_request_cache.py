"""The nav ingredients are built once per request, not once per caller.

`core.modules.module_map` has documented "one query per request" as its intent
since it was written, and the context-processor wiring silently called it three
times on every render - along with `resolve_portal_settings` twice, Home's
`build_sections` twice and `current_staff` five times (#193). Nothing said so,
because a per-request invariant is invisible to a test that only checks
results.

These tests check the invariant itself. They are deliberately written as query
counts rather than as "the cache dict has one entry": the point is not that
`core.request_cache` is wired up, it's that a page render stops asking the
database the same question repeatedly, however the wiring gets rearranged.
"""

from django.db import connection
from django.test import RequestFactory, TestCase
from django.test.utils import CaptureQueriesContext

from core.identity import CURRENT_SCHOOL_COOKIE, current_staff
from core.models import Module, School, Staff
from core.modules import is_module_visible, module_map
from core.portal_settings import resolve_portal_settings


def selects_from(queries, table):
    # Exact table match: "core_module" and "core_module_pilot_schools" would
    # both match a substring test, and this file counts them separately.
    return [q for q in queries if f'FROM "{table}"' in q['sql']]


class RequestScopedNavTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Heatherbrook', category='Primary')
        self.other_school = School.objects.create(name='Babington', category='Secondary')
        self.staff = Staff.objects.create(
            first_name='Benjamin', last_name='Suri', staff_code='BSU', is_developer=True
        )
        self.hub = Module.objects.create(key='staff_hub', name='Staff', status=Module.STATUS_LIVE)
        self.leaf = Module.objects.create(
            key='staff_directory', name='Directory', parent=self.hub, status=Module.STATUS_LIVE
        )

    def request(self, school_key='all'):
        request = RequestFactory().get('/')
        request.COOKIES[CURRENT_SCHOOL_COOKIE] = school_key
        return request

    def test_a_page_render_reads_the_module_table_once(self):
        with CaptureQueriesContext(connection) as ctx:
            self.client.get('/')
        self.assertEqual(len(selects_from(ctx.captured_queries, 'core_module')), 1)

    def test_a_page_render_resolves_portal_settings_once(self):
        # Two rows back the cascade; MatSettings is the one always consulted.
        with CaptureQueriesContext(connection) as ctx:
            self.client.get('/')
        self.assertEqual(len(selects_from(ctx.captured_queries, 'core_matsettings')), 1)

    def test_repeat_callers_share_one_module_map(self):
        request = self.request()
        self.assertIs(module_map(request), module_map(request))

    def test_without_a_request_there_is_nothing_to_cache_on(self):
        # Management commands and helpers called outside a request cycle still
        # work - they just pay for each call, as they always did.
        self.assertIsNot(module_map(), module_map())

    def test_repeat_callers_share_one_resolved_settings_dict(self):
        request = self.request()
        self.assertIs(resolve_portal_settings(request), resolve_portal_settings(request))

    def test_current_staff_is_resolved_once_per_request(self):
        request = self.request()
        current_staff(request)
        with CaptureQueriesContext(connection) as ctx:
            again = current_staff(request)
        self.assertEqual(ctx.captured_queries, [])
        self.assertEqual(again.pk, self.staff.pk)

    def test_two_requests_do_not_share_a_cache(self):
        # The cache hangs off the request object, so it cannot outlive one.
        first, second = self.request(), self.request()
        self.assertIsNot(module_map(first), module_map(second))


class PilotVisibilityTest(TestCase):
    """The pilot check reads one index, however many times it is asked."""

    def setUp(self):
        self.school = School.objects.create(name='Heatherbrook', category='Primary')
        self.other_school = School.objects.create(name='Babington', category='Secondary')
        self.hub = Module.objects.create(key='staff_hub', name='Staff', status=Module.STATUS_PILOT)
        self.hub.pilot_schools.set([self.school])
        self.leaf = Module.objects.create(
            key='staff_directory', name='Directory', parent=self.hub, status=Module.STATUS_LIVE
        )

    def request(self, school_key):
        request = RequestFactory().get('/')
        request.COOKIES[CURRENT_SCHOOL_COOKIE] = school_key
        return request

    def test_pilot_module_is_visible_only_to_its_pilot_school(self):
        for key, expected in (
            (str(self.school.pk), True),
            (str(self.other_school.pk), False),
            ('all', False),        # No "is this piloting anywhere" aggregate.
            ('primary', False),    # Still an aggregate, even though it narrows.
        ):
            request = self.request(key)
            with self.subTest(school_key=key):
                self.assertIs(is_module_visible('staff_hub', module_map(request), request), expected)

    def test_hidden_still_cascades_to_a_live_child(self):
        # The parent-chain walk now reads ModuleMap.by_id instead of rebuilding
        # its own index per check - same answer, built once.
        self.hub.status = Module.STATUS_HIDDEN
        self.hub.save()
        request = self.request('all')
        self.assertFalse(is_module_visible('staff_directory', module_map(request), request))

    def test_repeat_checks_of_a_pilot_module_cost_one_query(self):
        request = self.request(str(self.school.pk))
        modules = module_map(request)
        with CaptureQueriesContext(connection) as ctx:
            for _ in range(20):
                is_module_visible('staff_hub', modules, request)
                is_module_visible('staff_directory', modules, request)
        self.assertEqual(len(selects_from(ctx.captured_queries, 'core_module_pilot_schools')), 1)

    def test_a_page_with_no_pilot_module_never_loads_the_pilot_index(self):
        self.hub.status = Module.STATUS_LIVE
        self.hub.save()
        request = self.request(str(self.school.pk))
        modules = module_map(request)
        with CaptureQueriesContext(connection) as ctx:
            is_module_visible('staff_hub', modules, request)
            is_module_visible('staff_directory', modules, request)
        self.assertEqual(ctx.captured_queries, [])
