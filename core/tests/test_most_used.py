"""The "Most Used Apps" ranking: tiers first, then the four-source waterfall.

Two orderings decide what lands in the home-page tray, and neither is visible
in the output when it goes wrong — a tray full of hub landing pages, or one
that quietly ranks somebody else's traffic above your own, still renders as a
perfectly ordinary tray. So both are pinned here:

* leaf-level apps always outrank hub landing pages, because a hub is already
  one click away in the global rail (core/CONTEXT.md, "Most Used Apps");
* within a tier: current-year personal -> current-year trust-wide -> all-time
  personal -> all-time trust-wide, topping up rather than swapping wholesale.
"""

import datetime

from django.test import TestCase
from django.utils import timezone

from core.models import AcademicYear, PageView, Staff
from core.most_used import most_used_apps, personal_usage_counts


def view(staff, url_name, on=None):
    # created_at is auto_now_add, so a dated view has to be written and then
    # backdated; `on` is a date, stored as midday to keep the __date lookups
    # the ranking uses away from any timezone boundary.
    page_view = PageView.objects.create(staff=staff, url_name=url_name)
    if on is not None:
        stamp = timezone.make_aware(datetime.datetime.combine(on, datetime.time(12, 0)))
        PageView.objects.filter(pk=page_view.pk).update(created_at=stamp)
    return page_view


def registry(*keys):
    return {key: {'url': f'/{key}/', 'icon': 'icon.html', 'label': key.title()} for key in keys}


def keys_of(ranked):
    return [row['url_name'] for row in ranked]


class RankingTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.today = timezone.localdate()
        cls.year = AcademicYear.objects.create(
            start_date=cls.today - datetime.timedelta(days=60),
            end_date=cls.today + datetime.timedelta(days=300),
        )
        cls.me = Staff.objects.create(staff_code='S1', first_name='Ada', last_name='Lovelace')

    def test_the_ranking_is_by_open_count_descending(self):
        for _ in range(3):
            view(self.me, 'referrals', self.today)
        view(self.me, 'actions', self.today)
        ranked = most_used_apps(self.me, [registry('referrals', 'actions')])
        self.assertEqual(keys_of(ranked), ['referrals', 'actions'])

    def test_a_url_name_outside_every_registry_is_ignored(self):
        # The registries are the currently-visible, Module-filtered apps, so a
        # PageView for a page that is now hidden (or renamed) must not surface.
        view(self.me, 'hidden_or_renamed', self.today)
        view(self.me, 'referrals', self.today)
        ranked = most_used_apps(self.me, [registry('referrals')])
        self.assertEqual(keys_of(ranked), ['referrals'])

    def test_a_row_carries_its_registry_entry_plus_the_url_name(self):
        view(self.me, 'referrals', self.today)
        row = most_used_apps(self.me, [registry('referrals')])[0]
        self.assertEqual(
            row, {'url': '/referrals/', 'icon': 'icon.html', 'label': 'Referrals',
                  'url_name': 'referrals'},
        )

    def test_the_limit_caps_the_tray(self):
        for n in range(5):
            view(self.me, f'app{n}', self.today)
        ranked = most_used_apps(self.me, [registry(*[f'app{n}' for n in range(5)])], limit=3)
        self.assertEqual(len(ranked), 3)

    def test_no_history_at_all_returns_nothing(self):
        self.assertEqual(most_used_apps(self.me, [registry('referrals')]), [])


class TierTest(TestCase):
    """A hub landing page only fills a slot once leaf apps have run out."""

    @classmethod
    def setUpTestData(cls):
        cls.today = timezone.localdate()
        AcademicYear.objects.create(
            start_date=cls.today - datetime.timedelta(days=60),
            end_date=cls.today + datetime.timedelta(days=300),
        )
        cls.me = Staff.objects.create(staff_code='S1', first_name='Ada', last_name='Lovelace')

    def tiers(self):
        return [registry('referrals'), registry('inclusion_hub')]

    def test_a_less_used_leaf_still_outranks_a_much_used_hub(self):
        for _ in range(20):
            view(self.me, 'inclusion_hub', self.today)
        view(self.me, 'referrals', self.today)
        self.assertEqual(keys_of(most_used_apps(self.me, self.tiers())), ['referrals',
                                                                         'inclusion_hub'])

    def test_a_hub_is_dropped_entirely_once_the_leaf_tier_fills_the_limit(self):
        view(self.me, 'referrals', self.today)
        view(self.me, 'inclusion_hub', self.today)
        ranked = most_used_apps(self.me, self.tiers(), limit=1)
        self.assertEqual(keys_of(ranked), ['referrals'])

    def test_a_hub_fills_the_gap_when_the_leaf_tier_is_short(self):
        view(self.me, 'inclusion_hub', self.today)
        self.assertEqual(keys_of(most_used_apps(self.me, self.tiers())), ['inclusion_hub'])


class WaterfallTest(TestCase):
    """The four sources, in order, topping up rather than replacing."""

    @classmethod
    def setUpTestData(cls):
        cls.today = timezone.localdate()
        cls.year = AcademicYear.objects.create(
            start_date=cls.today - datetime.timedelta(days=60),
            end_date=cls.today + datetime.timedelta(days=300),
        )
        AcademicYear.objects.create(
            start_date=cls.today - datetime.timedelta(days=425),
            end_date=cls.today - datetime.timedelta(days=61),
        )
        cls.long_ago = cls.today - datetime.timedelta(days=200)
        cls.me = Staff.objects.create(staff_code='S1', first_name='Ada', last_name='Lovelace')
        cls.someone_else = Staff.objects.create(
            staff_code='S2', first_name='Alan', last_name='Turing',
        )

    ALL_FOUR = ('mine_now', 'theirs_now', 'mine_ever', 'theirs_ever')

    def seed_all_four_sources(self):
        view(self.me, 'mine_now', self.today)
        for _ in range(9):
            # Deliberately the most-opened row in the table: a later source
            # must not be able to outrank an earlier one on raw count.
            view(self.someone_else, 'theirs_now', self.today)
        view(self.me, 'mine_ever', self.long_ago)
        for _ in range(5):
            view(self.someone_else, 'theirs_ever', self.long_ago)

    def test_the_four_sources_are_consumed_in_order(self):
        self.seed_all_four_sources()
        ranked = most_used_apps(self.me, [registry(*self.ALL_FOUR)])
        self.assertEqual(keys_of(ranked), list(self.ALL_FOUR))

    def test_an_earlier_source_alone_fills_the_tray_and_stops(self):
        self.seed_all_four_sources()
        ranked = most_used_apps(self.me, [registry(*self.ALL_FOUR)], limit=1)
        self.assertEqual(keys_of(ranked), ['mine_now'])

    def test_a_page_seen_in_two_sources_is_listed_once(self):
        view(self.me, 'referrals', self.today)
        view(self.someone_else, 'referrals', self.today)
        view(self.me, 'referrals', self.long_ago)
        self.assertEqual(keys_of(most_used_apps(self.me, [registry('referrals')])), ['referrals'])

    def test_with_no_academic_year_seeded_only_the_all_time_sources_run(self):
        # _current_academic_year() returns None outside any seeded year, and
        # the ranking has to degrade to all-time rather than come back empty.
        AcademicYear.objects.all().delete()
        self.seed_all_four_sources()
        ranked = most_used_apps(self.me, [registry(*self.ALL_FOUR)])
        # Both of this staff member's own pages come first (they tie on count,
        # so their order relative to each other is not part of the contract);
        # trust-wide traffic still fills the tail.
        self.assertEqual(set(keys_of(ranked)[:2]), {'mine_now', 'mine_ever'})
        # ...and the all-time trust-wide source then ranks purely on count,
        # with no current-year source left to have claimed the top slots.
        self.assertEqual(keys_of(ranked)[2:], ['theirs_now', 'theirs_ever'])

    def test_a_view_outside_the_current_year_is_not_a_current_year_view(self):
        view(self.me, 'mine_ever', self.long_ago)
        for _ in range(3):
            view(self.someone_else, 'theirs_now', self.today)
        ranked = most_used_apps(self.me, [registry('mine_ever', 'theirs_now')])
        self.assertEqual(keys_of(ranked), ['theirs_now', 'mine_ever'])


class PersonalUsageCountsTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.me = Staff.objects.create(staff_code='S1', first_name='Ada', last_name='Lovelace')
        cls.someone_else = Staff.objects.create(
            staff_code='S2', first_name='Alan', last_name='Turing',
        )

    def test_it_counts_all_time_opens_for_one_staff_member_only(self):
        view(self.me, 'referrals')
        view(self.me, 'referrals')
        view(self.me, 'actions')
        view(self.someone_else, 'referrals')
        self.assertEqual(personal_usage_counts(self.me), {'referrals': 2, 'actions': 1})

    def test_a_staff_member_with_no_history_counts_nothing(self):
        self.assertEqual(personal_usage_counts(self.me), {})
