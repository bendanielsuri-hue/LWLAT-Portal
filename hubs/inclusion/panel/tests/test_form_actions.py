"""The POST vocabulary agrees across Python, the templates and panel.js.

`form_action` is the contract between three languages with nothing joining them
but the string itself. There is no compiler, no type and - until now - no test,
so renaming an action meant grepping three languages and hoping.

These tests read the literals back out of the templates and the JS and compare
them with form_actions.ALL, so a rename that misses one of the three fails here
rather than at a click in production.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from hubs.inclusion.panel import form_actions

PANEL_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = PANEL_DIR / 'templates' / 'hubs' / 'inclusion' / 'panel'
PANEL_JS = PANEL_DIR / 'static' / 'js' / 'panel.js'
VIEWS_PY = PANEL_DIR / 'views.py'

# <input type="hidden" name="form_action" value="start_meeting">
TEMPLATE_LITERAL = re.compile(r'name="form_action"[^>]*?value="([a-z_]+)"')
# ...and the attribute order the other way round.
TEMPLATE_LITERAL_REVERSED = re.compile(r'value="([a-z_]+)"[^>]*?name="form_action"')
# form_action: 'reorder_agenda'  /  formData.append('form_action', 'x')
JS_LITERAL = re.compile(r"form_action['\"]?\s*[:,]\s*['\"]([a-z_]+)['\"]")
# A dispatch comparing against a bare string instead of a constant:
#   if action == 'toggle_ready'      /  elif action in ('add_referral', ...)
VIEW_LITERAL_DISPATCH = re.compile(r"\baction\s+(?:==|in)\s+\(?\s*'([a-z_]+)'")
# Any form_action value, including one built by template tags.
TEMPLATE_COMPUTED_VALUE = re.compile(r'name="form_action"[^>]*?value="([^"]*)"')
DJANGO_TAG = re.compile(r'{%.*?%}|{{.*?}}')
ACTION_WORD = re.compile(r'[a-z_]+')


def template_actions():
    found = set()
    for path in TEMPLATE_DIR.glob('*.html'):
        text = path.read_text(encoding='utf-8')
        found.update(TEMPLATE_LITERAL.findall(text))
        found.update(TEMPLATE_LITERAL_REVERSED.findall(text))
        # A value chosen by a template conditional rather than written flat:
        #   value="{% if ... %}add_followup_to_agenda{% else %}add_referral{% endif %}"
        # The [a-z_]+ patterns above can't see either name, which is how both
        # of those actions stayed undeclared while every test still passed.
        # Strip the tags, keep what's left.
        for raw in TEMPLATE_COMPUTED_VALUE.findall(text):
            found.update(ACTION_WORD.findall(DJANGO_TAG.sub(' ', raw)))
        # Templates carry inline <script> blocks that post the same vocabulary
        # from a fetch body rather than a hidden input - meeting_setup.html's
        # chair autosave is one. Scanning only for hidden inputs misses those,
        # which is precisely the third-language blind spot this file exists to
        # close.
        found.update(JS_LITERAL.findall(text))
    return found


def js_actions():
    return set(JS_LITERAL.findall(PANEL_JS.read_text(encoding='utf-8')))


class FormActionVocabularyTest(SimpleTestCase):
    def test_every_template_literal_is_a_declared_action(self):
        unknown = template_actions() - form_actions.ALL
        self.assertEqual(
            unknown, set(),
            f'Templates post form_action values not declared in form_actions.py: {sorted(unknown)}',
        )

    def test_every_js_literal_is_a_declared_action(self):
        unknown = js_actions() - form_actions.ALL
        self.assertEqual(
            unknown, set(),
            f'panel.js posts form_action values not declared in form_actions.py: {sorted(unknown)}',
        )

    def test_every_declared_action_is_actually_posted_somewhere(self):
        # Stops the list rotting into a graveyard of names the app no longer
        # sends. An action handled only server-side with no sender is dead code
        # on both sides.
        posted = template_actions() | js_actions()
        orphans = form_actions.ALL - posted
        self.assertEqual(
            orphans, set(),
            f'Declared actions nothing posts: {sorted(orphans)}',
        )

    def test_every_posted_action_has_a_handler(self):
        # The other direction: a form that posts an action no view branches on
        # is a button that silently does nothing.
        views = VIEWS_PY.read_text(encoding='utf-8')
        for action in sorted(template_actions() | js_actions()):
            with self.subTest(action=action):
                referenced = (
                    f"'{action}'" in views
                    or f'form_actions.{action.upper()}' in views
                )
                self.assertTrue(referenced, f'No view handles form_action {action!r}')

    def test_the_constants_match_their_own_names(self):
        # A copy-paste slip (TOGGLE_READY = 'toggle_group_member_active') would
        # otherwise be invisible - every other test here would still pass.
        for name in dir(form_actions):
            if name.isupper() and name != 'ALL':
                value = getattr(form_actions, name)
                with self.subTest(constant=name):
                    self.assertEqual(value, name.lower())

    def test_the_views_dispatch_on_constants_not_bare_strings(self):
        """The blind spot the other tests leave open.

        test_every_posted_action_has_a_handler accepts a raw literal in
        views.py as proof of a handler, so an action dispatched as
        `action == 'add_referral'` satisfies it while never appearing in
        form_actions.py at all - which is exactly how add_referral and
        add_followup_to_agenda stayed undeclared, and how the four
        attendance actions kept a second, literal spelling of names that
        already had constants. Renaming either would have left the
        constant, the template and the JS agreeing perfectly and the view
        quietly matching nothing.
        """
        literals = set(VIEW_LITERAL_DISPATCH.findall(VIEWS_PY.read_text(encoding='utf-8')))
        self.assertEqual(
            literals, set(),
            'views.py dispatches on bare form_action strings instead of '
            f'form_actions constants: {sorted(literals)}',
        )
