"""Browser coverage for the Students list page's client-side behaviour.

Students is the page #210 wired to the list-page tier first, so it exercises
the most of what the static-assets migration moved out of panel.js: the
list-page orchestrator, stack mode, the shared button-column width, and the
filter bar's active-state badge. The view tests next door already cover what
the server sends; nothing there can tell you whether the modules that arrange
it still load, or still agree with each other, after a file moves.

See core/tests/browser.py for the base class and how to run only these.
"""

from core.tests.browser import BrowserTestCase

from .factories import (
    make_default_identity,
    make_referral,
    make_school,
    make_student,
)

STUDENTS_URL = '/inclusion/panel/students/'
LIST_ROOT = '#students-filtered-content'


def open_filter_bar(page):
    """Expand the filter bar, the way a user reaches a secondary filter.

    Only the pinned fields (search, Year, Reg) are reachable on the collapsed
    bar; everything else sits inside .filter-bar-collapsible, which intercepts
    clicks until the bar is expanded. Clicking .filter-bar-label is the real
    trigger (expand-collapse.js treats it and .more-filters-toggle alike), so
    tests use it rather than forcing a click through the overlay.
    """
    page.click('.filter-bar-label')
    page.wait_for_selector('.filter-bar.is-expanded')


class StudentsListPageTest(BrowserTestCase):
    """The page as a whole: does its module graph load and wire itself up?"""

    def setUp(self):
        super().setUp()
        self.school = make_school()
        make_default_identity(school=self.school)
        # Several students across two year groups with distinct reg forms:
        # the Year -> Reg cascade has nothing to narrow otherwise, and a
        # single-row list can't show a shared button-column width.
        self.students = [
            make_student('Ada', 'Lovelace', school=self.school, year_group=9, reg_form='9A'),
            make_student('Grace', 'Hopper', school=self.school, year_group=9, reg_form='9B'),
            make_student('Katherine', 'Johnson', school=self.school, year_group=10, reg_form='10C'),
        ]
        # Referrals give the rows real facts to measure. A row whose facts
        # strip is empty can never stack, which would make the stack-mode
        # assertions below vacuously pass.
        for student in self.students:
            make_referral(student)

    def test_the_page_loads_with_no_console_errors(self):
        """The ES module graph resolves.

        This is the cheap regression net for the migration itself: every entry
        module's relative import path (students.js reaches up three levels into
        static/js/) either resolves or shows up here as a 404, and no other
        test in the suite would notice.
        """
        self.visit(STUDENTS_URL)
        self.assertNoConsoleErrors()

    def test_every_seeded_student_is_listed(self):
        """A guard on the rest of this class rather than a view assertion.

        If the page renders zero rows - wrong school scope, a filter defaulting
        on - every measurement-based assertion below would pass by measuring
        nothing at all.
        """
        page = self.visit(STUDENTS_URL)
        rows = page.locator(f'{LIST_ROOT} .entity-row')
        self.assertEqual(rows.count(), len(self.students))


class FilterBarActiveStateTest(BrowserTestCase):
    """wireFilterBarActiveState: the count badge and per-field highlight.

    Promoted out of panel.js into components/filter-bar/active-state.js and
    now called by initListPage rather than by each page's own inline script,
    which is exactly the wiring a browser test can confirm and a view test
    cannot.
    """

    def setUp(self):
        super().setUp()
        self.school = make_school()
        make_default_identity(school=self.school)
        make_student('Ada', 'Lovelace', school=self.school, year_group=9, reg_form='9A')
        make_student('Grace', 'Hopper', school=self.school, year_group=10, reg_form='10C')

    def test_the_badge_starts_empty(self):
        page = self.visit(STUDENTS_URL)
        badge = page.locator('.filter-bar-count')
        self.assertEqual(badge.inner_text().strip(), '0')
        self.assertIn('filter-bar-count--empty', badge.get_attribute('class'))

    def test_choosing_a_year_counts_as_one_active_filter(self):
        page = self.visit(STUDENTS_URL)
        page.select_option('#year-filter', '9')
        badge = page.locator('.filter-bar-count')
        page.wait_for_function(
            "() => document.querySelector('.filter-bar-count').textContent.trim() === '1'"
        )
        self.assertNotIn('filter-bar-count--empty', badge.get_attribute('class'))
        # The field itself is highlighted, not just the badge incremented.
        field = page.locator('.filter-field:has(#year-filter)')
        self.assertIn('filter-field--active', field.get_attribute('class'))

    def test_a_toggle_pill_counts_as_an_active_filter(self):
        """The toggle branch of isActive(), which has no select or input.

        Worth its own test because the pill is a <button>, so its "value" is a
        class rather than anything the form would submit - a filter bar that
        counted only real form fields would silently score this as inactive.
        """
        page = self.visit(STUDENTS_URL)
        open_filter_bar(page)
        toggle = page.locator('#has-referrals-toggle')
        toggle.click()
        self.assertIn('on', toggle.get_attribute('class'))
        self.assertEqual(toggle.get_attribute('aria-pressed'), 'true')
        page.wait_for_function(
            "() => document.querySelector('.filter-bar-count').textContent.trim() === '1'"
        )


class YearRegCascadeTest(BrowserTestCase):
    """The Students-specific filter that stayed in the page's entry module."""

    def setUp(self):
        super().setUp()
        self.school = make_school()
        make_default_identity(school=self.school)
        make_student('Ada', 'Lovelace', school=self.school, year_group=9, reg_form='9A')
        make_student('Grace', 'Hopper', school=self.school, year_group=9, reg_form='9B')
        make_student('Katherine', 'Johnson', school=self.school, year_group=10, reg_form='10C')

    def test_reg_offers_every_form_until_a_year_is_chosen(self):
        """Note the order: 10C before 9A.

        reg_form is a CharField and the view sorts it with a plain sorted(),
        so the list is lexical rather than by year - '10C' < '9A' as strings.
        Asserted as-is because that is what the page does today; if the
        intended order is ever numeric-by-year, this test is where that
        decision becomes visible rather than a silent change.
        """
        page = self.visit(STUDENTS_URL)
        options = page.locator('#reg-filter option').all_inner_texts()
        self.assertEqual([o.strip() for o in options], ['All', '10C', '9A', '9B'])

    def test_choosing_a_year_narrows_reg_to_that_year_s_forms(self):
        page = self.visit(STUDENTS_URL)
        page.select_option('#year-filter', '9')
        page.wait_for_function(
            "() => document.querySelectorAll('#reg-filter option').length === 3"
        )
        options = [o.strip() for o in page.locator('#reg-filter option').all_inner_texts()]
        self.assertEqual(options, ['All', '9A', '9B'])


class StackModeTest(BrowserTestCase):
    """initStackMode: does a row have room for its facts strip beside it?

    The decision is measured, not a width band, so these tests assert the two
    ends of the range rather than any particular breakpoint - picking a pixel
    here would be asserting on a number stack-mode.js deliberately doesn't use.
    """

    def setUp(self):
        super().setUp()
        self.school = make_school()
        make_default_identity(school=self.school)
        for first, last, reg in [('Ada', 'Lovelace', '9A'), ('Grace', 'Hopper', '9B')]:
            student = make_student(first, last, school=self.school, year_group=9, reg_form=reg)
            make_referral(student)

    def test_rows_are_not_stacked_on_a_wide_desktop(self):
        page = self.visit(STUDENTS_URL)
        root = page.locator(LIST_ROOT)
        self.assertNotIn('rows-stacked', root.get_attribute('class'))

    def test_rows_stack_once_the_column_is_too_narrow(self):
        page = self.visit(STUDENTS_URL)
        self.resize(360)
        root = page.locator(LIST_ROOT)
        self.assertIn('rows-stacked', root.get_attribute('class'))

    def test_unstacking_is_reversible(self):
        """Guards the restore half of calibrate(), not just the decision.

        Calibration measures unstacked and puts the prior state back; a bug
        there shows up as a list that stacks once and never recovers, which a
        one-way assertion would miss entirely.
        """
        page = self.visit(STUDENTS_URL)
        self.resize(360)
        self.resize(1440)
        root = page.locator(LIST_ROOT)
        self.assertNotIn('rows-stacked', root.get_attribute('class'))


class SharedButtonColumnWidthTest(BrowserTestCase):
    """The --students-btn-col-w sync that stayed in students.js on purpose."""

    def setUp(self):
        super().setUp()
        self.school = make_school()
        make_default_identity(school=self.school)
        # Deliberately uneven: one student with referrals and one without, so
        # the rows' natural button widths differ and pinning them to a shared
        # maximum is an observable change rather than a no-op.
        busy = make_student('Ada', 'Lovelace', school=self.school, year_group=9, reg_form='9A')
        for _ in range(3):
            make_referral(busy)
        make_student('Grace', 'Hopper', school=self.school, year_group=9, reg_form='9B')

    def test_the_shared_width_is_pinned_while_unstacked(self):
        page = self.visit(STUDENTS_URL)
        pinned = page.evaluate(
            "() => document.querySelector('#students-filtered-content')"
            ".style.getPropertyValue('--students-btn-col-w')"
        )
        self.assertTrue(pinned.endswith('px'), f'expected a px width, got {pinned!r}')

    def test_every_row_s_buttons_end_up_the_same_width(self):
        """The point of the property, stated as the user-visible outcome."""
        page = self.visit(STUDENTS_URL)
        widths = page.evaluate(
            "() => Array.from(document.querySelectorAll("
            "'#students-filtered-content .btn-row')).map(el =>"
            " Math.round(el.getBoundingClientRect().width))"
        )
        self.assertGreater(len(widths), 1, 'need at least two rows to compare')
        self.assertEqual(len(set(widths)), 1, f'button rows differ in width: {widths}')
