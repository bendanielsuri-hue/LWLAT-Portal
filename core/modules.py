from core.identity import current_school_key
from core.models import Module

# No login system exists (see CLAUDE.md), so "show me everything" is just a
# client-side choice backed by a cookie, same pattern as core.identity's
# CURRENT_STAFF_COOKIE/CURRENT_SCHOOL_COOKIE.
VIEW_FULL_SYSTEM_COOKIE = 'view_full_system'


def view_full_system(request):
    return request.COOKIES.get(VIEW_FULL_SYSTEM_COOKIE) == '1'


def module_map():
    # One query per request, passed around by callers rather than re-queried per
    # item — building this once is the caller's job (avoids N+1 across the nav
    # rail, home sections, and every hub's local menu).
    return {module.key: module for module in Module.objects.all()}


def _status_with_cascade(module, modules):
    # "Hidden cascades down, everything else is evaluated independently" — walk
    # up the parent chain (including the module itself); the instant any
    # ancestor is hidden, the whole branch is hidden regardless of the leaf's
    # own stored status. Traverses via parent_id against an id-index built from
    # the already-loaded `modules` dict, so this never issues extra queries.
    by_id = {m.id: m for m in modules.values()}
    node = module
    while node is not None:
        if node.status == Module.STATUS_HIDDEN:
            return Module.STATUS_HIDDEN
        node = by_id.get(node.parent_id)
    return module.status


def is_module_visible(module_key, modules, request):
    if module_key is None:
        return True
    if view_full_system(request):
        return True

    module = modules.get(module_key)
    if module is None:
        # Staleness guard: a tagged module_key with no seeded Module row most
        # likely means a Django URL name was renamed without updating the seed
        # data. Default to visible (loud failure beats silently hiding or
        # un-hiding something) but warn since this codebase has no logger.
        print(f'core.modules: no Module row for key "{module_key}" — defaulting to visible')
        return True

    status = _status_with_cascade(module, modules)
    if status == Module.STATUS_LIVE:
        return True
    if status == Module.STATUS_PILOT:
        key = current_school_key(request)
        if key in (None, '', 'all', 'primary', 'secondary'):
            return False
        return module.pilot_schools.filter(pk=key).exists()
    return False


def filter_by_module(items, modules, request, key_field='module_key'):
    return [item for item in items if is_module_visible(item.get(key_field), modules, request)]


def module_label(module_key, modules, default):
    # Lets Module.name (admin-editable) override a hardcoded Python label
    # without a code change/redeploy, falling back to the hardcoded default
    # before seed_modules has run or for unkeyed items.
    module = modules.get(module_key) if module_key else None
    return module.name if module is not None else default
