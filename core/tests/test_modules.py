"""The module visibility cascade, rule by rule.

[ADR 0002](docs/adr/0002-module-visibility-cascade-rules.md) records two
deliberate-rather-than-obvious rules: `hidden` cascades down the parent chain
regardless of a child's own stored status, and `pilot` resolves visible only
for one of the module's named `pilot_schools` — never for the `all`/`primary`/
`secondary` aggregate views. Both fail silently when wrong: a cascade that
stops one level early leaves an unreleased page on the nav, and a pilot leaking
into an aggregate view exposes it to every school outside the pilot. Nothing
crashes either way, so each rule gets its own named test here.

The third class covers the missing-row default (#194 item 3): with no seeded
`Module` row the filter warns once and shows the item. That is biased toward
over-exposure on purpose — loud failure beats silently hiding a released page —
so it is asserted deliberately rather than left to be rediscovered as a bug.
"""

import logging

from django.test import RequestFactory, TestCase

from core import modules as modules_mod
from core.identity import CURRENT_SCHOOL_COOKIE
from core.models import Module, School
from core.modules import (
    VIEW_FULL_SYSTEM_COOKIE, filter_by_module, is_module_visible, module_label, module_map,
)

rf = RequestFactory()


def request_for(school_key=None, full_system=False):
    request = rf.get('/')
    if school_key is not None:
        request.COOKIES[CURRENT_SCHOOL_COOKIE] = school_key
    if full_system:
        request.COOKIES[VIEW_FULL_SYSTEM_COOKIE] = '1'
    return request


class CascadeTest(TestCase):
    """ADR 0002 rule 1: hidden cascades to children; nothing else does."""

    @classmethod
    def setUpTestData(cls):
        cls.hub = Module.objects.create(key='hub', name='Hub', status=Module.STATUS_LIVE)
        cls.leaf = Module.objects.create(
            key='leaf', name='Leaf', parent=cls.hub, status=Module.STATUS_LIVE,
        )
        cls.grandchild = Module.objects.create(
            key='grandchild', name='Grandchild', parent=cls.leaf, status=Module.STATUS_LIVE,
        )

    def visible(self, key, request=None):
        return is_module_visible(key, module_map(), request or request_for())

    def test_a_live_leaf_under_a_live_hub_is_visible(self):
        self.assertTrue(self.visible('leaf'))

    def test_a_hidden_parent_hides_a_live_child(self):
        # The rule releasing a hub depends on: one flip of the parent, not a
        # sweep of every child's own status.
        self.hub.status = Module.STATUS_HIDDEN
        self.hub.save()
        self.assertFalse(self.visible('leaf'))

    def test_a_hidden_parent_hides_a_live_grandchild(self):
        # The "stops one level too early" failure: the cascade walks the whole
        # parent chain, not just the immediate parent.
        self.hub.status = Module.STATUS_HIDDEN
        self.hub.save()
        self.assertFalse(self.visible('grandchild'))

    def test_a_hidden_child_under_a_live_parent_hides_only_the_child(self):
        self.leaf.status = Module.STATUS_HIDDEN
        self.leaf.save()
        self.assertFalse(self.visible('leaf'))
        self.assertTrue(self.visible('hub'))

    def test_a_hidden_child_does_not_hide_its_own_live_child(self):
        # Hidden cascades DOWN only. A hidden middle node still hides its
        # descendants (asserted below); a hidden node never hides an ancestor.
        self.leaf.status = Module.STATUS_HIDDEN
        self.leaf.save()
        self.assertFalse(self.visible('grandchild'))
        self.assertTrue(self.visible('hub'))

    def test_a_hidden_module_is_not_visible_on_its_own_account(self):
        self.hub.status = Module.STATUS_HIDDEN
        self.hub.save()
        self.assertFalse(self.visible('hub'))

    def test_a_live_child_of_a_pilot_parent_is_still_live(self):
        # Only `hidden` cascades. A `pilot` parent gates itself, not its
        # children — ADR 0002's rejected "independent status, no cascade"
        # option was rejected only for `hidden`.
        self.hub.status = Module.STATUS_PILOT
        self.hub.save()
        self.assertTrue(self.visible('leaf'))


class PilotTest(TestCase):
    """ADR 0002 rule 2: pilot needs one concrete, named pilot school."""

    @classmethod
    def setUpTestData(cls):
        cls.in_pilot = School.objects.create(name='Heatherbrook', category='Primary')
        cls.out_of_pilot = School.objects.create(name='Babington', category='Secondary')
        cls.module = Module.objects.create(
            key='pilot_page', name='Pilot Page', status=Module.STATUS_PILOT,
        )
        cls.module.pilot_schools.add(cls.in_pilot)

    def visible(self, school_key):
        return is_module_visible('pilot_page', module_map(), request_for(school_key))

    def test_a_pilot_school_sees_a_pilot_module(self):
        self.assertTrue(self.visible(str(self.in_pilot.pk)))

    def test_a_school_outside_the_pilot_does_not(self):
        self.assertFalse(self.visible(str(self.out_of_pilot.pk)))

    def test_no_aggregate_key_ever_resolves_a_pilot_module_as_visible(self):
        # ADR 0002's second rejected option: "visible in aggregate views if any
        # pilot school is in scope". `primary` is the pointed case — the pilot
        # school IS a Primary, and it still must not show, because the Primary
        # view is shared with Primaries outside the pilot.
        for key in ('all', 'primary', 'secondary'):
            self.assertFalse(self.visible(key), key)

    def test_no_school_cookie_at_all_behaves_as_an_aggregate(self):
        # current_school_key() defaults to 'all', so an un-switched sidebar
        # must not be a hole in the rule.
        self.assertFalse(is_module_visible('pilot_page', module_map(), rf.get('/')))

    def test_a_pilot_module_with_no_pilot_schools_is_visible_nowhere(self):
        self.module.pilot_schools.clear()
        self.assertFalse(self.visible(str(self.in_pilot.pk)))
        self.assertFalse(self.visible('all'))

    def test_a_hidden_parent_still_beats_a_pilot_school(self):
        # The two rules compose: the cascade is evaluated before the pilot
        # membership check, so a hidden hub hides a pilot page even from a
        # school in its pilot.
        parent = Module.objects.create(key='hub', name='Hub', status=Module.STATUS_HIDDEN)
        self.module.parent = parent
        self.module.save()
        self.assertFalse(self.visible(str(self.in_pilot.pk)))


class MissingRowTest(TestCase):
    """#194 item 3: no Module row means warn once, then show."""

    def setUp(self):
        # The warned-key set is process-global on purpose (one line per stale
        # key per process, not per render) — so a test that asserts the warning
        # has to start from a clean one.
        modules_mod._warned_missing_keys.clear()

    def test_an_unseeded_key_defaults_to_visible(self):
        self.assertTrue(is_module_visible('never_seeded', module_map(), request_for()))

    def test_an_unseeded_key_warns(self):
        with self.assertLogs('core.modules', level=logging.WARNING) as logged:
            is_module_visible('never_seeded', module_map(), request_for())
        self.assertIn('never_seeded', logged.output[0])

    def test_the_warning_fires_once_per_key_per_process(self):
        with self.assertLogs('core.modules', level=logging.WARNING) as logged:
            is_module_visible('never_seeded', module_map(), request_for())
            is_module_visible('never_seeded', module_map(), request_for())
            is_module_visible('also_missing', module_map(), request_for())
        self.assertEqual(len(logged.output), 2)

    def test_an_untagged_item_is_visible_without_warning(self):
        # module_key=None is "this item is not gated", not "this item is
        # stale" — it must not spend a warning.
        self.assertTrue(is_module_visible(None, module_map(), request_for()))
        self.assertEqual(modules_mod._warned_missing_keys, set())


class FullSystemToggleTest(TestCase):
    """The Settings "Show all modules" escape hatch bypasses the whole cascade."""

    @classmethod
    def setUpTestData(cls):
        Module.objects.create(key='hidden_page', name='Hidden', status=Module.STATUS_HIDDEN)
        Module.objects.create(key='pilot_page', name='Pilot', status=Module.STATUS_PILOT)

    def test_the_toggle_shows_hidden_and_pilot_modules(self):
        request = request_for(full_system=True)
        self.assertTrue(is_module_visible('hidden_page', module_map(), request))
        self.assertTrue(is_module_visible('pilot_page', module_map(), request))

    def test_any_other_cookie_value_is_not_the_toggle(self):
        for value in ('0', 'true', ''):
            request = rf.get('/')
            request.COOKIES[VIEW_FULL_SYSTEM_COOKIE] = value
            self.assertFalse(is_module_visible('hidden_page', module_map(), request), value)


class FilterAndLabelTest(TestCase):
    """The two callers' entry points over the same resolution."""

    @classmethod
    def setUpTestData(cls):
        Module.objects.create(key='live_page', name='Live', status=Module.STATUS_LIVE)
        Module.objects.create(key='hidden_page', name='Hidden', status=Module.STATUS_HIDDEN)

    def test_filter_by_module_drops_only_the_invisible_items(self):
        items = [
            {'module_key': 'live_page'},
            {'module_key': 'hidden_page'},
            {'module_key': None},
            {},
        ]
        kept = filter_by_module(items, module_map(), request_for())
        self.assertEqual(kept, [items[0], items[2], items[3]])

    def test_filter_by_module_honours_an_alternate_key_field(self):
        items = [{'key': 'live_page'}, {'key': 'hidden_page'}]
        kept = filter_by_module(items, module_map(), request_for(), key_field='key')
        self.assertEqual(kept, [items[0]])

    def test_a_seeded_name_overrides_the_hardcoded_label(self):
        self.assertEqual(module_label('live_page', module_map(), 'Fallback'), 'Live')

    def test_an_unseeded_or_untagged_item_keeps_its_hardcoded_label(self):
        self.assertEqual(module_label('never_seeded', module_map(), 'Fallback'), 'Fallback')
        self.assertEqual(module_label(None, module_map(), 'Fallback'), 'Fallback')
