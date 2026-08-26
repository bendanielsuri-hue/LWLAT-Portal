# Page-view logging via middleware, not per-link redirects

To power the home page "Most Used Apps" tray (and a future Portal Admin activity report, read-only on the same data), we needed a record of which pages staff actually open. Considered wrapping every nav/sidebar link in a `/go/<module_key>/` logging redirect, but that only captures clicks on links we remember to wrap — it misses in-page links, direct/bookmarked URLs, and back-button navigation, and requires re-auditing every new link added anywhere in the app.

Decided instead: middleware logs every top-level **GET** request that resolves to a real Django URL name as a `core.models.PageView` (`staff`, `url_name`, timestamp), skipping AJAX/POST/static/`/admin/`/`/portal-admin/` traffic. `url_name` is matched against `Module.key` at query time (same convention `Module` gating already relies on) rather than at write time, so the log stays a complete, unfiltered activity stream and the "does this count as an app" filtering lives entirely in the ranking query, not the write path.

## Considered options

- **Per-link redirect wrapping (`/go/<module_key>/`)**: rejected — only catches instrumented links, silently misses sidebar/local_menu and direct navigation, and needs discipline to keep every new link wrapped.
- **Log only `Module`-matched page views**: rejected — cheaper, but throws away data a future activity report would want (pages with no `Module` row).
