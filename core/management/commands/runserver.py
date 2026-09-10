"""Dev-server runserver that tells the browser not to cache static files.

Why this exists at all (#202). The dev server serves static with a
``Last-Modified`` header and nothing else - no ``Cache-Control``, no ``ETag``.
With no explicit freshness a browser is free to apply a *heuristic* one
(RFC 9111 section 4.2.2), conventionally about 10% of the time since the file
was last modified. So a file you have not touched in weeks gets a long
freshness window and is then served out of cache with **no request to the
server at all** - not a 304, no request. Measured on ``/inclusion/`` before
this command existed: ``style.css``, ``panel.css`` (669KB), ``panel.js``
(289KB) and every file in the ``@import`` chain all came back with
``transferSize: 0``. Edit one of them and the browser never finds out.

That is the bug the manual ``?v=N`` markers were working around, and it
explains why it felt intermittent - a file edited moments ago has a near-zero
heuristic window and behaves correctly, which is exactly the file you are
usually looking at when you go to check. Bumping ``?v=`` "fixed" it only by
inventing a URL the cache had never seen.

``no-cache`` rather than ``no-store``: it requires the browser to revalidate
every time, but still allows a 304, which the dev server already answers
correctly. That keeps the reload cost at a few hundred bytes per file instead
of re-downloading a megabyte of CSS and JS on every page view.

Why a command override and not middleware: ``runserver`` wraps the WSGI app in
staticfiles' own ``StaticFilesHandler``, which matches the static prefix and
serves the file *before* the Django request/response cycle begins. Middleware
never runs for those responses. Wrapping the handler from the outside is the
one place that sees them.

Only active under DEBUG, which is the only situation in which this handler
serves static at all.
"""

from django.conf import settings
from django.contrib.staticfiles.management.commands.runserver import (
    Command as StaticfilesRunserverCommand,
)


def add_no_cache_headers(application, static_prefix):
    """WSGI wrapper: force revalidation on anything under the static prefix."""

    def wrapped(environ, start_response):
        def start_response_with_no_cache(status, headers, exc_info=None):
            if environ.get("PATH_INFO", "").startswith(static_prefix):
                headers = [
                    (name, value)
                    for name, value in headers
                    if name.lower() != "cache-control"
                ]
                headers.append(("Cache-Control", "no-cache, must-revalidate"))
            return start_response(status, headers, exc_info)

        return application(environ, start_response_with_no_cache)

    return wrapped


class Command(StaticfilesRunserverCommand):
    def get_handler(self, *args, **options):
        handler = super().get_handler(*args, **options)
        if not settings.DEBUG:
            return handler
        return add_no_cache_headers(handler, settings.STATIC_URL or "/static/")
