"""The base class for tests that drive a real browser.

Everything else in the suite asserts on what a view returns. These assert on
what the browser does with it once the ES modules have run, which is the only
way to cover the behaviour that moved out of panel.js into static/js/ during
the #210/#211 migration: whether a list stacks, whether a badge counts, whether
a module graph even resolves. None of that is visible to the test client.

Not a management command and not a separate runner: a browser test is a
`StaticLiveServerTestCase`, so it runs under `manage.py test` alongside the
rest, gets the same transactional test database, and can seed its world with
the same factories a view test uses. That is the whole reason for preferring
playwright-python here over Node's @playwright/test, which would have had no
way to reach the ORM and would have had to scrape whatever happened to be in a
developer's own db.sqlite3.

Static files are served by StaticLiveServerTestCase's own staticfiles handler
rather than the dev server, so the JS under test is the real file on disk and
`{% static %}` resolves normally even with DEBUG off.

These are slow relative to everything else in the suite - a browser launch plus
a real page load, against ~3ms for a view test - so they carry a `browser` tag:

    manage.py test --exclude-tag=browser    # the fast suite
    manage.py test --tag=browser            # only these
"""

import os
import unittest

# Playwright's sync API drives the browser from inside a greenlet running an
# event loop, which Django's async-safety guard sees as "you are calling the
# ORM from async code" and refuses - every factory call in a browser test
# raises SynchronousOnlyOperation without this. Django documents this variable
# as the escape hatch, and the reason it is safe here is that the guard is
# protecting against concurrent access to a connection: nothing in a browser
# test is actually concurrent, the loop exists only so Playwright can await the
# browser while the test blocks on it. Set at import time because it has to be
# in place before the first ORM call, which is a subclass's setUp.
os.environ.setdefault('DJANGO_ALLOW_ASYNC_UNSAFE', '1')

from django.contrib.staticfiles.testing import StaticLiveServerTestCase  # noqa: E402
from django.test import tag  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - depends on the local environment
    sync_playwright = None


# Wide enough to be unambiguously above every tier in responsive.css's
# breakpoint registry, so a test that doesn't care about width never lands
# accidentally inside a narrow tier's rules.
DESKTOP_VIEWPORT = {'width': 1440, 'height': 900}


@tag('browser')
class BrowserTestCase(StaticLiveServerTestCase):
    """A live-server test with a Chromium page, and console errors captured.

    Subclasses get `self.page` (a fresh browser context per test, so no state
    leaks between them) and `self.visit('/some/path/')`.
    """

    viewport = DESKTOP_VIEWPORT

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if sync_playwright is None:
            raise unittest.SkipTest(
                'playwright is not installed: pip install -r requirements.txt'
            )
        cls._playwright = sync_playwright().start()
        try:
            cls.browser = cls._playwright.chromium.launch()
        except Exception as exc:
            # A missing browser binary is a setup problem on this machine, not
            # a failing assertion about the code, so it skips rather than fails
            # - otherwise a fresh clone reports red tests for an unrun install.
            cls._playwright.stop()
            super().tearDownClass()
            raise unittest.SkipTest(
                f'could not launch Chromium ({exc}). '
                'Run: .venv\\Scripts\\python.exe -m playwright install chromium'
            )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls._playwright.stop()
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.context = self.browser.new_context(viewport=dict(self.viewport))
        self.page = self.context.new_page()
        self.addCleanup(self.context.close)

        # Collected rather than asserted on automatically: most tests want to
        # make the assertion explicitly (assertNoConsoleErrors), and a test
        # deliberately provoking a failure state shouldn't be forced to care.
        self.console_errors = []
        self.page.on('console', self._record_console_message)
        self.page.on('pageerror', lambda exc: self.console_errors.append(str(exc)))

    def _record_console_message(self, message):
        if message.type == 'error':
            self.console_errors.append(message.text)

    def visit(self, path):
        """Load a path on the live server and wait for its modules to run.

        'networkidle' rather than 'load': the entry modules wire themselves on
        DOMContentLoaded and several of them immediately fetch (the facts strip
        measures, the filter bar may re-request), so 'load' can return while
        the page is still assembling itself.
        """
        self.page.goto(f'{self.live_server_url}{path}', wait_until='networkidle')
        return self.page

    def resize(self, width, height=900):
        """Change the viewport and let the resize-path debounces settle.

        list-page.js deliberately debounces its resize refresh by 120ms (a
        measured fix for drag stutter), so anything asserting on a post-resize
        layout has to outwait that or it reads the pre-resize decision.
        """
        self.page.set_viewport_size({'width': width, 'height': height})
        self.page.wait_for_timeout(300)

    def assertNoConsoleErrors(self):
        """Fail with the actual messages, which is most of the diagnosis.

        The failure this is really guarding is a broken ES module import after
        a file moves - that surfaces here as a 404 or a resolution error and
        nowhere else in the suite.
        """
        if self.console_errors:
            joined = '\n  - '.join(self.console_errors)
            self.fail(f'browser console reported errors:\n  - {joined}')
