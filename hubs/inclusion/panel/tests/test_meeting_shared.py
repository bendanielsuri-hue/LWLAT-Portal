"""Estimated discussion durations (#244): own history first, portal average as fallback."""

import datetime

from django.test import TestCase

from hubs.inclusion.panel.views.meeting_shared import _estimated_discussion_durations

from .factories import build_panel_world, make_panel, make_panel_referral, make_referral, make_student


class EstimatedDiscussionDurationsTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=0)

    def _discussed_panel_referral(self, referral, duration, **kwargs):
        past_panel = make_panel(group=self.world.group, status='complete')
        return make_panel_referral(
            past_panel, referral, discussion_status='discussed', duration=duration, **kwargs
        )

    def test_no_history_anywhere_gives_no_estimate(self):
        student = make_student('New', 'Student', school=self.world.school)
        referral = make_referral(student, raised_by=self.world.sendco)

        estimates = _estimated_discussion_durations([referral.id])
        self.assertEqual(estimates[referral.id], (None, None))

    def test_own_history_is_averaged_and_preferred(self):
        student = make_student('Rosa', 'Franklin', school=self.world.school)
        referral = make_referral(student, raised_by=self.world.sendco)

        self._discussed_panel_referral(referral, datetime.timedelta(minutes=10))
        self._discussed_panel_referral(referral, datetime.timedelta(minutes=20))

        estimates = _estimated_discussion_durations([referral.id])
        duration, source = estimates[referral.id]
        self.assertEqual(duration, datetime.timedelta(minutes=15))
        self.assertEqual(source, 'own')

    def test_referral_with_no_history_falls_back_to_group_average(self):
        discussed_student = make_student('Ada', 'Franklin', school=self.world.school)
        discussed_referral = make_referral(discussed_student, raised_by=self.world.sendco)
        self._discussed_panel_referral(discussed_referral, datetime.timedelta(minutes=30))

        new_student = make_student('Grace', 'Hopper', school=self.world.school)
        new_referral = make_referral(new_student, raised_by=self.world.sendco)

        estimates = _estimated_discussion_durations([new_referral.id])
        duration, source = estimates[new_referral.id]
        self.assertEqual(duration, datetime.timedelta(minutes=30))
        self.assertEqual(source, 'group')

    def test_a_discussion_with_no_recorded_duration_is_excluded_not_zeroed(self):
        student = make_student('Marie', 'Curie', school=self.world.school)
        referral = make_referral(student, raised_by=self.world.sendco)

        # No duration recorded (e.g. a too-short/no-activity discussion) -
        # must not drag the average toward zero.
        self._discussed_panel_referral(referral, None)
        self._discussed_panel_referral(referral, datetime.timedelta(minutes=40))

        estimates = _estimated_discussion_durations([referral.id])
        duration, source = estimates[referral.id]
        self.assertEqual(duration, datetime.timedelta(minutes=40))
        self.assertEqual(source, 'own')
