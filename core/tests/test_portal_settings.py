"""The School -> Category -> MAT -> hardcoded fallthrough, per field.

ADR 0003's decision is that each of the seven portal-chrome settings resolves
*independently* and is keyed off the school currently selected in the sidebar
switcher, not off the viewer. Both halves render perfectly when they are wrong
- a fallthrough that stops one tier early just shows the MAT's wording where a
school's should be - so the branches are asserted here rather than eyeballed.

The declaration-drift class guards the other half of #195: the seven fields
are declared once, on an abstract base, and the resolver's field list is
derived from it. A future eighth field must reach all three tiers and the
resolver without anyone remembering to add it in four places.
"""

from django.test import RequestFactory, TestCase

from core.identity import CURRENT_SCHOOL_COOKIE
from core.models import (
    CategorySettings, MatSettings, PortalSettingsFields, School,
)
from core.portal_settings import FIELDS, HARDCODED_DEFAULTS, resolve_portal_settings

rf = RequestFactory()


def resolve(school_key=None):
    request = rf.get('/')
    if school_key is not None:
        request.COOKIES[CURRENT_SCHOOL_COOKIE] = school_key
    return resolve_portal_settings(request)


class DeclarationTest(TestCase):
    """One declaration, three tables, no hand-kept list."""

    def test_every_tier_carries_every_field(self):
        for model in (School, CategorySettings, MatSettings):
            names = {f.name for f in model._meta.fields}
            self.assertEqual(set(FIELDS) - names, set(), model.__name__)

    def test_the_resolver_field_list_is_the_abstract_model(self):
        self.assertEqual(FIELDS, [f.name for f in PortalSettingsFields._meta.fields])

    def test_the_hardcoded_defaults_are_not_a_second_field_list(self):
        # A field with no portal-wide meaning has no entry at all; its floor is
        # the empty string. So the dict must not have to grow with the model.
        self.assertEqual(set(HARDCODED_DEFAULTS) - set(FIELDS), set())

    def test_a_resolution_covers_every_declared_field(self):
        self.assertEqual(set(resolve('all')), set(FIELDS))


class FallthroughTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.primary = School.objects.create(name='Heatherbrook', category='Primary')
        cls.secondary = School.objects.create(name='Babington', category='Secondary')

    def test_unset_everywhere_falls_all_the_way_to_the_hardcoded_default(self):
        self.assertEqual(resolve(str(self.primary.pk))['student_term'], 'Student')

    def test_a_field_with_no_hardcoded_entry_resolves_blank(self):
        self.assertEqual(resolve(str(self.primary.pk))['support_phone'], '')

    def test_mat_beats_the_hardcoded_default(self):
        MatSettings.objects.create(student_term='Scholar')
        self.assertEqual(resolve(str(self.primary.pk))['student_term'], 'Scholar')

    def test_category_beats_mat(self):
        MatSettings.objects.create(student_term='Scholar')
        CategorySettings.objects.create(category='Primary', student_term='Pupil')
        self.assertEqual(resolve(str(self.primary.pk))['student_term'], 'Pupil')

    def test_school_beats_category_and_mat(self):
        MatSettings.objects.create(student_term='Scholar')
        CategorySettings.objects.create(category='Primary', student_term='Pupil')
        self.primary.student_term = 'Learner'
        self.primary.save()
        self.assertEqual(resolve(str(self.primary.pk))['student_term'], 'Learner')

    def test_a_category_override_does_not_leak_to_the_other_category(self):
        MatSettings.objects.create(student_term='Scholar')
        CategorySettings.objects.create(category='Primary', student_term='Pupil')
        self.assertEqual(resolve(str(self.secondary.pk))['student_term'], 'Scholar')

    def test_each_field_falls_through_independently(self):
        # The failure this guards: one tier answering for the whole row, so a
        # school that overrides a single field loses the rest of its
        # inheritance.
        MatSettings.objects.create(student_term='Scholar', staff_term='Colleague',
                                   portal_title='MAT Portal')
        CategorySettings.objects.create(category='Primary', staff_term='Teacher')
        self.primary.student_term = 'Learner'
        self.primary.save()
        resolved = resolve(str(self.primary.pk))
        self.assertEqual(resolved['student_term'], 'Learner')    # School
        self.assertEqual(resolved['staff_term'], 'Teacher')      # Category
        self.assertEqual(resolved['portal_title'], 'MAT Portal')  # MAT
        self.assertEqual(resolved['support_phone'], '')           # hardcoded

    def test_a_blank_string_means_inherit_not_override(self):
        MatSettings.objects.create(student_term='Scholar')
        self.primary.student_term = ''
        self.primary.save()
        self.assertEqual(resolve(str(self.primary.pk))['student_term'], 'Scholar')


class SelectedSchoolKeyTest(TestCase):
    """Which key the cascade starts from - ADR 0003's other half."""

    @classmethod
    def setUpTestData(cls):
        cls.primary = School.objects.create(
            name='Heatherbrook', category='Primary', student_term='Learner',
        )
        MatSettings.objects.create(student_term='Scholar', staff_term='Colleague')
        CategorySettings.objects.create(category='Primary', staff_term='Teacher')

    def test_all_skips_the_category_tier_entirely(self):
        # There is no single category to resolve, so 'all' goes straight to MAT.
        self.assertEqual(resolve('all')['staff_term'], 'Colleague')

    def test_a_category_key_resolves_the_category_tier(self):
        self.assertEqual(resolve('primary')['staff_term'], 'Teacher')

    def test_a_category_key_never_picks_up_a_school_override(self):
        self.assertEqual(resolve('primary')['student_term'], 'Scholar')

    def test_no_cookie_behaves_as_all(self):
        self.assertEqual(resolve(), resolve('all'))

    def test_an_unknown_school_id_falls_back_to_mat(self):
        self.assertEqual(resolve('999999')['student_term'], 'Scholar')

    def test_the_selected_school_decides_not_the_viewer(self):
        # A MAT-wide viewer with no school of their own still gets the selected
        # school's chrome, which is the whole point of keying off the switcher.
        self.assertEqual(resolve(str(self.primary.pk))['student_term'], 'Learner')
