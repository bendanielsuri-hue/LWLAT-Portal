from core.identity import current_staff
from core.models import PageView

# Prefixes never logged as page views - dev/admin tooling, not a real staff
# navigation event. Static/media requests are excluded implicitly instead:
# they never resolve to a Django url_name (see resolver_match check below).
_EXCLUDED_PATH_PREFIXES = ('/admin/', '/portal-admin/')


class PageViewLoggingMiddleware:
    # Logs one core.models.PageView per top-level GET page load - see
    # docs/adr/0014-page-view-logging-via-middleware.md for why this is
    # middleware rather than per-link redirect wrapping. AJAX/POST/static/
    # admin traffic is deliberately not logged, so the table stays a clean
    # "which pages did a human navigate to" record.
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        self._log(request, response)
        return response

    def _log(self, request, response):
        if request.method != 'GET' or response.status_code != 200:
            return
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return
        if any(request.path.startswith(prefix) for prefix in _EXCLUDED_PATH_PREFIXES):
            return
        url_name = getattr(request.resolver_match, 'url_name', None)
        if not url_name:
            return
        staff = current_staff(request)
        if staff is None:
            return
        PageView.objects.create(staff=staff, url_name=url_name)
