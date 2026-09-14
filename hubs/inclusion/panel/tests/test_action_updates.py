"""An Action's update thread: what was tried, not where it got to.

Status answers "where did this get to" and nothing answers "what was tried",
so these pin the parts of the thread that are rules rather than markup: that
it stays writable after the action is finished (chasing does not stop because
a status moved), that it inherits the action's sensitivity rather than
carrying its own, and that a soft-deleted entry leaves the thread without
leaving the table.
"""

from django.urls import reverse

from core.identity import CURRENT_STAFF_COOKIE
from django.utils import timezone

from hubs.inclusion.panel.models import ActionCategory, ActionUpdate

from .factories import build_panel_world, make_action, make_staff
from .support import PanelViewTestCase


class ActionUpdateThreadTest(PanelViewTestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.action = make_action(self.world.referral)
        self.url = reverse('inclusion_panel_action_new', args=[self.world.referral.id])

    def post_update(self, body='Called the parent, no answer', **extra):
        return self.client.post(self.url, {
            'form_action': 'add_action_update',
            'action_id': self.action.id,
            'body': body,
        }, headers={'x-requested-with': 'XMLHttpRequest'}, **extra)

    def test_posting_an_update_stores_it_against_the_action(self):
        response = self.post_update()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])
        update = ActionUpdate.objects.get()
        self.assertEqual(update.action, self.action)
        self.assertEqual(update.body, 'Called the parent, no answer')

    def test_the_answer_carries_the_rendered_entry_so_nothing_reloads(self):
        # The step appends this instead of re-fetching the modal, which would
        # discard whatever is half-typed on the details step.
        html = self.post_update().json()['html']
        self.assertIn('Called the parent, no answer', html)
        self.assertIn('note-thread-item', html)

    def test_the_author_is_the_current_staff_identity(self):
        ada = self.world.sendco
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(ada.id)
        self.post_update()
        self.assertEqual(ActionUpdate.objects.get().author, ada)

    def test_an_empty_update_is_not_stored(self):
        response = self.post_update(body='   ')
        self.assertFalse(response.json()['success'])
        self.assertFalse(ActionUpdate.objects.exists())

    def test_a_finished_action_can_still_be_updated(self):
        # Chasing an action does not stop because its status moved - both
        # finished states stay writable.
        for status in ('complete', 'not_needed'):
            with self.subTest(status=status):
                self.action.status = status
                self.action.save(update_fields=['status'])
                self.assertTrue(self.post_update().json()['success'])

    def test_the_thread_renders_oldest_first(self):
        first = ActionUpdate.objects.create(action=self.action, body='Rang mum')
        second = ActionUpdate.objects.create(action=self.action, body='Rang dad')
        body = self.client.get(self.url, {'edit': self.action.id}).content.decode()
        self.assertLess(body.index(first.body), body.index(second.body))

    def test_a_soft_deleted_entry_leaves_the_thread_but_not_the_table(self):
        ActionUpdate.objects.create(action=self.action, body='Retracted', deleted_at=timezone.now())
        kept = ActionUpdate.objects.create(action=self.action, body='Rang mum')
        self.assertEqual(list(self.action.updates.visible()), [kept])
        self.assertEqual(self.action.updates.count(), 2)

    def test_deleting_the_action_takes_its_thread_with_it(self):
        ActionUpdate.objects.create(action=self.action, body='Rang mum')
        self.action.delete()
        self.assertFalse(ActionUpdate.objects.exists())


class SensitiveActionUpdateTest(PanelViewTestCase):
    """Visibility is inherited from the action, with no per-entry sensitivity.

    An action in a sensitive category is already hidden from anyone outside a
    PanelGroup, and its thread has to be hidden by the same gate - not by one
    of its own, which would be a second rule to keep in step with the first.
    """

    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        sensitive = ActionCategory.objects.create(name='Safeguarding', is_sensitive=True)
        self.action = make_action(self.world.referral, category=sensitive)
        self.url = reverse('inclusion_panel_action_new', args=[self.world.referral.id])
        # Not in any PanelGroup, so not panel staff.
        self.outsider = make_staff('Tom', 'Outside', school=self.world.school)
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(self.outsider.id)

    def test_an_outsider_cannot_read_the_thread(self):
        ActionUpdate.objects.create(action=self.action, body='Called the parent')
        response = self.client.get(self.url, {'edit': self.action.id})
        self.assertEqual(response.status_code, 302)

    def test_an_outsider_cannot_post_to_the_thread(self):
        self.client.post(self.url, {
            'form_action': 'add_action_update',
            'action_id': self.action.id,
            'body': 'Called the parent',
        }, headers={'x-requested-with': 'XMLHttpRequest'})
        self.assertFalse(ActionUpdate.objects.exists())
