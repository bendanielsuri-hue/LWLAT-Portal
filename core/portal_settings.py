from core.identity import current_school_key
from core.models import CategorySettings, MatSettings, PortalSettingsFields, School
from core.request_cache import per_request
from core.school_scope import SchoolScope

# The last tier of the fallthrough, below MAT. Only the fields with a real
# portal-wide meaning appear here; every other field's floor is the empty
# string, which is also what "no override anywhere" already looks like at the
# three DB tiers. Deliberately not a copy of the field list - that comes from
# the model (FIELDS below), so adding a field is one edit, in core.models.
HARDCODED_DEFAULTS = {
    'student_term': 'Student',
    'staff_term': 'Staff',
    'portal_title': 'LWLAT Data Portal',
}

# Derived from the abstract model every tier inherits, so a field added there
# is resolved here without a second, hand-kept list to forget (#195).
FIELDS = [f.name for f in PortalSettingsFields._meta.fields]


def resolve_portal_settings(request):
    # Driven entirely by whichever school is currently selected in the sidebar
    # switcher (core.identity.current_school_key) — the same cookie that already
    # drives data filtering and Module pilot visibility. Deliberately NOT keyed
    # off the viewer's own identity/home school: a MAT staff member who selects
    # "Babington Academy" sees Babington's settings, same as a Babington staff
    # member would.
    #
    # Resolved once per request: the portal_settings context processor and
    # Home's build_sections both want it, and the cookie it keys off cannot
    # change mid-request (see core.request_cache).
    return per_request(request, 'portal_settings', lambda: _resolve(request))


def _resolve(request):
    scope = SchoolScope(current_school_key(request))
    school = None
    category = scope.category
    if scope.school_id is not None:
        school = School.objects.filter(pk=scope.school_id).first()
        category = school.category if school else None

    category_row = CategorySettings.objects.filter(category=category).first() if category else None
    mat_row = MatSettings.objects.first()

    resolved = {}
    for field in FIELDS:
        # getattr with no default on purpose: every tier inherits the same
        # abstract model, so a name in FIELDS that a tier does not have is a
        # bug that should raise here rather than quietly resolve to blank and
        # fall through to the next tier.
        value = (
            (getattr(school, field) if school else '')
            or (getattr(category_row, field) if category_row else '')
            or (getattr(mat_row, field) if mat_row else '')
            or HARDCODED_DEFAULTS.get(field, '')
        )
        resolved[field] = value
    return resolved


def request_portal_settings(request):
    """The resolved settings for `request`. Alias of `resolve_portal_settings`.

    Same arrangement as `core.modules.request_module_map`: the caching lives in
    `core.request_cache` rather than in a second per-module attribute, and this
    name stays because it says at the call site that the once-per-request
    version is the one being asked for.
    """
    return resolve_portal_settings(request)
