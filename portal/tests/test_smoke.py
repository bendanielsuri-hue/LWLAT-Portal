"""MAT Home renders end to end.

The section cards build their icon path as a string in `_raw_sections()` and
the template resolves it at render time, so a move of the icon files themselves
leaves nothing for a diff or a checker to catch - the path is only wrong once
the page is actually rendered. That shipped once (#257: the icons moved into
the static folders and the two variable-driven icon sites kept building the old
template path), and the page raised TemplateDoesNotExist for everybody.

Asking for the whole page, rather than for the section list, is the point: it
is the render that resolves the icons.
"""

from django.test import TestCase
from django.urls import reverse


class HomeRendersTest(TestCase):
    def test_mat_home_renders(self):
        response = self.client.get(reverse('homepage'))
        self.assertEqual(response.status_code, 200)
