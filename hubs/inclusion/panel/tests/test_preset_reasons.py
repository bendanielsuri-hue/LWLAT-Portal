"""One preset-reason mechanism, two consumers that must not drift apart.

The rule worth pinning is the one that made this shared in the first place
(#239): a preset is offered, never stored as a reference. Both consumers keep
the sentence itself, so an admin deactivating or rewording a preset afterwards
can't change what somebody already said - a rule that is invisible in a diff
and only shows up months later, on a screen nobody was looking at.

The rest is the half of "capture a reason" that has no UI to notice it going
wrong: which POST fields resolve to which sentence, and what is cleared again
when a member comes back onto a roster.
"""

from django.test import SimpleTestCase
from django.urls import reverse

from hubs.inclusion.panel import reasons
from hubs.inclusion.panel.models import Escalation, PanelGroupMember, PresetReason

from .factories import build_panel_world, make_staff
from .support import PanelViewTestCase


class ReasonFromPostTest(SimpleTestCase):
    def test_a_preset_choice_is_itself_the_reason(self):
        post = {'reason_choice': 'Left the school.', 'reason_other': 'ignored'}
        self.assertEqual(reasons.reason_from_post(post), 'Left the school.')

    def test_the_other_sentinel_reads_the_free_text_box(self):
        post = {'reason_choice': reasons.OTHER, 'reason_other': '  Seconded to the MAT.  '}
        self.assertEqual(reasons.reason_from_post(post), 'Seconded to the MAT.')

    def test_nothing_chosen_is_no_reason(self):
        self.assertEqual(reasons.reason_from_post({}), '')


class PresetReasonQuerySetTest(PanelViewTestCase):
    def test_for_context_is_scoped_and_hides_deactivated_presets(self):
        mine = PresetReason.objects.create(
            context=PresetReason.CONTEXT_ESCALATION, text='Needs MAT oversight.',
        )
        PresetReason.objects.create(
            context=PresetReason.CONTEXT_ESCALATION, text='Withdrawn.', is_active=False,
        )
        PresetReason.objects.create(
            context=PresetReason.CONTEXT_MEMBER_DEACTIVATION, text='Left the school.',
        )
        self.assertEqual(
            list(PresetReason.objects.for_context(PresetReason.CONTEXT_ESCALATION)), [mine],
        )


class EscalationReasonTest(PanelViewTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.world = build_panel_world(referral_count=1)
        cls.preset = PresetReason.objects.create(
            context=PresetReason.CONTEXT_ESCALATION, text='Needs MAT-level oversight.',
        )

    def escalate(self, **post):
        return self.client.post(
            reverse('inclusion_panel_referral_escalate', args=[self.world.referral.pk]), post,
        )

    def test_the_form_offers_the_active_presets_for_its_own_context(self):
        PresetReason.objects.create(
            context=PresetReason.CONTEXT_MEMBER_DEACTIVATION, text='Left the school.',
        )
        response = self.client.get(
            reverse('inclusion_panel_referral_escalate', args=[self.world.referral.pk])
        )
        self.assertContains(response, 'Needs MAT-level oversight.')
        self.assertNotContains(response, 'Left the school.')

    def test_a_chosen_preset_is_stored_as_its_own_sentence(self):
        self.escalate(reason_choice=self.preset.text)
        self.assertEqual(Escalation.objects.get().reason, self.preset.text)

    def test_deactivating_the_preset_afterwards_leaves_the_reason_alone(self):
        # The whole point of storing text rather than a foreign key: an admin
        # tidying the offered list can't rewrite history.
        self.escalate(reason_choice=self.preset.text)
        PresetReason.objects.filter(pk=self.preset.pk).update(is_active=False, text='Reworded.')
        self.assertEqual(Escalation.objects.get().reason, 'Needs MAT-level oversight.')

    def test_other_stores_the_free_text_instead(self):
        self.escalate(reason_choice=reasons.OTHER, reason_other='Tribunal pending.')
        self.assertEqual(Escalation.objects.get().reason, 'Tribunal pending.')


class MemberDeactivationReasonTest(PanelViewTestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.member = PanelGroupMember.objects.get(
            panel_group=self.world.group, staff=self.world.sendco,
        )
        self.url = reverse('inclusion_panel_group_edit', args=[self.world.group.pk])

    def toggle(self, **post):
        return self.client.post(self.url, {
            'form_action': 'toggle_group_member_active',
            'member_id': self.member.pk,
            **post,
        })

    def test_deactivating_records_when_who_and_why(self):
        self.toggle(reason_choice=reasons.OTHER, reason_other='Seconded to the MAT.')
        self.member.refresh_from_db()
        self.assertFalse(self.member.is_active)
        self.assertIsNotNone(self.member.deactivated_at)
        # No login system: whoever the sidebar identity resolves to is the
        # actor, which with no cookie set is the default Benjamin Suri row.
        self.assertEqual(self.member.deactivated_by, self.world.benjamin)
        self.assertEqual(self.member.deactivation_reason, 'Seconded to the MAT.')

    def test_reactivating_clears_the_whole_deactivation(self):
        self.toggle(reason_choice='Left the school.')
        self.toggle()
        self.member.refresh_from_db()
        self.assertTrue(self.member.is_active)
        self.assertIsNone(self.member.deactivated_at)
        self.assertIsNone(self.member.deactivated_by)
        self.assertEqual(self.member.deactivation_reason, '')

    def test_being_re_added_through_the_picker_clears_it_too(self):
        # The other way back onto a roster - update_or_create rather than the
        # toggle - and the one that would quietly leave a live member
        # carrying a stale "Deactivated by ... " line on the roster screen.
        self.toggle(reason_choice='Left the school.')
        self.client.post(self.url, {
            'form_action': 'add_group_member',
            'staff': self.world.sendco.pk,
        })
        self.member.refresh_from_db()
        self.assertTrue(self.member.is_active)
        self.assertIsNone(self.member.deactivated_by)
        self.assertEqual(self.member.deactivation_reason, '')

    def test_the_roster_shows_who_deactivated_a_member_and_why(self):
        self.toggle(reason_choice='Left the school.')
        response = self.client.get(self.url)
        self.assertContains(response, 'Left the school.')
        self.assertContains(response, f'by {self.world.benjamin}')

    def test_the_deactivate_step_offers_its_own_context_presets(self):
        PresetReason.objects.create(
            context=PresetReason.CONTEXT_MEMBER_DEACTIVATION, text='Added in error.',
        )
        PresetReason.objects.create(
            context=PresetReason.CONTEXT_ESCALATION, text='Needs MAT-level oversight.',
        )
        response = self.client.get(self.url)
        self.assertContains(response, 'Added in error.')
        self.assertNotContains(response, 'Needs MAT-level oversight.')

    def test_deactivating_the_default_chair_still_vacates_the_chair(self):
        # Pre-existing behaviour the reason step sits in front of - the
        # deactivation itself is unchanged, only how it's asked for.
        other = make_staff('Grace', 'Hopper', school=self.world.school)
        self.world.group.members.create(staff=other)
        self.world.group.default_chair = self.world.sendco
        self.world.group.save(update_fields=['default_chair'])
        self.toggle(reason_choice='Left the school.')
        self.world.group.refresh_from_db()
        self.assertIsNone(self.world.group.default_chair_id)


class PresetReasonSettingsTest(PanelViewTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.world = build_panel_world(referral_count=1)

    def test_adding_a_preset_scopes_it_to_the_posted_context(self):
        self.client.post(reverse('inclusion_panel_preset_reason_settings'), {
            'form_action': 'add_preset_reason',
            'context': PresetReason.CONTEXT_MEMBER_DEACTIVATION,
            'text': '  Left the school.  ',
        })
        preset = PresetReason.objects.get()
        self.assertEqual(preset.context, PresetReason.CONTEXT_MEMBER_DEACTIVATION)
        self.assertEqual(preset.text, 'Left the school.')

    def test_an_unknown_context_adds_nothing(self):
        self.client.post(reverse('inclusion_panel_preset_reason_settings'), {
            'form_action': 'add_preset_reason',
            'context': 'not_a_context',
            'text': 'Nowhere to show this.',
        })
        self.assertFalse(PresetReason.objects.exists())

    def test_deactivating_keeps_the_row_and_only_stops_offering_it(self):
        preset = PresetReason.objects.create(
            context=PresetReason.CONTEXT_ESCALATION, text='Needs MAT-level oversight.',
        )
        self.client.post(reverse('inclusion_panel_preset_reason_settings'), {
            'form_action': 'deactivate_preset_reason',
            'reason_id': preset.pk,
        })
        preset.refresh_from_db()
        self.assertFalse(preset.is_active)
