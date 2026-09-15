"""Every hub landing page renders, and carries the sidebar's two keys.

`templates/hubs/_hub_sidebar.html` reads `hub_title` and `local_menu` and
nothing enforces that a view supplies either: forget one and the sidebar
renders a blank title over an empty list, with no error and no warning. That
unenforced interface is exactly what six copied `_hub_context()` helpers, plus
two hubs that diverged from them, were satisfying by hand (#192).

So the contract is asserted here once, for every hub at once, rather than as
eight near-identical smoke tests in eight apps. The module-gating case is the
regression guard specifically: Careers never called `filter_by_module` at all
and Portal Admin froze its context at import, so neither could have honoured a
hidden module - and no test would have noticed.
"""

from django.test import RequestFactory, TestCase
from django.urls import reverse

from core.hub_context import hub_context
from core.models import Module, Staff

# Landing page per hub, by URL name. Portal Admin is absent deliberately - it
# redirects anyone who isn't a developer, so it gets its own test below.
HUB_LANDING_ROUTES = [
    'staff_hub',
    'student_hub',
    'services',
    'registers',
    'resources_hub',
    'inclusion_hub',
    'careers_hub',
]

rf = RequestFactory()


class HubLandingPageTest(TestCase):
    def test_every_hub_landing_page_renders(self):
        for name in HUB_LANDING_ROUTES:
            with self.subTest(route=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, 200)

    def test_every_hub_landing_page_supplies_the_sidebar_keys(self):
        for name in HUB_LANDING_ROUTES:
            with self.subTest(route=name):
                context = self.client.get(reverse(name)).context
                self.assertTrue(context['hub_title'])
                self.assertIsNotNone(context['local_menu'])


class PortalAdminLandingPageTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.developer = Staff.objects.create(
            staff_code='DEV001', first_name='Dev', last_name='Eloper', is_developer=True,
        )

    def test_the_developer_console_renders_for_a_developer(self):
        self.client.cookies['current_staff_id'] = str(self.developer.pk)
        response = self.client.get(reverse('portaladmin_home'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context['hub_title'], 'Portal Admin')
        self.assertEqual(len(response.context['local_menu']), 2)


class HubContextTest(TestCase):
    """The helper itself: gating, and what a caller may add on top."""

    MENU = [
        {'name': 'Kept', 'url': '/a/', 'icon': 'a.svg', 'module_key': 'kept'},
        {'name': 'Hidden', 'url': '/b/', 'icon': 'b.svg', 'module_key': 'hidden'},
        {'name': 'Unkeyed', 'url': '/c/', 'icon': 'c.svg'},
    ]

    def test_a_hidden_module_is_dropped_and_an_unkeyed_entry_is_kept(self):
        Module.objects.create(key='kept', name='Kept', status=Module.STATUS_LIVE)
        Module.objects.create(key='hidden', name='Hidden', status=Module.STATUS_HIDDEN)
        context = hub_context(rf.get('/'), self.MENU, 'Demo')
        self.assertEqual([item['name'] for item in context['local_menu']], ['Kept', 'Unkeyed'])
        self.assertEqual(context['hub_title'], 'Demo')

    def test_extra_keys_ride_alongside_the_two_required_ones(self):
        context = hub_context(
            rf.get('/'), [], 'Demo', back_to_hub_url='/inclusion/',
        )
        self.assertEqual(context['back_to_hub_url'], '/inclusion/')
