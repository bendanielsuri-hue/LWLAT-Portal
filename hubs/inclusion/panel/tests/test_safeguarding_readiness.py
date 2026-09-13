from django.urls import reverse

from core.models import SafeguardingNote, SafeguardingReadinessConfirmation
from hubs.inclusion.panel import form_actions

from .factories import build_panel_world
from .support import PanelViewTestCase


class SafeguardingReadinessTest(PanelViewTestCase):
    def setUp(self):
        self.world = build_panel_world()
        self.url = reverse(
            'inclusion_panel_safeguarding_notes_mutate',
            args=[self.world.panel_referral.pk],
        )

    def test_dsl_confirmation_is_one_student_scoped_auditable_row(self):
        response = self.client.post(self.url, {
            'form_action': form_actions.CONFIRM_SAFEGUARDING_READINESS,
        })

        self.assertEqual(response.status_code, 302)
        confirmation = SafeguardingReadinessConfirmation.objects.get(
            student=self.world.student,
        )
        self.assertEqual(confirmation.confirmed_by, self.world.benjamin)
        self.assertEqual(
            confirmation.notes_version,
            self.world.student.safeguarding_notes_version,
        )

    def test_note_change_makes_the_latest_confirmation_stale(self):
        self.client.post(self.url, {
            'form_action': form_actions.CONFIRM_SAFEGUARDING_READINESS,
        })
        confirmation = SafeguardingReadinessConfirmation.objects.get(
            student=self.world.student,
        )
        self.assertTrue(confirmation.is_current)

        SafeguardingNote.objects.create(
            student=self.world.student,
            author=self.world.benjamin,
            text='A newer safeguarding note',
        )
        confirmation.student.refresh_from_db()
        self.assertFalse(confirmation.is_current)