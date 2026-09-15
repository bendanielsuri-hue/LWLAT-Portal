"""One value per request, for the things every page asks for more than once.

Seven context processors plus the view rebuild the same nav ingredients on a
single render (see #193): the Module table, the resolved portal settings, the
current staff member, and Home's section list. Each of those is a plain
function taking `request`, which reads as cheap at the call site and is not -
`core.modules.module_map` has documented "one query per request" as its intent
since it was written, while the context-processor wiring silently called it
three times. The seam was always "once per request"; nothing was holding it.

This holds it. `per_request(request, key, build)` runs `build` the first time a
key is asked for on a given request and hands back the same object for every
later ask on that request, so callers stay plain function calls and none of
them has to know whether it is the first one.

Caching is scoped to a single request deliberately, not to the process. Every
value cached through here is derived from either a cookie the switchers set
client-side before reloading (current school, current identity - so it cannot
change mid-request) or from rows only Portal Admin edits, and those edits are
POSTs that redirect rather than render. A longer-lived cache would have to
answer invalidation questions that a per-request one simply does not have.
"""

_CACHE_ATTR = '_portal_request_cache'


def per_request(request, key, build):
    """`build()`'s result for this request, computed at most once.

    `request` may be None - management commands and a few helpers call into
    this code outside a request/response cycle, and there is nowhere to hang a
    cache in that case, so the value is simply built each time.

    Membership rather than truthiness decides whether the value is cached, so
    a legitimately empty result (no Module rows seeded yet, no current staff)
    is remembered instead of being rebuilt on every ask.
    """
    if request is None:
        return build()
    cache = getattr(request, _CACHE_ATTR, None)
    if cache is None:
        cache = {}
        setattr(request, _CACHE_ATTR, cache)
    if key not in cache:
        cache[key] = build()
    return cache[key]
