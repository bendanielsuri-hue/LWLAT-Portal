"""Time-based transitions, exercised at a chosen instant.

None of this was reachable before. reconcile_stale_running_panels() read
timezone.now() internally, so the only ways to exercise the 60-minute timeout
were to monkeypatch the clock or to wait an hour. `now` being a parameter is
the entire difference - every test below just passes a later instant.
"""

import datetime

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from hubs.inclusion.panel import reconcile
from hubs.inclusion.panel.models import Panel, PanelReferral, PanelReferralNote

from .factories import build_panel_world, make_panel, make_panel_referral


class DelayedPanelTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=0)

    def test_a_start_time_that_has_passed_makes_a_panel_delayed(self):
        panel = make_panel(
            group=self.world.group,
            date=timezone.localdate() - datetime.timedelta(days=1),
            status='ready',
        )
        reconcile.reconcile_delayed_panels(timezone.now())
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'delayed')

    def test_rescheduling_into_the_future_reverts_it_to_draft(self):
        # 'delayed' is computed, never stored as a decision - so moving the
        # date forward has to undo it.
        panel = make_panel(
            group=self.world.group,
            date=timezone.localdate() - datetime.timedelta(days=1),
            status='ready',
        )
        reconcile.reconcile_delayed_panels(timezone.now())
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'delayed')

        panel.date = timezone.localdate() + datetime.timedelta(days=7)
        panel.save()
        reconcile.reconcile_delayed_panels(timezone.now())
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'draft')

    def test_a_future_panel_is_left_alone(self):
        panel = make_panel(
            group=self.world.group,
            date=timezone.localdate() + datetime.timedelta(days=3),
            status='ready',
        )
        reconcile.reconcile_delayed_panels(timezone.now())
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'ready')

    def test_a_running_panel_is_never_marked_delayed(self):
        panel = make_panel(
            group=self.world.group,
            date=timezone.localdate() - datetime.timedelta(days=1),
            status='running',
            started_at=timezone.now(),
        )
        reconcile.reconcile_delayed_panels(timezone.now())
        panel.refresh_from_db()
        self.assertEqual(panel.status, 'running')


class StaleRunningPanelTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.panel = self.world.panel
        self.panel.status = 'running'
        self.panel.started_at = timezone.now()
        self.panel.save()

    def later(self, **kwargs):
        return timezone.now() + datetime.timedelta(**kwargs)

    def backdate_activity(self, minutes):
        """Age every activity signal on this panel by `minutes`.

        Not just started_at: panel_last_activity_at also counts any touch of a
        PanelReferral (updated_at is auto_now), which the factory set to now
        when it built the row. Written through queryset.update() precisely
        because auto_now would otherwise stamp it back to now on save().
        """
        old = timezone.now() - datetime.timedelta(minutes=minutes)
        Panel.objects.filter(pk=self.panel.pk).update(started_at=old)
        PanelReferral.objects.filter(panel=self.panel).update(updated_at=old)
        self.panel.refresh_from_db()

    def test_under_the_timeout_the_meeting_is_left_running(self):
        reconcile.reconcile_stale_running_panels(self.later(minutes=30))
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'running')

    def test_past_the_timeout_a_meeting_with_no_discussion_goes_void(self):
        reconcile.reconcile_stale_running_panels(self.later(minutes=61))
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'void')
        self.assertTrue(self.panel.auto_ended)
        self.assertIsNotNone(self.panel.ended_at)

    def test_past_the_timeout_a_meeting_that_discussed_something_completes(self):
        pr = self.world.panel_referral
        pr.discussion_status = 'discussed'
        pr.follow_up_status = ''
        pr.save()
        reconcile.reconcile_stale_running_panels(self.later(minutes=61))
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'complete')

    def test_auto_ending_defers_whatever_was_never_reached(self):
        # And deferring has to leave the referral open again, not stranded as
        # 'assigned' on a meeting nobody is coming back to.
        reconcile.reconcile_stale_running_panels(self.later(minutes=61))
        pr = self.world.panel_referral
        pr.refresh_from_db()
        self.assertEqual(pr.discussion_status, 'deferred')
        self.world.referral.refresh_from_db()
        self.assertEqual(self.world.referral.status, 'open')

    def test_the_timeout_measures_from_last_activity_not_from_the_start(self):
        # A meeting started 90 minutes ago is well past the timeout measured
        # from started_at. A note added just now has to rescue it - otherwise a
        # long, busy meeting would auto-end underneath the people in it (#114).
        self.backdate_activity(minutes=90)

        # First: with no activity since it started, it is stale.
        reconcile.reconcile_stale_running_panels(timezone.now())
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'void')

        # Now the same meeting, with a note recorded a moment ago.
        self.panel.status = 'running'
        self.panel.auto_ended = False
        self.panel.ended_at = None
        self.panel.save()
        PanelReferralNote.objects.create(
            panel_referral=self.world.panel_referral,
            author=self.world.sendco,
            body='Still going.',
        )
        reconcile.reconcile_stale_running_panels(timezone.now())
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'running')


class StaleDiscussionTimerTest(TestCase):
    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        self.pr = self.world.panel_referral

    def test_a_quiet_discussion_with_nothing_recorded_is_treated_as_never_held(self):
        started = timezone.now()
        self.pr.discussion_started_at = started
        self.pr.save()
        reconcile.reconcile_stale_discussion_timers(started + datetime.timedelta(minutes=31))
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.discussion_status, 'deferred')
        self.assertTrue(self.pr.discussion_auto_stopped)
        self.assertIsNone(self.pr.discussion_started_at)
        self.assertEqual(self.pr.follow_up_status, '')

    def test_a_quiet_discussion_that_had_real_activity_gets_a_follow_up(self):
        started = timezone.now() - datetime.timedelta(minutes=5)
        self.pr.discussion_started_at = started
        self.pr.save()
        note = PanelReferralNote.objects.create(
            panel_referral=self.pr, author=self.world.sendco, body='Agreed a plan.'
        )
        reconcile.reconcile_stale_discussion_timers(
            note.created_at + datetime.timedelta(minutes=31)
        )
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.discussion_status, 'discussed')
        # The chair never answered "does this need a review", so it defaults to
        # yes on a short fixed interval - that's flagged uncertainty, not a
        # scheduled review.
        self.assertEqual(self.pr.follow_up_status, 'incomplete')
        self.assertEqual(
            self.pr.follow_up_date, timezone.localdate() + datetime.timedelta(days=7)
        )

    def test_the_clock_stops_at_last_activity_not_at_sweep_time(self):
        # The sweep may not run until long after the cutoff, and that gap was
        # not discussion time either.
        started = timezone.now() - datetime.timedelta(minutes=5)
        self.pr.discussion_started_at = started
        self.pr.save()
        note = PanelReferralNote.objects.create(
            panel_referral=self.pr, author=self.world.sendco, body='Agreed a plan.'
        )
        # Sweep runs six hours late.
        reconcile.reconcile_stale_discussion_timers(
            note.created_at + datetime.timedelta(hours=6)
        )
        self.pr.refresh_from_db()
        counted = self.pr.duration
        self.assertLess(counted, datetime.timedelta(minutes=10))
        self.assertGreater(counted, datetime.timedelta(minutes=4))

    def test_a_recently_active_discussion_is_left_running(self):
        started = timezone.now()
        self.pr.discussion_started_at = started
        self.pr.save()
        reconcile.reconcile_stale_discussion_timers(started + datetime.timedelta(minutes=10))
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.discussion_status, 'pending')
        self.assertIsNotNone(self.pr.discussion_started_at)


class ReconcilePanelsEntryPointTest(TestCase):
    def test_one_call_applies_every_sweep(self):
        # The point of the single entry point: a caller can't apply some
        # transitions and not others, which is what made a meeting's fate
        # depend on which page somebody opened.
        world = build_panel_world(referral_count=1)
        overdue = make_panel(
            group=world.group,
            date=timezone.localdate() - datetime.timedelta(days=1),
            status='ready',
        )
        running = world.panel
        running.status = 'running'
        running.started_at = timezone.now()
        running.save()

        reconcile.reconcile_panels(now=timezone.now() + datetime.timedelta(minutes=61))

        overdue.refresh_from_db()
        running.refresh_from_db()
        self.assertEqual(overdue.status, 'delayed')
        self.assertIn(running.status, ('void', 'complete'))


class ReconcileOnReadTest(TestCase):
    """The switch the views go through, on both settings.

    Two adapters is what makes it a seam rather than a flag: production
    sweeps on a read because nothing else ever will, and a test doesn't,
    because a sweep landing mid-request is indistinguishable from the view
    getting it wrong.
    """

    def setUp(self):
        self.world = build_panel_world(referral_count=1)
        # Scheduled today at midnight (make_panel's default), so it is
        # already overdue by the time any test runs - the exact shape that
        # made a panel's status unobservable through its own view.
        self.panel = self.world.panel
        self.panel.status = 'ready'
        self.panel.save()

    @override_settings(PANEL_RECONCILE_ON_READ=True)
    def test_enabled_a_read_still_sweeps(self):
        self.client.get(reverse('inclusion_panel_meetings'))
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'delayed')

    @override_settings(PANEL_RECONCILE_ON_READ=False)
    def test_disabled_a_read_leaves_the_row_alone(self):
        self.client.get(reverse('inclusion_panel_meetings'))
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'ready')

    @override_settings(PANEL_RECONCILE_ON_READ=False)
    def test_the_switch_never_gates_the_direct_entry_point(self):
        # Turning off the *view* sweep must not disarm the management
        # command or the tests that drive transitions on purpose.
        reconcile.reconcile_panels(now=timezone.now())
        self.panel.refresh_from_db()
        self.assertEqual(self.panel.status, 'delayed')
