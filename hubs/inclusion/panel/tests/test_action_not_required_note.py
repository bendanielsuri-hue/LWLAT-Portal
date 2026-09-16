"""The optional "what happened?" note on the Not Required transition (#235).

Marking an action Not Required is the one status change nobody can
reconstruct later, so every status-change endpoint accepts an extra `note`
field and, when it's non-blank, files it as an ordinary Action Update -
otherwise the row is left exactly as any other status change leaves it.
These pin the shared behaviour (apply_action_status, views/shared.py) through
all three endpoints it backs, rather than one test per view guessing the
same thing three times.
"""

from django.urls import reverse

from hubs.inclusion.panel.models import ActionUpdate

from .factories import build_panel_world, make_action
from .support import PanelViewTestCase


class ApplyActionStatusEndpointsTest(PanelViewTestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.action = make_action(self.world.referral)

    def test_set_status_with_a_note_files_it_as_an_action_update(self):
        url = reverse('inclusion_panel_action_set_status', args=[self.action.id])
        self.client.post(url, {'status': 'not_needed', 'note': 'Family moved schools'})
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'not_needed')
        update = ActionUpdate.objects.get()
        self.assertEqual(update.action, self.action)
        self.assertEqual(update.body, 'Family moved schools')

    def test_set_status_without_a_note_applies_the_change_with_no_update(self):
        url = reverse('inclusion_panel_action_set_status', args=[self.action.id])
        self.client.post(url, {'status': 'not_needed'})
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'not_needed')
        self.assertFalse(ActionUpdate.objects.exists())

    def test_a_blank_note_is_not_stored(self):
        url = reverse('inclusion_panel_action_set_status', args=[self.action.id])
        self.client.post(url, {'status': 'not_needed', 'note': '   '})
        self.assertFalse(ActionUpdate.objects.exists())

    def test_inline_update_with_a_note_files_it_as_an_action_update(self):
        url = reverse('inclusion_panel_action_inline_update', args=[self.action.id])
        self.client.post(url, {
            'category': '', 'description': self.action.description, 'due_date': '',
            'status': 'not_needed', 'note': 'No longer needed',
        })
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'not_needed')
        self.assertEqual(ActionUpdate.objects.get().body, 'No longer needed')

    def test_inline_update_leaving_status_unchanged_ignores_a_stray_note(self):
        # Only a real transition should ever carry a note client-side, but
        # the endpoint itself doesn't need to special-case this - nothing
        # calls it with one when the status hasn't moved.
        url = reverse('inclusion_panel_action_inline_update', args=[self.action.id])
        self.client.post(url, {
            'category': '', 'description': self.action.description, 'due_date': '',
            'status': self.action.status,
        })
        self.assertFalse(ActionUpdate.objects.exists())

    def test_referral_details_status_update_with_a_note_files_it(self):
        url = reverse('inclusion_panel_action_status_update', args=[self.world.referral.id])
        self.client.post(url, {'action_id': self.action.id, 'status': 'not_needed', 'note': 'Escalated elsewhere'})
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'not_needed')
        self.assertEqual(ActionUpdate.objects.get().body, 'Escalated elsewhere')

    def test_marking_complete_never_creates_an_update_even_with_a_stray_note(self):
        # No surface ever shows the prompt outside the Not Required
        # transition, but a completed action is still fully valid either way
        # - nothing here depends on which status it was.
        url = reverse('inclusion_panel_action_set_status', args=[self.action.id])
        self.client.post(url, {'status': 'complete'})
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'complete')
        self.assertIsNotNone(self.action.completed_at)
        self.assertFalse(ActionUpdate.objects.exists())

    def test_update_author_is_the_current_staff_identity(self):
        from core.identity import CURRENT_STAFF_COOKIE
        ada = self.world.sendco
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(ada.id)
        url = reverse('inclusion_panel_action_set_status', args=[self.action.id])
        self.client.post(url, {'status': 'not_needed', 'note': 'Called it off'})
        self.assertEqual(ActionUpdate.objects.get().author, ada)
