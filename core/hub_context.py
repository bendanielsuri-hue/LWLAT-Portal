"""The context every hub sidebar needs, built once instead of per hub.

`templates/hubs/_hub_sidebar.html` reads exactly two keys - `hub_title` and
`local_menu` - and a view that forgets either renders a blank title over an
empty list with no error and no warning. Six hubs each carried their own
private four-line `_hub_context()` to satisfy that unenforced interface, and
the copies did not stay copies: Careers inlined the dict and never called
`filter_by_module`, so its menu was not module-gated at all, and Portal Admin
froze its dict into a module-level constant evaluated once at import, so it
could never be gated either. Neither divergence was a decision; both were
what happens when a shared shape is pasted rather than imported.

So the shape lives here once. `portal.context_processors.hub_icon` already
made this argument for the third sidebar key - resolved centrally "so adding
a hub can't forget to set it" - and the same argument covers the other two.

Anything a particular hub needs on top (the Inclusion Panel's back-to-hub
link, say) rides in as a keyword argument rather than forking the helper.
"""

from core.modules import filter_by_module, request_module_map


def hub_context(request, menu, title, **extra):
    """Sidebar context for a hub page: its module-gated menu and its title.

    `menu` is the hub's own `<HUB>_MENU` list of `{name, url, icon,
    module_key}` entries; entries carrying no `module_key` are always visible,
    which is how Portal Admin's developer-only menu stays ungated.
    """
    return {
        'local_menu': filter_by_module(menu, request_module_map(request), request),
        'hub_title': title,
        **extra,
    }
