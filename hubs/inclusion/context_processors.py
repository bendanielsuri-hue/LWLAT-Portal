from core.models import Staff

from .views import CURRENT_STAFF_COOKIE


def inclusion_panel_identity(request):
    # Only the Inclusion Panel templates use this; cheap enough to compute on
    # every request rather than threading staff_list through every view.
    if not request.path.startswith('/inclusion/panel/'):
        return {}
    return {
        'inclusion_staff_list': Staff.objects.filter(is_active=True),
        'inclusion_current_staff_id': request.COOKIES.get(CURRENT_STAFF_COOKIE, ''),
    }
