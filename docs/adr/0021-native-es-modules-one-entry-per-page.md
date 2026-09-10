# Native ES modules, one entry per page, and context reaches JS as data

Portal JavaScript loads as native ES modules (`<script type="module">`), with **one entry module per page template**, and no bundler or build step. Template context reaches JavaScript **as data, never as code**, which means a template contains no inline script that executes.

## Why modules, stated correctly

The two reasons first written down for this choice — fixing hand-managed load order, and ending the `?v=N` cache-bust proliferation — were both tested against a working prototype on a real page, and **neither survived**. Load order was never broken: a module body runs after parsing but before `DOMContentLoaded`, so the existing DCL handlers were never at risk, and deferred classic scripts and modules execute in document order. `?v=N` proliferation turned out to belong to a missing dev-server header and was fixed there instead (see `core/management/commands/runserver.py`, and ADR 0022's sibling finding below).

The reason that survives is different and better: **an import graph is the machine-readable form of "what depends on what."** That was the question nobody could answer about these files — a 11,810-line stylesheet with 15 section headers, `main.js` selecting `.panel-card` by name, a portal-wide sidebar partial encoding a hub stylesheet's values in six places. `window.*` globals record no such graph; imports do, and they make a promotion list checkable rather than asserted. Measurements in [es-modules-findings.md](../wayfinder/portal-static-assets/es-modules-findings.md).

Two consequences follow directly. Modules replace the `window.*` convention, so a promoted helper is imported rather than installed on the global object. And migration is **page by page, never big-bang**: a module entry coexists with the existing deferred classic scripts with neither changed, which is measured, not assumed.

## One entry per page

Not one entry per hub, and not one portal-wide. A per-hub entry has to import every page's behaviour and dispatch on page identity, which is the hardcoded-page-list shape this convention exists to remove — `LIST_ROOT_SELECTOR` and `BUTTON_ROW_SELECTORS`, two page-agnostic algorithms configured by a hardcoded list of five Panel page ids, are what that looks like in practice.

Shared page wiring is removed by a **module**, not by an entry. The six list pages each re-implemented filter wiring, dependent-select refresh, toggles, infinite scroll and button-column width sync in their own inline blocks — six, six, three, two and four copies. They collapse behind `initListPage(root, options)`: one call, five behaviours, and a page that no longer knows they are five things.

## Context reaches JS as data

A template may hand values to JavaScript. A template may never contain JavaScript that the template engine writes.

| Shape | Mechanism |
| --- | --- |
| Structured data | `{{ x\|json_script:"id" }}`, read back with `JSON.parse(el.textContent)` |
| Scalar, and `{% url %}` | a `data-` attribute on the element the behaviour is wired to |
| Template control flow | a `data-` attribute the module branches on |

`json_script` is also strictly safer than the `JSON.parse('{{ x\|escapejs }}')` it replaces: `escapejs` escapes for a JavaScript *string* context and is one stray quote from a syntax error, where `json_script` escapes for HTML and is the documented path.

**Template control flow must never decide whether JavaScript exists.** A `{% if %}` wrapping a block of script means that code is present on some renders and absent on others, which makes the module un-importable and un-testable by construction. The one instance (a discussion timer) becomes a data attribute and an `if` inside the module.

Stated precisely, because `json_script` emits a `<script>` tag of its own: **no inline script containing code.** `<script type="application/json">` is data and is welcome. That distinction is what makes the rule checkable, by `scripts/check_inline_js.py` (advisory).

**One exception, bounded and conditional.** `templates/layout.html`'s boot block, above `</head>`, sets the theme before first paint; it stays inline *and* blocking, because a module or a `defer`red script runs after parsing and that is a visible flash on every page load. The condition attached: it may carry no template context. The checker enforces the exception by shape — a block in `layout.html`, above `</head>`, with no references — so it cannot drift into a hiding place for coupled code.

## Considered options

- **A bundler.** Rejected at charting, and re-examined on evidence rather than by assumption when module dependency-hashing turned out to be unavailable (below). It remains rejected while there is no deployment and no toolchain: it would be a build step adopted to solve a problem that does not yet exist. If dependency hashing ever becomes genuinely necessary, this is the option to reopen, and the evidence is already written down.
- **Keep classic scripts and the `window.*` convention.** Rejected: it records no dependency graph, which is the whole reason left for modules.
- **Django's `support_js_module_import_aggregation`** (which would rewrite module imports to hashed filenames). **Rejected — it corrupts files in this codebase.** Its `export … from` pattern is DOTALL and unanchored, so the prose "export function …" in a header comment matches ~400 characters forward into the real `import` statement below and rewrites that import into an export. `collectstatic` then fails on the non-idempotent output. Identical on Django 5.2 and 6.0. In a repo whose comments are 60%+ of some files and discuss module structure constantly, that is a booby trap aimed precisely at its documented strength. Manifest hashing is therefore a deployment-time decision; CSS `@import` is already compatible with it, JS below an entry point is not.
- **A "small inline glue block" plus an imported module.** Rejected as a rule with no edge: every future page decides for itself what "small" means. Once every coupled reference in the portal was enumerated — sixteen, in four shapes — there was nothing left for a glue block to do.
