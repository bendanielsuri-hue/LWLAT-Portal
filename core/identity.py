from core.models import Staff

# No login system exists yet (see CLAUDE.md), so "current identity" is just a
# client-side choice backed by a cookie, with Benjamin Suri as the fallback
# test identity. Shared here (rather than in hubs.inclusion) because the
# sidebar identity switcher now appears on every hub, not just the
# Inclusion Panel.
CURRENT_STAFF_COOKIE = 'current_staff_id'


def default_staff():
    return Staff.objects.filter(first_name='Benjamin', last_name='Suri').first()


def current_staff(request):
    staff_id = request.COOKIES.get(CURRENT_STAFF_COOKIE)
    if staff_id:
        staff = Staff.objects.filter(pk=staff_id).first()
        if staff is not None:
            return staff
    return default_staff()
