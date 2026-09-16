"""Update count + last-update date on action rows (#234).

"Has anyone actually tried?" has to be answerable from a list, so
annotate_action_update_info (views/shared.py) is what every action-row
surface reads instead of each hanging its own N+1 lookup off the row. These
pin the annotation's rules directly rather than asserting on rendered HTML
for every one of the five surfaces: a soft-deleted update counts toward
neither the count nor the date, and an action with none is left at zero/None
rather than something a template would have to special-case.
"""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from hubs.inclusion.panel.models import Action, ActionUpdate
from hubs.inclusion.panel.views.shared import annotate_action_update_info

from .factories import build_panel_world, make_action
from .support import PanelViewTestCase


class AnnotateActionUpdateInfoTest(PanelViewTestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.action = make_action(self.world.referral)

    def _annotated(self):
        return annotate_action_update_info(Action.objects.filter(pk=self.action.pk)).get()

    def test_an_action_with_no_updates_has_a_zero_count_and_no_date(self):
        annotated = self._annotated()
        self.assertEqual(annotated.update_count, 0)
        self.assertIsNone(annotated.last_update_at)

    def test_counts_and_dates_visible_updates_only(self):
        first = ActionUpdate.objects.create(action=self.action, body='Rang mum')
        ActionUpdate.objects.create(action=self.action, body='Rang dad')
        annotated = self._annotated()
        self.assertEqual(annotated.update_count, 2)
        self.assertEqual(annotated.last_update_at, ActionUpdate.objects.latest('created_at').created_at)
        self.assertGreaterEqual(annotated.last_update_at, first.created_at)

    def test_a_soft_deleted_update_counts_toward_neither_count_nor_date(self):
        kept = ActionUpdate.objects.create(action=self.action, body='Rang mum')
        ActionUpdate.objects.create(action=self.action, body='Retracted', deleted_at=timezone.now())
        annotated = self._annotated()
        self.assertEqual(annotated.update_count, 1)
        self.assertEqual(annotated.last_update_at, kept.created_at)


class ActionsListIndicatorTest(PanelViewTestCase):
    """The Actions list is the one surface with a per-page query budget
    (infinite scroll, #210) - this pins that the indicator doesn't cost it
    an extra query per row, and that it renders correctly either way."""

    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.action = make_action(self.world.referral)
        self.url = reverse('inclusion_panel_actions')

    def test_no_updates_renders_the_empty_dash_not_a_zero(self):
        response = self.client.get(self.url)
        self.assertContains(response, '—')
        self.assertNotContains(response, '>0 &middot;')

    def test_updates_render_count_and_last_update_date(self):
        ActionUpdate.objects.create(action=self.action, body='Rang mum')
        response = self.client.get(self.url)
        self.assertContains(response, '1 &middot; last')

    def test_actions_list_query_count_does_not_grow_with_row_count(self):
        # One action already exists (setUp) - the actual claim is that
        # adding more rows (each with its own updates) doesn't add more
        # queries, i.e. the count/date come from the list query's own
        # annotation rather than a per-row lookup.
        with CaptureQueriesContext(connection) as baseline:
            self.client.get(self.url)

        second = make_action(self.world.referral, description='Second action')
        ActionUpdate.objects.create(action=self.action, body='Rang mum')
        ActionUpdate.objects.create(action=second, body='Rang dad')
        with CaptureQueriesContext(connection) as with_more_rows:
            self.client.get(self.url)

        self.assertEqual(len(baseline.captured_queries), len(with_more_rows.captured_queries))
