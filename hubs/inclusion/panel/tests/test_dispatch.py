"""POSTing a form_action reaches its handler.

The vocabulary tests next door check that the three languages agree on the
*names*. These check the names are actually wired: a real POST goes in, and the
row it was supposed to change comes out changed.

Worth having on its own, but especially after moving 42 dispatch comparisons
from string literals to constants - a rename that silently stopped matching
would leave every page still rendering perfectly and every button doing
nothing.
"""

from django.urls import reverse

from hubs.inclusion.panel import form_actions

from .factories import build_panel_world
from .support import PanelViewTestCase


class MeetingSetupDispatchTest(PanelViewTestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=2)
        self.url = reverse('inclusion_panel_meeting_setup', args=[self.world.panel.pk])

    def test_update_priority_reaches_the_lifecycle(self):
        referral = self.world.referral
        self.assertEqual(referral.priority, '')
        self.client.post(self.url, {
            'form_action': form_actions.UPDATE_PRIORITY,
            'referral_id': referral.pk,
            'priority': 'high',
        })
        referral.refresh_from_db()
        self.assertEqual(referral.priority, 'high')

    def test_an_invalid_priority_is_rejected_not_stored(self):
        referral = self.world.referral
        self.client.post(self.url, {
            'form_action': form_actions.UPDATE_PRIORITY,
            'referral_id': referral.pk,
            'priority': 'catastrophic',
        })
        referral.refresh_from_db()
        self.assertEqual(referral.priority, '')

    def test_toggle_ready_flips_the_panel_between_draft_and_ready(self):
        panel = self.world.panel
        panel.status = 'draft'
        panel.save()
        self.client.post(self.url, {'form_action': form_actions.TOGGLE_READY})
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'ready')

        self.client.post(self.url, {'form_action': form_actions.TOGGLE_READY})
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'draft')

    def test_reorder_agenda_persists_the_new_order(self):
        first, second = self.world.panel_referrals
        self.client.post(self.url, {
            'form_action': form_actions.REORDER_AGENDA,
            'panel_referral_id': [second.pk, first.pk],
        })
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(second.agenda_order, 1)
        self.assertEqual(first.agenda_order, 2)

    def test_an_unknown_action_changes_nothing(self):
        panel = self.world.panel
        panel.status = 'draft'
        panel.save()
        self.client.post(self.url, {'form_action': 'not_a_real_action'})
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'draft')
