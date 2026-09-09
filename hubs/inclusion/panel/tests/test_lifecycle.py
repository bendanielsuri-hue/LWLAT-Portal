"""The referral state machine.

InclusionReferral.status is derived, never set by hand: it aggregates across
every PanelReferral row a referral currently has. Getting that wrong is a
silent failure - the referral simply shows up in the wrong queue - so this is
the rule most worth pinning down, and until lifecycle.py existed there was no
interface to pin it against short of a full HTTP round trip.
"""

import datetime

from django.test import TestCase
from django.utils import timezone

from core.models import Referral as CoreReferral
from hubs.inclusion.panel import lifecycle

from .factories import build_panel_world, make_panel, make_panel_referral


class ReferralStatusTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.pr = self.world.panel_referral
        self.referral = self.world.referral

    def status(self):
        self.referral.refresh_from_db()
        return self.referral.status

    def test_on_an_agenda_but_not_started_is_assigned(self):
        lifecycle.sync_referral_status(self.referral)
        self.assertEqual(self.status(), 'assigned')

    def test_discussion_started_is_discussing(self):
        self.pr.discussion_started_at = timezone.now()
        self.pr.save()
        lifecycle.sync_referral_status(self.referral)
        self.assertEqual(self.status(), 'discussing')

    def test_discussed_with_no_follow_up_closes_the_referral(self):
        lifecycle.mark_discussed(self.pr, requires_followup=False, follow_up_date=None)
        self.assertEqual(self.status(), 'closed')

    def test_closing_projects_onto_the_shared_core_referral(self):
        # core.Referral carries a coarse open/closed for cross-type reporting
        # and is kept in sync from here - see core.models.Referral.
        lifecycle.mark_discussed(self.pr, requires_followup=False, follow_up_date=None)
        self.referral.referral.refresh_from_db()
        self.assertEqual(self.referral.referral.status, CoreReferral.STATUS_CLOSED)

    def test_reopening_projects_back_onto_the_core_referral(self):
        lifecycle.mark_discussed(self.pr, requires_followup=False, follow_up_date=None)
        lifecycle.mark_discussed(
            self.pr, requires_followup=True,
            follow_up_date=timezone.localdate() + datetime.timedelta(days=30),
        )
        self.referral.referral.refresh_from_db()
        self.assertEqual(self.referral.referral.status, CoreReferral.STATUS_OPEN)

    def test_follow_up_tiers_by_how_close_the_due_date_is(self):
        today = timezone.localdate()
        cases = [
            (today + datetime.timedelta(days=30), 'review_scheduled'),   # > 7 days away
            (today + datetime.timedelta(days=3), 'awaiting_review'),     # within 7 either side
            (today - datetime.timedelta(days=3), 'awaiting_review'),
            (today - datetime.timedelta(days=30), 'overdue_review'),     # > 7 days past
        ]
        for due, expected in cases:
            with self.subTest(due=due):
                lifecycle.mark_discussed(self.pr, requires_followup=True, follow_up_date=due)
                self.assertEqual(self.status(), expected)

    def test_the_seven_day_boundaries_themselves(self):
        # The tier edges are inclusive on the 'awaiting_review' side: >7 is
        # scheduled, exactly 7 is awaiting, exactly -7 is still awaiting.
        today = timezone.localdate()
        for days, expected in [(8, 'review_scheduled'), (7, 'awaiting_review'),
                               (-7, 'awaiting_review'), (-8, 'overdue_review')]:
            with self.subTest(days=days):
                lifecycle.mark_discussed(
                    self.pr, requires_followup=True,
                    follow_up_date=today + datetime.timedelta(days=days),
                )
                self.assertEqual(self.status(), expected)

    def test_a_deferred_row_leaves_the_referral_open(self):
        # The headline rule: a meeting ended without reaching this referral.
        # The row is kept for that panel's history but must not hold the
        # referral hostage - it has to read as available for a future panel.
        lifecycle.defer(self.pr)
        self.assertEqual(self.status(), 'open')

    def test_removing_from_the_agenda_reopens_the_referral(self):
        lifecycle.remove_from_agenda(self.pr, removed_by_id=self.world.sendco.pk)
        self.assertEqual(self.status(), 'open')

    def test_the_most_current_fact_wins_over_an_older_row(self):
        # A referral discussed at one panel and picked up again by another is
        # 'discussing', not left reading as its older follow-up state.
        lifecycle.mark_discussed(
            self.pr, requires_followup=True,
            follow_up_date=timezone.localdate() + datetime.timedelta(days=30),
        )
        self.assertEqual(self.status(), 'review_scheduled')

        second = make_panel(group=self.world.group)
        second_pr = make_panel_referral(second, self.referral)
        second_pr.discussion_started_at = timezone.now()
        second_pr.save()
        lifecycle.sync_referral_status(self.referral)
        self.assertEqual(self.status(), 'discussing')


class MutationsResyncTest(TestCase):
    """Every verb resyncs as part of the act.

    This is the invariant that used to live in a CLAUDE.md sentence and eleven
    call sites remembering to honour it. If a new mutation verb is added
    without a resync, one of these fails rather than a referral silently
    sitting in the wrong queue.
    """

    def setUp(self):
        self.world = build_panel_world(referral_count=1)

    def assert_resynced(self, mutate, expected):
        referral = self.world.referral
        # Put the stored status deliberately out of date first, so passing can
        # only mean the mutation itself recomputed it.
        referral.status = 'open'
        referral.save(update_fields=['status'])
        mutate()
        referral.refresh_from_db()
        self.assertEqual(referral.status, expected)

    def test_mark_discussed_resyncs(self):
        self.assert_resynced(
            lambda: lifecycle.mark_discussed(
                self.world.panel_referral, requires_followup=False, follow_up_date=None
            ),
            'closed',
        )

    def test_remove_from_agenda_resyncs(self):
        self.world.referral.status = 'assigned'
        self.world.referral.save(update_fields=['status'])
        lifecycle.remove_from_agenda(self.world.panel_referral, removed_by_id=None)
        self.world.referral.refresh_from_db()
        self.assertEqual(self.world.referral.status, 'open')

    def test_defer_resyncs(self):
        self.world.referral.status = 'assigned'
        self.world.referral.save(update_fields=['status'])
        lifecycle.defer(self.world.panel_referral)
        self.world.referral.refresh_from_db()
        self.assertEqual(self.world.referral.status, 'open')


class StageTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.pr = self.world.panel_referral

    def test_stage_reads_the_single_row_not_the_aggregate(self):
        self.assertEqual(lifecycle.stage(self.pr)[0], 'assigned')
        self.pr.discussion_started_at = timezone.now()
        self.assertEqual(lifecycle.stage(self.pr)[0], 'discussing')
        self.pr.discussion_started_at = None
        self.pr.discussion_status = 'discussed'
        self.pr.follow_up_status = 'incomplete'
        self.assertEqual(lifecycle.stage(self.pr)[0], 'requires_follow_up')
        self.pr.follow_up_status = 'complete'
        self.assertEqual(lifecycle.stage(self.pr)[0], 'complete')
        self.pr.discussion_status = 'deferred'
        self.assertEqual(lifecycle.stage(self.pr)[0], 'deferred')

    def test_is_last_open_review_is_false_while_another_row_is_open(self):
        lifecycle.mark_discussed(
            self.pr, requires_followup=True,
            follow_up_date=timezone.localdate() + datetime.timedelta(days=10),
        )
        self.assertTrue(lifecycle.is_last_open_review(self.pr))

        other = make_panel_referral(make_panel(group=self.world.group), self.world.referral)
        # A second row still sitting on an agenda means cancelling this one's
        # follow-up would not close the referral.
        self.assertFalse(lifecycle.is_last_open_review(self.pr))

        lifecycle.mark_discussed(other, requires_followup=False, follow_up_date=None)
        self.assertTrue(lifecycle.is_last_open_review(self.pr))


class DiscussionTimerTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.pr = self.world.panel_referral

    def test_stopping_accrues_elapsed_time(self):
        start = timezone.now()
        self.pr.discussion_started_at = start
        self.pr.save()
        lifecycle.stop_discussion_timer(self.pr, now=start + datetime.timedelta(minutes=12))
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.duration, datetime.timedelta(minutes=12))
        self.assertIsNone(self.pr.discussion_started_at)

    def test_a_second_segment_adds_to_the_first(self):
        start = timezone.now()
        self.pr.discussion_started_at = start
        self.pr.save()
        lifecycle.stop_discussion_timer(self.pr, now=start + datetime.timedelta(minutes=12))

        resumed = start + datetime.timedelta(hours=1)
        self.pr.discussion_started_at = resumed
        self.pr.save()
        lifecycle.stop_discussion_timer(self.pr, now=resumed + datetime.timedelta(minutes=5))
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.duration, datetime.timedelta(minutes=17))

    def test_stopping_an_unstarted_timer_does_nothing(self):
        lifecycle.stop_discussion_timer(self.pr, now=timezone.now())
        self.pr.refresh_from_db()
        self.assertIsNone(self.pr.duration)
