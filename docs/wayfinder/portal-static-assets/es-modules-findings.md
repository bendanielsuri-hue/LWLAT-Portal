# ES modules in Django: what the prototype took, and what was decided

Decision record for [#202](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/202), under the
map [#198](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/198).

The prototype lived on the throwaway branch `prototype/es-modules-202` (`b7bfccd`), which is not for
merge and may be deleted. This file is the part that had to outlive it. The prototype converted
`wireScrollCarousel` (`static/js/main.js:840`) into a real two-level module chain and loaded it on
the real SEND & Provision hub page, driving the real SENCo carousel:

```
static/js/proto-modules/entry-hub.js      entry, <script type="module">
  └── carousel.js                          wireScrollCarousel, verbatim
        └── raf-throttle.js                leaf
```

Two levels deliberately: one level would not exercise the cache-bust question, which is entirely
about whether a version marker on the entry reaches what it pulls in transitively.

Measured on Django **5.2.15** (the venv) and re-checked against **6.0.6** (what `requirements.txt`
pins) by reading its source: the `HashedFilesMixin` `patterns` tuple,
`_js_module_import_aggregation_patterns` and `support_js_module_import_aggregation = False` are
byte-identical across the two versions, so every finding below holds on the version this project
declares. (The venv/requirements mismatch is real and worth resolving; it does not affect these
results.)

---

## Decisions

1. **ES modules stay the direction, but not for the reasons #198 recorded.** #198 chose them to fix
   hand-managed load order and `?v=N` proliferation. Load order was never visibly broken (section 3)
   and `?v=N` belonged to a dev-server header (section 1). What modules genuinely buy this codebase
   is that **an import graph is the machine-readable form of "what depends on what"** — the question
   nobody could answer about these files before #200, and what makes #201's promotion list
   checkable rather than asserted. #205 states that reason when it writes the convention.
2. **The `?v=N` discipline is retired, fixed at the cause** — `core/management/commands/runserver.py`
   now sends `Cache-Control` for static under DEBUG. Landed, along with the deletion of all 24
   markers. Section 1.
3. **Never enable `support_js_module_import_aggregation`.** It corrupts files in this codebase, on
   both 5.2 and 6.0, driven by comment prose. Section 2b — read it before anyone is tempted.
4. **Manifest hashing is a deployment-time decision, not a now decision.** There is no deployment,
   so it is not in this project's path today. Section 2 records what will be true when it is.
5. **The CSS `@import` chain stays.** Its correctness problem was the `?v=` one, now gone; the only
   remaining cost is serial fetches, which does not matter under DEBUG, and `ManifestStaticFilesStorage`
   already rewrites `@import` correctly for the day there is a deploy. Revisit then, on measurement.
6. **Per-page vs per-hub vs portal-wide entry points is deferred to #204**, where the duplication is
   visible in the file list. Section 4 says what the prototype could and could not settle.

---

## 1. The reframe: this was a dev-server caching problem

Written first because it changes what the rest of this document is worth.

There is no production deployment, `DEBUG = True`, there is no whitenoise and no `STATIC_ROOT`. So
`collectstatic` and manifest hashing — the subject of section 2 — are **not in this project's path
today**. Which raised the question of what the `?v=N` discipline was actually protecting against.

The dev server returns **no `Cache-Control` and no `ETag`** on static files. Only `Last-Modified`:

```
HTTP/1.1 200 OK
Content-Type: text/css
Last-Modified: Thu, 10 Sep 2026 07:53:48 GMT
```

With no explicit freshness, a browser applies a **heuristic** (RFC 9111 §4.2.2) — conventionally 10%
of the time since `Last-Modified`. A file untouched for weeks therefore gets a long freshness window
and is served **without any request at all**.

Measured live on `/inclusion/` via resource timing (`transferSize: 0` with a non-zero body = served
from cache, no network request, not even a 304):

| File | transferSize | body | |
| --- | --- | --- | --- |
| `css/style.css?v=519` | **0** | 1,477 | no request made |
| `css/panel.css?v=107` | **0** | 669,746 | no request made |
| `js/panel.js?v=14` | **0** | 289,074 | no request made |
| every CSS partial in the chain | **0** | — | no request made |
| `js/main.js?v=286` | 300 | 308,679 | revalidated (304) |

Twenty of twenty-three static assets served blind. `main.js` revalidated only because it had been
edited minutes earlier, so its heuristic freshness was near zero. **That is the whole footgun**, and
it explains why it felt intermittent: a file you just touched behaves correctly, a file you haven't
touched in a while is served blind — and the file you just touched is exactly the one you are
looking at when you go to check. Bumping `?v=N` "fixed" it only by creating a URL the cache had
never seen.

Fixed at the cause in `core/management/commands/runserver.py`, which sends
`Cache-Control: no-cache, must-revalidate` for static under DEBUG; every `?v=` marker deleted with
it. That file's module docstring carries the mechanism and the two non-obvious constraints (why a
command override rather than middleware, and why `core` must sit above `django.contrib.staticfiles`
in `INSTALLED_APPS`).

**What this cost #198:** `?v=N` proliferation was one of the two reasons it chose ES modules. That
reason belonged to a different problem with a much cheaper fix. See decision 1.

---

## 2. Cache-busting under modules, for when there is a deployment

### 2a. Modules make a hand-maintained `?v=N` scheme strictly worse

Confirmed by inspecting what the browser fetches. The prototype template carried:

```html
<script type="module" src="{% static 'js/proto-modules/entry-hub.js' %}?v=1"></script>
```

`?v=1` versions **that file and nothing else**. `entry-hub.js` imports `'./carousel.js'` by bare
relative path, and `carousel.js` imports `'./raf-throttle.js'`. Neither carries a query string and
neither can — the specifier is written in JS, not in the template, so `{% static %}` never sees it.

So under modules, editing `carousel.js` would be invisible to a returning browser until *its own* URL
changed, and there is no template line to bump. That is the old CSS `@import` footgun reproduced in
JS and worse, because in CSS at least both markers sat in files a human edits. **A hand-maintained
`?v=N` discipline could not have survived the move to modules** — which is moot now that section 1
removed the discipline entirely, but it is why something automatic is required at deployment time.

### 2b. Django's manifest hashing does not rewrite module imports, and the opt-in that would **crashes on this codebase**

`ManifestStaticFilesStorage` post-processing patterns:

| Extension | Rewrites |
| --- | --- |
| `*.css` | `url()`, `@import`, `sourceMappingURL` |
| `*.js` | `sourceMappingURL` **only** |

Ran `collectstatic` over the real tree (166 files, all post-processed, no errors):

```
entry-hub.f6f45b43d990.js   →  still contains  import … from './carousel.js';
carousel.a099755b8b16.js    →  still contains  import { rafThrottle } from './raf-throttle.js';
```

Files get hashed names; **imports keep pointing at the unhashed ones**. The hashed entry point loads
the *unhashed* dependency, so hashing buys nothing for anything below the entry.

Django ships `support_js_module_import_aggregation`, which adds four `*.js` patterns covering
`import … from`, `export … from`, bare `import '…'` and dynamic `import('…')`. It is a **class
attribute defaulting to `False`** — there is no setting, so enabling it means subclassing. With it
enabled, `collectstatic` **fails outright**:

```
ValueError: The file 'js/proto-modules/raf-throttle.2a3010f85b4d.js' could not be found
```

Bisected. Not the diamond import, not the directory nesting, not the chain length, not the CSS
`@import` chain, and not `main.js`/`panel.js` (which contain no module syntax at all — verified). It
is **a comment**, and the mechanism is this:

The `export … from` pattern is `DOTALL` and unanchored:

```
(?P<matched>export(?s:(?P<exports>[\s\{].*?))\s*from\s*["'](?P<url>[./].*?)["']\s*;)
```

`carousel.js`'s header comment contained the words `export function wireScrollCarousel` — prose,
explaining what changed when the function was lifted out of `main.js`. The regex starts matching at
that word and runs lazily forward, across the rest of the comment, to the first `from '…';` it can
find — the **real import statement 395 characters later**:

```
span 296 → 691
starts:  export function wireScrollCarousel`\n     - `rafThrottle` now
ends:    ype is. */\n\nimport { rafThrottle } from './raf-throttle.js';
url:     ./raf-throttle.js
```

Django then replaces that entire span with a single `export … from` statement — **rewriting an
`import` into an `export`, and swallowing the comment into it.** The output is non-idempotent, so the
next post-process pass re-matches the already-hashed URL, tries to hash a hashed name, and dies.

Reproduced and controlled:

| Test | Result |
| --- | --- |
| Toy 2-file chain, isolated tree | ✅ passes, imports correctly rewritten to hashed names |
| Toy chain nested in `js/proto-modules/` | ✅ passes |
| Toy 3-file chain | ✅ passes |
| Toy chain + a CSS `@import` chain with `?v=` | ✅ passes |
| Toy chain + the word `import` in a comment | ✅ passes |
| **Real `carousel.js` as the importer** | ❌ fails |
| Real `raf-throttle.js` as the leaf, toy importer | ✅ passes |

**Why this lands harder here than elsewhere.** #199 established that this repo's comments are dense
(`panel.css` 61%, several `panel.js` regions 60–70%) and load-bearing — they exist to record
contested decisions, and they routinely discuss module structure because that is what the code does.
Enabling this feature would mean **the word "export" or "import" in a comment above an import
statement silently corrupts the file at deploy time.** A booby trap aimed precisely at this
codebase's documented strength. Hence decision 3: never enable it. If dependency hashing is ever
genuinely needed, the options are a flat module layout with no relative imports between hashed files,
a build step (which #198 ruled out, and this is the evidence that would justify reopening that on
evidence rather than by quiet workaround), or a subclass with line-anchored patterns — which means
carrying a patched Django internal that is not public API.

### 2c. CSS is already compatible

`ManifestStaticFilesStorage` rewrites CSS `@import` correctly, including query strings — the real
chain (`style.css` → 15 files) post-processed with no errors and `style.53d717b11e02.css` came out
correctly hashed. So the chain is ready for hashing whenever there is something to deploy, which is
half of decision 5.

---

## 3. Load order and `DOMContentLoaded` — measured, and it's the good news

Measured in a real browser against the running dev server on `/inclusion/`, not asserted from spec.

| Observed | Result |
| --- | --- |
| `document.readyState` when the module body ran | `interactive` |
| Had `DOMContentLoaded` already fired? | **No** |
| Did `main.js` (classic, `defer`) run first? | **Yes**, at t=551ms |
| Did a `DOMContentLoaded` handler registered *inside* the module fire? | **YES** |
| Console errors / warnings | 0 |

**The ~14 existing `DOMContentLoaded` handlers in `main.js`/`panel.js` survive the move untouched.**
A module body runs after parsing but before `DOMContentLoaded`, so a handler it registers is still in
time. That was the single biggest cost risk in #204/#205 and it is not there.

Deferred classic scripts and module scripts also execute in **document order** — `main.js` at
`layout.html:139` ran before the module at the bottom of the hub page — so existing load-order
assumptions hold across a mixed migration, and it needn't be big-bang.

The carousel itself worked end-to-end under the module:

| Check | Result |
| --- | --- |
| Wraps found and wired | 1, `wireScrollCarousel` returned its `updateArrows` |
| At 1152px (no overflow) | arrows correctly hidden, `is-draggable` off |
| Resized to 760px | overflow detected, arrows shown, `is-draggable` on |
| Next arrow clicked | `scrollLeft` 0 → 194 (one card + gap) |
| `is-at-edge` on prev after scrolling away | correctly cleared |

The resize row is the strongest evidence: `window.addEventListener('resize', rafThrottle(updateArrows))`
runs through the **two-levels-deep** import, so the transitive dependency is not merely fetched, it
is functioning.

---

## 4. Entry points — what the prototype could not settle

The prototype ran the **one portal-wide entry** shape: a single module entry loaded alongside the
existing deferred `main.js`, with `main.js` handing off one carousel to it via `data-proto-carousel`.

What that proves is narrow but real: a module entry **coexists with the existing classic deferred
scripts** without either needing to change, and the dev server serves modules as
`application/javascript` with no configuration at all.

What it does **not** settle is per-page vs per-hub vs portal-wide, because that question is really
about how much of an entry file would be duplicated, and one entry cannot show that. Hence decision
6: #204 decides it from the file list, where the duplication is visible.
