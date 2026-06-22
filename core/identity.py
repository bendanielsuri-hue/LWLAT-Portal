from django.db.models import Q

from core.models import Staff

# No login system exists yet (see CLAUDE.md), so "current identity" is just a
# client-side choice backed by a cookie, with Benjamin Suri as the fallback
# test identity. Shared here (rather than in hubs.inclusion) because the
# sidebar identity switcher now appears on every hub, not just the
# Inclusion Panel.
CURRENT_STAFF_COOKIE = 'current_staff_id'

# Mirrors CURRENT_STAFF_COOKIE for the sidebar's "current school" switcher.
# Value is 'all', 'primary', 'secondary', or a School.id (as a string).
CURRENT_SCHOOL_COOKIE = 'current_school_key'


def default_staff():
    return Staff.objects.filter(first_name='Benjamin', last_name='Suri').first()


def current_school_key(request):
    return request.COOKIES.get(CURRENT_SCHOOL_COOKIE) or 'all'


def _staff_matches_school_key(staff, key):
    # Staff with no school are MAT-wide and are considered compatible with
    # every school/category selection.
    if staff.school_id is None or key in (None, '', 'all'):
        return True
    if key == 'primary':
        return staff.school.category == 'Primary'
    if key == 'secondary':
        return staff.school.category == 'Secondary'
    return str(staff.school_id) == str(key)


def staff_queryset_for_school_key(key):
    # Ordered by school name (rather than the model's default last_name
    # ordering) so the sidebar staff overlay can group rows by school with
    # a divider between groups instead of interleaving schools alphabetically
    # by surname.
    qs = Staff.objects.filter(is_active=True).select_related('school').order_by(
        'school__name', 'last_name', 'first_name'
    )
    if key in (None, '', 'all'):
        return qs
    if key == 'primary':
        return qs.filter(Q(school__isnull=True) | Q(school__category='Primary'))
    if key == 'secondary':
        return qs.filter(Q(school__isnull=True) | Q(school__category='Secondary'))
    return qs.filter(Q(school__isnull=True) | Q(school_id=key))


def default_staff_for_school_key(key):
    if key in (None, '', 'all'):
        return default_staff()
    if key == 'primary':
        scoped = Staff.objects.filter(is_active=True, school__category='Primary')
    elif key == 'secondary':
        scoped = Staff.objects.filter(is_active=True, school__category='Secondary')
    else:
        scoped = Staff.objects.filter(is_active=True, school_id=key)
    return scoped.first() or default_staff()


def current_staff(request):
    staff_id = request.COOKIES.get(CURRENT_STAFF_COOKIE)
    school_key = current_school_key(request)
    if staff_id:
        staff = Staff.objects.filter(pk=staff_id).select_related('school').first()
        if staff is not None and _staff_matches_school_key(staff, school_key):
            return staff
    return default_staff_for_school_key(school_key)
