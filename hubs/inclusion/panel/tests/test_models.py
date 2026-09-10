"""Derived values that live on the model rather than on a view's whim.

primary_concern_category used to be a views.py helper assigned onto instances
at nine call sites under two different names - `concern_category` on
referral/action/escalation rows, `primary_concern_category` on PanelReferral
rows - split by which template family read it. Reusing a row partial across the
two families rendered a blank cell rather than erroring, because a missing
attribute is empty string in a Django template.

As a property it has one name, works from any object that can reach the
referral, and cannot be forgotten by a view.
"""

from django.test import TestCase

from hubs.inclusion.panel.models import (
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
)

from .factories import build_panel_world


class PrimaryConcernCategoryTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.referral = self.world.referral
        self.category = ReferralCategory.objects.create(name='About the concern')

    def add_response(self, label, answer):
        question = ReferralQuestion.objects.create(
            category=self.category, label=label, question_type='text',
        )
        return ReferralResponse.objects.create(
            referral=self.referral, question=question, answer=answer,
        )

    def test_reads_the_answer_to_the_main_concern_category_question(self):
        self.add_response('Main Concern Category', 'Behaviour')
        self.assertEqual(self.referral.primary_concern_category, 'Behaviour')

    def test_other_questions_are_ignored(self):
        self.add_response('Anything else to add?', 'Attendance')
        self.assertIsNone(self.referral.primary_concern_category)

    def test_a_blank_answer_is_no_answer(self):
        self.add_response('Main Concern Category', '')
        self.assertIsNone(self.referral.primary_concern_category)

    def test_no_responses_at_all_is_none(self):
        self.assertIsNone(self.referral.primary_concern_category)

    def test_reachable_from_every_row_type_that_displays_it(self):
        # The three template families each navigate to it differently, and
        # this is what used to be three separately-assigned attribute names.
        self.add_response('Main Concern Category', 'Access to Learning')
        panel_referral = self.world.panel_referral
        self.assertEqual(panel_referral.referral.primary_concern_category, 'Access to Learning')

        from hubs.inclusion.panel.models import Escalation
        escalation = Escalation.objects.create(
            referral=self.referral, escalated_by=self.world.sendco, reason='Needs MAT input.',
        )
        self.assertEqual(escalation.referral.primary_concern_category, 'Access to Learning')
