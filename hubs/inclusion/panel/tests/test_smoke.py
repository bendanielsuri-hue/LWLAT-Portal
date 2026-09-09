"""Every panel page renders, and does so against the shared stylesheet.

This is the safety net the app didn't have: with no tests at all, a template
edit that broke one page only showed up when somebody opened that page. Every
panel template is touched by roughly every UI change, so a cheap "they all
still return 200" check catches the class of error (a bad block name, a
renamed context key, a missing include) that would otherwise ship.

The panel.css assertion pins the fix for the version fan-out: the link used to
be copied into all 15 templates with its own manual ?v=N and six of them had
drifted ~206 revisions behind. It now lives once in _base.html, and a page that
overrides `extra_head` instead of `panel_extra_head` would silently drop off
the stylesheet again - which looks fine in a diff and wrong in a browser.
"""

from django.test import TestCase
from django.urls import reverse

from .factories import build_panel_world


class PanelPagesSmokeTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.world = build_panel_world(referral_count=2)

    # Full pages: extend _base.html, so they carry the whole chrome.
    FULL_PAGE_ROUTES = [
        'inclusion_panel',
        'inclusion_panel_students',
        'inclusion_panel_referrals',
        'inclusion_panel_actions',
        'inclusion_panel_escalations',
        'inclusion_panel_meetings',
        'inclusion_panel_safeguarding_notes',
        'inclusion_panel_referral_question_settings',
        'inclusion_panel_action_category_settings',
        'inclusion_panel_group_settings',
        'inclusion_panel_expertise_settings',
    ]

    # Modal fragments: rendered into a page that already has the chrome, so
    # they have no <head> of their own and must NOT link the stylesheet.
    FRAGMENT_ROUTES = [
        'inclusion_panel_group_new',
        'inclusion_panel_meeting_new',
    ]

    NO_ARG_ROUTES = FULL_PAGE_ROUTES + FRAGMENT_ROUTES

    def test_no_arg_pages_render(self):
        for name in self.NO_ARG_ROUTES:
            with self.subTest(route=name):
                response = self.client.get(reverse(name))
                self.assertEqual(response.status_code, 200)

    def test_panel_id_pages_render(self):
        panel_id = self.world.panel.pk
        for name in ('inclusion_panel_meeting_setup', 'inclusion_panel_meeting_agenda'):
            with self.subTest(route=name):
                response = self.client.get(reverse(name, args=[panel_id]))
                self.assertEqual(response.status_code, 200)

    def test_discussion_page_renders(self):
        response = self.client.get(
            reverse('inclusion_panel_discussion', args=[self.world.panel_referral.pk])
        )
        self.assertEqual(response.status_code, 200)

    def test_escalate_form_renders(self):
        response = self.client.get(
            reverse('inclusion_panel_referral_escalate', args=[self.world.referral.pk])
        )
        self.assertEqual(response.status_code, 200)

    def test_every_full_page_links_the_shared_stylesheet(self):
        # One owner for the version (_base.html). A page that overrides
        # extra_head instead of panel_extra_head drops off it silently.
        for name in self.FULL_PAGE_ROUTES:
            with self.subTest(route=name):
                response = self.client.get(reverse(name))
                self.assertContains(response, 'css/panel.css?v=')

    def test_fragments_carry_no_stylesheet_of_their_own(self):
        # The other half of the same rule: a fragment is injected into a page
        # that already has the chrome, so linking the stylesheet again here
        # would refetch it mid-interaction.
        for name in self.FRAGMENT_ROUTES:
            with self.subTest(route=name):
                response = self.client.get(reverse(name))
                self.assertNotContains(response, 'css/panel.css')
