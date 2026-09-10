"""Home's section inventory agrees with the hubs that own it.

Home used to carry a second full copy of every leaf page - name and url written
out again - joined to each hub's own <HUB>_MENU only by the module_key string
convention, with nothing checking the two agreed. Renaming a page in its hub
menu would leave Home showing the old name, and neither a test nor a type
error would have said so.

Names and urls are now derived rather than restated, so these tests guard the
derivation instead: that every curated key resolves, and that the curation
itself (which keys, in what order) is still a deliberate list rather than
accidentally becoming "all of them".
"""

from django.test import TestCase
from django.urls import NoReverseMatch, reverse

from hubs.inclusion.views import INCLUSION_MENU
from hubs.registers.views import REGISTERS_MENU
from hubs.resources.views import RESOURCES_MENU
from hubs.services.views import SERVICES_MENU
from hubs.staff.views import STAFF_MENU
from hubs.student.views import STUDENT_MENU
from portal.views import HUB_NAV_ITEMS, _LEAF_BY_MODULE_KEY, _raw_sections

HUB_MENUS = {
    'staff_hub': STAFF_MENU,
    'student_hub': STUDENT_MENU,
    'inclusion_hub': INCLUSION_MENU,
    'registers': REGISTERS_MENU,
    'services': SERVICES_MENU,
    'resources_hub': RESOURCES_MENU,
}


class SectionInventoryTest(TestCase):
    def test_every_section_item_is_a_page_its_hub_declares(self):
        for section in _raw_sections():
            menu = HUB_MENUS.get(section['module_key'])
            if menu is None:
                continue  # Careers has no menu of its own yet.
            declared = {entry['module_key'] for entry in menu}
            for item in section['items']:
                with self.subTest(section=section['module_key'], item=item['module_key']):
                    self.assertIn(item['module_key'], declared)

    def test_item_names_come_from_the_owning_hub_menu(self):
        for section in _raw_sections():
            for item in section['items']:
                entry = _LEAF_BY_MODULE_KEY.get(item['module_key'])
                if entry is None:
                    continue
                with self.subTest(item=item['module_key']):
                    self.assertEqual(item['name'], entry['name'])

    def test_every_module_key_reverses_to_the_url_shown(self):
        # module_key matches a Django URL name by convention (core.models.Module).
        # _leaf() relies on that, so a key that stops reversing has to fail loudly.
        for section in _raw_sections():
            for item in section['items'] + [section]:
                key = item.get('module_key')
                url = item.get('url')
                with self.subTest(key=key):
                    try:
                        self.assertEqual(reverse(key), url)
                    except NoReverseMatch:
                        self.fail(f'module_key {key!r} does not reverse')

    def test_sections_follow_the_sidebar_rail_order(self):
        # One nav order for the whole app rather than two lists that drift.
        rail = [entry['module_key'] for entry in HUB_NAV_ITEMS]
        sections = [section['module_key'] for section in _raw_sections()]
        self.assertEqual(sections, rail)

    def test_the_item_lists_stay_curated_not_wholesale(self):
        # Home lists a hub's tools, so hub dashboards/reports are deliberately
        # left out. If someone "fixes" this by listing every menu entry, that's
        # a product decision and should fail here rather than pass silently.
        by_key = {s['module_key']: s for s in _raw_sections()}
        staff_items = {i['module_key'] for i in by_key['staff_hub']['items']}
        self.assertNotIn('staff_dashboard', staff_items)
        self.assertNotIn('staff_reports', staff_items)
        student_items = {i['module_key'] for i in by_key['student_hub']['items']}
        self.assertNotIn('student_dashboard', student_items)
