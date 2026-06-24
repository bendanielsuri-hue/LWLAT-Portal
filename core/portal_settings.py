from core.identity import current_school_key
from core.models import CategorySettings, MatSettings, School

HARDCODED_DEFAULTS = {
    'student_term': 'Student',
    'staff_term': 'Staff',
    'portal_title': 'LWLAT Portal',
    'accent_colour': '',
    'logo_url': '',
    'support_email': '',
    'support_phone': '',
}
FIELDS = list(HARDCODED_DEFAULTS)


def resolve_portal_settings(request):
    # Driven entirely by whichever school is currently selected in the sidebar
    # switcher (core.identity.current_school_key) — the same cookie that already
    # drives data filtering and Module pilot visibility. Deliberately NOT keyed
    # off the viewer's own identity/home school: a MAT staff member who selects
    # "Babington Academy" sees Babington's settings, same as a Babington staff
    # member would.
    key = current_school_key(request)
    school = None
    category = None
    if key in ('primary', 'secondary'):
        category = key.capitalize()
    elif key not in (None, '', 'all'):
        school = School.objects.filter(pk=key).first()
        category = school.category if school else None

    category_row = CategorySettings.objects.filter(category=category).first() if category else None
    mat_row = MatSettings.objects.first()

    resolved = {}
    for field in FIELDS:
        value = (
            (getattr(school, field, '') if school else '')
            or (getattr(category_row, field, '') if category_row else '')
            or (getattr(mat_row, field, '') if mat_row else '')
            or HARDCODED_DEFAULTS[field]
        )
        resolved[field] = value
    return resolved
