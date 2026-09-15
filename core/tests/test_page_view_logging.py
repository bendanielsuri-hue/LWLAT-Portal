"""What PageViewLoggingMiddleware writes, and the four things it refuses to.

`PageView` is the raw material both the "Most Used Apps" tray and the home
cards' own ordering are computed from, so anything that pollutes it (an AJAX
poll counted as a navigation, a 404 counted as a page) silently skews a
ranking rather than breaking anything. The exclusions in
[ADR 0014](docs/adr/0014-page-view-logging-via-middleware.md) are the whole
reason the table stays a clean "which pages did a human navigate to" record,
so each one is asserted rather than left to a code reading.
"""

from django.test import TestCase
from django.urls import reverse

from core.identity import CURRENT_STAFF_COOKIE
from core.models import PageView, Staff


class PageViewLoggingTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        # The fallback identity when no cookie is set (see CLAUDE.md), so the
        # middleware has someone to attribute a view to in every case below.
        cls.default_staff = Staff.objects.create(
            staff_code='BS001', first_name='Benjamin', last_name='Suri',
        )
        cls.other = Staff.objects.create(
            staff_code='S2', first_name='Alan', last_name='Turing',
        )

    def logged(self):
        return list(PageView.objects.values_list('staff_id', 'url_name'))

    def test_a_page_load_is_logged_against_the_current_identity(self):
        self.client.get(reverse('staff_hub'))
        self.assertEqual(self.logged(), [(self.default_staff.pk, 'staff_hub')])

    def test_the_identity_cookie_decides_who_the_view_belongs_to(self):
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(self.other.pk)
        self.client.get(reverse('staff_hub'))
        self.assertEqual(self.logged(), [(self.other.pk, 'staff_hub')])

    def test_an_ajax_request_is_not_a_navigation(self):
        self.client.get(reverse('staff_hub'), headers={'x-requested-with': 'XMLHttpRequest'})
        self.assertEqual(self.logged(), [])

    def test_a_post_is_not_a_navigation(self):
        self.client.post(reverse('report_problem'), {})
        self.assertEqual(self.logged(), [])

    def test_a_non_200_response_is_not_a_navigation(self):
        self.client.get('/no-such-page-exists/')
        self.assertEqual(self.logged(), [])

    def test_the_developer_console_is_never_logged(self):
        # /portal-admin/ and /admin/ are dev/admin tooling, not staff apps —
        # a developer's own console traffic must not colour the tray.
        self.client.get('/portal-admin/')
        self.assertEqual(self.logged(), [])

    def test_a_request_that_resolves_to_no_url_name_is_not_logged(self):
        # How static/media traffic is excluded: no resolver_match.url_name,
        # no row. There is no explicit /static/ prefix check to keep in sync.
        self.client.get('/static/css/style.css')
        self.assertEqual(self.logged(), [])

    def test_with_no_staff_seeded_at_all_nothing_is_logged(self):
        Staff.objects.all().delete()
        self.client.get(reverse('staff_hub'))
        self.assertEqual(self.logged(), [])

    def test_every_page_load_is_its_own_row(self):
        # Opens are counted, not deduplicated — the ranking is by row count.
        self.client.get(reverse('staff_hub'))
        self.client.get(reverse('staff_hub'))
        self.assertEqual(PageView.objects.count(), 2)
