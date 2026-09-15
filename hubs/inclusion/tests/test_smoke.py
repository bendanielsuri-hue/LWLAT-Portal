"""The SEND & Provision dashboard renders end to end.

Its KPI cards carry an icon path built as a string in the view and resolved by
the template at render time, so a wrong path is invisible until the page is
actually rendered - see #257, where the icon move left the dashboard raising
TemplateDoesNotExist. The dashboard body is also served on its own as the AJAX
response for a filter change, so both routes are asked for here.
"""

from django.test import TestCase
from django.urls import reverse


class InclusionHubRendersTest(TestCase):
    def test_hub_dashboard_renders(self):
        response = self.client.get(reverse('inclusion_hub'))
        self.assertEqual(response.status_code, 200)

    def test_hub_dashboard_renders_as_an_ajax_fragment(self):
        response = self.client.get(
            reverse('inclusion_hub'), HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )
        self.assertEqual(response.status_code, 200)
