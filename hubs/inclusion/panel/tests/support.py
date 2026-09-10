"""Shared base for tests that drive a panel view.

Panel views sweep time-based transitions while serving a read
(`reconcile.reconcile_on_read`), which means a view can rewrite a panel's
status inside the very request a test is asserting on. That is not a
hypothetical: `make_panel()` defaults to today with no time, i.e. scheduled at
midnight, so by the time any test runs it is already overdue and the sweep
flips it to 'delayed'. A test that POSTed 'toggle_ready' and asked for 'ready'
got 'delayed' back, and the failure pointed at the dispatch code, which was
correct.

Subclass this instead of TestCase for anything that goes through the test
client. Reconciliation is exercised on its own terms in test_reconcile.py, by
calling `reconcile_panels(now=...)` with a fixed clock - which is the only way
it was ever meant to be tested.
"""

from django.test import TestCase, override_settings


@override_settings(PANEL_RECONCILE_ON_READ=False)
class PanelViewTestCase(TestCase):
    """A TestCase whose requests don't sweep panels while they read them."""
