from django.db.models import Q

from core.models import Staff, Student
from core.school_scope import SchoolScope

# No login system exists yet (see CLAUDE.md), so "current identity" is just a
# client-side choice backed by a cookie, with Benjamin Suri as the fallback
# test identity. Shared here (rather than in hubs.inclusion) because the
# sidebar identity switcher now appears on every hub, not just the
# Inclusion Panel.
CURRENT_STAFF_COOKIE = 'current_staff_id'

# Mirrors CURRENT_STAFF_COOKIE for the sidebar's "current school" switcher.
# Value is 'all', 'primary', 'secondary', or a School.id (as a string).
CURRENT_SCHOOL_COOKIE = 'current_school_key'

# "The switcher isn't pointing at one concrete school." Callers use this to
# decide whether a page can show school-specific chrome (a School column, a
# pilot-module check) or has to show the aggregate view instead.
#
# Both this question and the "is any filtering needed at all" one it is
# constantly mistaken for now live in core.school_scope, as two separately
# named properties - see that module's docstring for why they must not be
# merged. Kept callable here because every caller already looks for it here.


def is_aggregate_school_key(key):
    return SchoolScope(key).is_aggregate


def default_staff():
    return Staff.objects.filter(first_name='Benjamin', last_name='Suri').first()


def current_school_key(request):
    return request.COOKIES.get(CURRENT_SCHOOL_COOKIE) or 'all'


def _staff_matches_school_key(staff, key):
    # Staff with no school, and MAT staff regardless of their school FK, are
    # MAT-wide and are considered compatible with every school/category
    # selection.
    scope = SchoolScope(key)
    if staff.school_id is None or staff.is_mat_staff or scope.selects_every_school:
        return True
    if scope.category:
        return staff.school.category == scope.category
    return str(staff.school_id) == str(scope.school_id)


def staff_queryset_for_school_key(key):
    # Ordered by school name (rather than the model's default last_name
    # ordering) so the sidebar staff overlay can group rows by school with
    # a divider between groups instead of interleaving schools alphabetically
    # by surname.
    qs = Staff.objects.filter(is_active=True).select_related('school').order_by(
        'school__name', 'last_name', 'first_name'
    )
    # MAT-wide for staff is two things, not one: no school at all, or the
    # is_mat_staff flag regardless of which school the FK happens to name.
    return SchoolScope(key).narrow(
        qs, mat_wide=Q(school__isnull=True) | Q(is_mat_staff=True)
    )


def student_queryset_for_school_key(key):
    # Same scoping rules as staff_queryset_for_school_key, but students have
    # no MAT-wide equivalent of is_mat_staff — only school__isnull matches
    # every key.
    qs = Student.objects.filter(is_active=True).select_related('school')
    return SchoolScope(key).narrow(qs, mat_wide=Q(school__isnull=True))


def default_staff_for_school_key(key):
    scope = SchoolScope(key)
    if scope.selects_every_school:
        return default_staff()
    # No mat_wide escape, deliberately: this picks somebody to *be* while a
    # school is selected, and a MAT-wide staff member isn't that person
    # unless nothing else fits - which the fallback below already covers.
    return scope.narrow(Staff.objects.filter(is_active=True)).first() or default_staff()


def current_staff(request):
    staff_id = request.COOKIES.get(CURRENT_STAFF_COOKIE)
    school_key = current_school_key(request)
    if staff_id:
        staff = Staff.objects.filter(pk=staff_id).select_related('school').first()
        if staff is not None and _staff_matches_school_key(staff, school_key):
            return staff
    return default_staff_for_school_key(school_key)
