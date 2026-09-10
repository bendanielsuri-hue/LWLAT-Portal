"""Duration formatting, and the one empty sentinel.

`duration_display` used to be produced at five sites in three formats with two
different empty values. These tests exist mostly to hold the sentinel: every
formatter returns None for "nothing to show", and templates supply the dash.
"""

import datetime

from django.test import SimpleTestCase

from hubs.inclusion.panel import presenters


class ClockDurationTest(SimpleTestCase):
    def test_formats_as_hours_minutes_seconds(self):
        self.assertEqual(
            presenters.clock_duration(datetime.timedelta(hours=1, minutes=5, seconds=3)),
            '1:05:03',
        )

    def test_pads_minutes_and_seconds_but_not_hours(self):
        self.assertEqual(presenters.clock_duration(datetime.timedelta(minutes=15)), '0:15:00')

    def test_hours_do_not_wrap_at_a_day(self):
        self.assertEqual(presenters.clock_duration(datetime.timedelta(hours=26)), '26:00:00')

    def test_empty_is_none(self):
        self.assertIsNone(presenters.clock_duration(None))
        self.assertIsNone(presenters.clock_duration(datetime.timedelta()))


class ShortDurationTest(SimpleTestCase):
    def test_drops_the_empty_half(self):
        self.assertEqual(presenters.short_duration(datetime.timedelta(hours=2, minutes=15)), '2h 15m')
        self.assertEqual(presenters.short_duration(datetime.timedelta(hours=3)), '3h')
        self.assertEqual(presenters.short_duration(datetime.timedelta(minutes=45)), '45m')

    def test_seconds_are_truncated_not_rounded(self):
        self.assertEqual(presenters.short_duration(datetime.timedelta(minutes=1, seconds=59)), '1m')

    def test_empty_is_none(self):
        self.assertIsNone(presenters.short_duration(None))
        self.assertIsNone(presenters.short_duration(datetime.timedelta()))


class SumDurationsTest(SimpleTestCase):
    def test_skips_none_entries(self):
        total = presenters.sum_durations([
            datetime.timedelta(minutes=10), None, datetime.timedelta(minutes=5),
        ])
        self.assertEqual(total, datetime.timedelta(minutes=15))

    def test_nothing_to_add_is_none_not_zero(self):
        # "No discussions recorded" and "discussions totalling zero" are
        # different facts, and only one of them should render as a dash.
        self.assertIsNone(presenters.sum_durations([]))
        self.assertIsNone(presenters.sum_durations([None, None]))
