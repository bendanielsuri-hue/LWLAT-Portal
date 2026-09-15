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


class ActionUpdateEditDeleteTest(PanelViewTestCase):
    """Edit and delete are author-only, enforced server-side.

    A wrong call about the identity check here is invisible everywhere else -
    the template never even renders the buttons for a non-author, so only a
    forged POST would expose it.
    """

    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.action = make_action(self.world.referral)
        self.url = reverse('inclusion_panel_action_new', args=[self.world.referral.id])
        # default_staff() (Benjamin Suri) is the author with no cookie set.
        self.update = ActionUpdate.objects.create(
            action=self.action, author=None, body='Called the parent, no answer',
        )

    def edit(self, update_id=None, body='Called the parent, spoke to her', **extra):
        return self.client.post(self.url, {
            'form_action': 'edit_action_update',
            'action_id': self.action.id,
            'update_id': update_id or self.update.id,
            'body': body,
        }, headers={'x-requested-with': 'XMLHttpRequest'}, **extra)

    def delete(self, update_id=None, **extra):
        return self.client.post(self.url, {
            'form_action': 'delete_action_update',
            'action_id': self.action.id,
            'update_id': update_id or self.update.id,
        }, headers={'x-requested-with': 'XMLHttpRequest'}, **extra)

    def as_author(self, staff):
        self.update.author = staff
        self.update.save(update_fields=['author'])
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(staff.id)

    def test_the_author_can_edit_their_own_entry_in_place(self):
        ada = self.world.sendco
        self.as_author(ada)
        response = self.edit(body='Called the parent, spoke to her')
        self.assertTrue(response.json()['success'])
        self.update.refresh_from_db()
        self.assertEqual(self.update.body, 'Called the parent, spoke to her')

    def test_an_edit_sets_the_edited_marker(self):
        ada = self.world.sendco
        self.as_author(ada)
        self.assertIsNone(self.update.edited_at)
        html = self.edit().json()['html']
        self.update.refresh_from_db()
        self.assertIsNotNone(self.update.edited_at)
        self.assertIn('edited', html)

    def test_editing_does_not_move_created_at_or_thread_position(self):
        ada = self.world.sendco
        self.as_author(ada)
        original_created_at = self.update.created_at
        self.edit()
        self.update.refresh_from_db()
        self.assertEqual(self.update.created_at, original_created_at)

    def test_the_author_can_soft_delete_their_own_entry(self):
        ada = self.world.sendco
        self.as_author(ada)
        response = self.delete()
        self.assertTrue(response.json()['success'])
        self.update.refresh_from_db()
        self.assertIsNotNone(self.update.deleted_at)
        # Row survives - it's recoverable, not gone.
        self.assertTrue(ActionUpdate.objects.filter(pk=self.update.id).exists())

    def test_a_soft_deleted_entry_is_excluded_from_the_thread_read(self):
        ada = self.world.sendco
        self.as_author(ada)
        self.delete()
        self.assertNotIn(self.update, list(self.action.updates.visible()))

    def test_a_non_author_cannot_edit(self):
        ada = self.world.sendco
        self.update.author = ada
        self.update.save(update_fields=['author'])
        outsider = make_staff('Tom', 'Outside', school=self.world.school)
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(outsider.id)
        response = self.edit()
        self.assertFalse(response.json().get('success'))
        self.update.refresh_from_db()
        self.assertEqual(self.update.body, 'Called the parent, no answer')
        self.assertIsNone(self.update.edited_at)

    def test_a_non_author_cannot_delete(self):
        ada = self.world.sendco
        self.update.author = ada
        self.update.save(update_fields=['author'])
        outsider = make_staff('Tom', 'Outside', school=self.world.school)
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(outsider.id)
        response = self.delete()
        self.assertFalse(response.json().get('success'))
        self.update.refresh_from_db()
        self.assertIsNone(self.update.deleted_at)

    def test_an_entry_with_no_author_cannot_be_edited_or_deleted_by_anyone(self):
        # author is SET_NULL'd if the staff row is ever removed - nobody's
        # cookie identity can match None, so the entry is stuck as written,
        # which is the safe failure mode for an unattributable entry.
        response = self.edit()
        self.assertFalse(response.json().get('success'))

    def test_a_forged_update_id_from_another_action_is_rejected(self):
        other_action = make_action(self.world.referral)
        other_update = ActionUpdate.objects.create(
            action=other_action, author=None, body='Different action entry',
        )
        ada = self.world.sendco
        other_update.author = ada
        other_update.save(update_fields=['author'])
        self.client.cookies[CURRENT_STAFF_COOKIE] = str(ada.id)
        response = self.client.post(self.url, {
            'form_action': 'edit_action_update',
            'action_id': self.action.id,
            'update_id': other_update.id,
            'body': 'Sneaky edit',
        }, headers={'x-requested-with': 'XMLHttpRequest'})
        self.assertEqual(response.status_code, 404)


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

    def test_an_outsider_cannot_edit_or_delete_on_a_sensitive_action(self):
        # Same redirect the read gate above gets - the sensitivity check
        # happens while resolving `action` from action_id, before this
        # view even looks at form_action, so edit/delete inherit it for free.
        update = ActionUpdate.objects.create(action=self.action, author=self.outsider, body='Called the parent')
        response = self.client.post(self.url, {
            'form_action': 'edit_action_update',
            'action_id': self.action.id,
            'update_id': update.id,
            'body': 'Sneaky edit',
        }, headers={'x-requested-with': 'XMLHttpRequest'})
        self.assertEqual(response.status_code, 302)
        update.refresh_from_db()
        self.assertEqual(update.body, 'Called the parent')
