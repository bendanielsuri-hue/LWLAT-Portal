import logging
from collections import defaultdict

from core.identity import current_school_key, is_aggregate_school_key
from core.models import Module
from core.request_cache import per_request

logger = logging.getLogger(__name__)

# Keys already warned about this process. The staleness guard below fires once
# per tagged item per render - a missing key on a nav entry would otherwise log
# on every sidebar, home section and hub menu, tens of lines per page view, and
# drown its own signal (it did exactly that on the first test run).
_warned_missing_keys = set()

# No login system exists (see CLAUDE.md), so "show me everything" is just a
# client-side choice backed by a cookie, same pattern as core.identity's
# CURRENT_STAFF_COOKIE/CURRENT_SCHOOL_COOKIE.
VIEW_FULL_SYSTEM_COOKIE = 'view_full_system'


def view_full_system(request):
    return request.COOKIES.get(VIEW_FULL_SYSTEM_COOKIE) == '1'


class ModuleMap(dict):
    """Every Module row, keyed by Module.key, plus the indexes callers need.

    A dict subclass rather than a plain dict so the two indexes a visibility
    check needs can travel with the rows they were derived from; both used to
    be rebuilt per check instead of per row set (see #193). Every caller's
    `.get(key)` / `.values()` still works unchanged.

    `by_id` backs the parent-chain walk in `_status_with_cascade`, which used
    to rebuild it on every single visibility check - roughly 37 checks against
    45 modules per page render, all to re-derive something the row set already
    fixes. `pilot_school_ids` is the other, described on its own method.
    """

    def __init__(self, modules):
        modules = list(modules)
        super().__init__({module.key: module for module in modules})
        self.by_id = {module.id: module for module in modules}
        self._pilot_school_ids = None

    def pilot_school_ids(self, module):
        """The School ids piloting `module`, as strings.

        Loaded for every module at once, lazily, on the first pilot check of
        the request - a STATUS_PILOT module otherwise costs one `.exists()`
        query per check, and the same module gets checked from the nav rail,
        Home's sections and the hub's own menu on a single render. Lazy rather
        than prefetched with the rows above because nothing is piloting most
        of the time, and a page with no pilot module should pay nothing.
        """
        if self._pilot_school_ids is None:
            by_module = defaultdict(set)
            for module_id, school_id in Module.pilot_schools.through.objects.values_list(
                'module_id', 'school_id'
            ):
                by_module[module_id].add(str(school_id))
            self._pilot_school_ids = by_module
        return self._pilot_school_ids[module.id]


def module_map(request=None):
    """The Module rows for this request, built once and reused.

    "One query per request" has been this function's stated intent from the
    start but nothing enforced it - the nav rail, Home's sections, the search
    index and every hub's local menu each called it independently, three times
    on a single render. Passing `request` is what makes the claim true; without
    one (a management command, a helper called outside a request) it falls back
    to querying every time, which is the old behaviour.
    """
    return per_request(request, 'module_map', lambda: ModuleMap(Module.objects.all()))


def _status_with_cascade(module, modules):
    # "Hidden cascades down, everything else is evaluated independently" — walk
    # up the parent chain (including the module itself); the instant any
    # ancestor is hidden, the whole branch is hidden regardless of the leaf's
    # own stored status. Traverses via parent_id against the ModuleMap's
    # id-index, so this never issues extra queries.
    node = module
    while node is not None:
        if node.status == Module.STATUS_HIDDEN:
            return Module.STATUS_HIDDEN
        node = modules.by_id.get(node.parent_id)
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
        # data. Default to visible - loud failure beats silently hiding or
        # un-hiding something.
        if module_key not in _warned_missing_keys:
            _warned_missing_keys.add(module_key)
            logger.warning(
                'no Module row for key "%s" - defaulting to visible '
                '(run manage.py seed_modules, or fix the stale module_key)',
                module_key,
            )
        return True

    status = _status_with_cascade(module, modules)
    if status == Module.STATUS_LIVE:
        return True
    if status == Module.STATUS_PILOT:
        key = current_school_key(request)
        if is_aggregate_school_key(key):
            # A pilot module is only visible when one concrete school is
            # selected - there's no "is this piloting anywhere" aggregate.
            return False
        return str(key) in modules.pilot_school_ids(module)
    return False


def filter_by_module(items, modules, request, key_field='module_key'):
    return [item for item in items if is_module_visible(item.get(key_field), modules, request)]


def module_label(module_key, modules, default):
    # Lets Module.name (admin-editable) override a hardcoded Python label
    # without a code change/redeploy, falling back to the hardcoded default
    # before seed_modules has run or for unkeyed items.
    module = modules.get(module_key) if module_key else None
    return module.name if module is not None else default
