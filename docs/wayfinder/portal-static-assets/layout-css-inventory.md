# Inventory: `static/css/layout/layout.css`

Fact-finding for the `layout.css` half of
[#215](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/215) ("Portal CSS the map never
looked at: layout.css and tables.css" — the `tables.css` half is already done, file deleted). The
original three-file migration (`panel.css`/`panel.js`/`main.js`, #198 onward) never touched this
file; this is the same fact-finding pass [inventory.md](inventory.md) did for `panel.css`, applied
here. Nothing in this document is a decision — it is what is in the file. It is the prerequisite for
acting on #215, not the split itself.

Line counts as of `fa0c915` (branch `210-list-page-tier`), per `scripts/check_file_size.py`:

```
1378 code    2529 total   46% comment  static/css/layout/layout.css
```

Regions below are **contiguous and exhaustive**: every line 1–2529 is in exactly one region, and the
Total/Code columns sum to exactly 2529/1378 — verified by rerunning the same comment-span scanner
`check_file_size.py` uses ([`check_stale_comments.py`](../../../scripts/check_stale_comments.py)'s
`comment_spans`) over each region's own line range, not by eyeballing. `total py lines` for the file
is 2529, one more than `wc -l`'s 2528, because the file ends `}\r\n` — the trailing newline gives
Python's `str.split("\n")` one extra (empty) final element, which the same off-by-one already present
in `check_file_size.py`'s own count treats as line 2529.

## Nature test

Same three marks as [inventory.md](inventory.md) and
[main-js-inventory.md](main-js-inventory.md):

| Mark | Meaning |
| --- | --- |
| **G** | Generic UI behaviour. No SEND/Panel vocabulary. Portal-wide by definition. |
| **D** | Carries domain vocabulary (Referral, Action, Panel, Meeting, Agenda, Safeguarding, Escalation, Student). Hub-owned. |
| **M** | Mixed — a generic mechanism whose selectors/identifiers are spelled in domain terms. |

**Every region below is G. Zero D, zero M by this test — confirmed by grep, not assumption.**
`grep -inE "referral|panel-group|agenda|safeguarding|escalation|\bstudent\b|\bmeeting\b|\bpanel\b"`
across the whole file returns 19 hits, and every one is either the string `panel.css` naming the
sibling file in a comment, `Inclusion Panel`/`hubs/inclusion/panel` naming an app in a comment, or a
prose reference to which page (Students/Referrals/Meetings) exercises a rule — never a selector or id
carrying domain vocabulary. No `.referral-*`, no `.panel-*`, no `#*-filtered-content` id, nothing
Safeguarding/Agenda-shaped.

This is the expected result stated going in: `layout.css` is portal chrome — sidebar, header rail,
content shell, breakpoint dev-tool scaffolding — and portal chrome has nowhere for domain vocabulary
to enter. Same finding as `main-js-inventory.md`'s own nature-test section ("barely discriminates"):
a clean G sweep here isn't a failure of the test, it's confirmation the file is exactly what its
folder name says it is. The interesting question for this file is not G/D/M — it's **tier fit**: does
every G region actually belong under `layout/`, or does some of it belong in `components/`,
`list-page/`, or `pages/` instead? Two regions below (14, 16, plus part of 13/17) say no — flagged in
their own notes rather than invented as a fourth nature mark.

---

## Regions

| # | Lines | Region | Total | Code | Cmt% | Nature |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1–78 | Global reset (`*`), the DES-L1 "layout pattern selection" design-principle banner comment, `body` base (100vh/100dvh, bg/color/font, flex column), `html,body{height:100%}`, `:root{interpolate-size}` opt-in | 78 | 22 | 72% | **G** |
| 2 | 79–368 | `.page-shell` (nav+main split), `.side-nav` structural frame (width/height/overflow/border), `.js-preload` transition-suppression, `.side-nav-inner`, collapsed icon-rail state (width, label-hide, padding, `.hubs-trigger`/`.switch-school` show-hide) | 290 | 111 | 62% | **G** |
| 3 | 369–685 | `.nav-header`, `.nav-header-top-row`, `.collapse-toggle` + its icon-swap states, `.hub-icon-mark` (circle badge) + collapsed fade, `.nav-title-group`, `.nav-scroll`/`.nav-footer` + touch scrollbar-hide, `.nav-stack`/`.overlay-slot`/`.side-nav.overlay-nav` (Search/Settings slide-in), `main{position:relative}` | 317 | 160 | 50% | **G** |
| 4 | 686–1025 | The permanent global hub rail: `.global-nav`, `.hub-rail`/`-inner`, tab-link seam (`.hub-rail-seam-top/-bottom`, `.hub-rail-active-fill`), `.hub-rail-item` + hover/active, `.icon-tooltip-host::after` (shared bubble + rail's own card variant + collapsed-local-rail's card variant), `.rail-tooltip-fixed`, `.hub-rail-global-action` | 340 | 181 | 47% | **G** |
| 5 | 1026–1037 | `.global-backdrop` — dims `<main>` while an overlay panel is open, + dark-theme override | 12 | 3 | 75% | **G** |
| 6 | 1038–1219 | `.app-footer` docked status bar + clusters, `.footer-text-btn`/`.footer-error-badge`, dev breakpoint-switcher buttons (`.dev-bp-group`/`.dev-bp-option` incl. disabled/hidden) + permanent text labels | 182 | 111 | 39% | **G** |
| 7 | 1220–1364 | `.dev-bp-orient-label` width transition, `.dev-bp-tier`/`.dev-bp-menu` device-size dropdown, `.dev-error-panel` dropdown | 145 | 103 | 29% | **G** |
| 8 | 1365–1414 | `.ui-dialog` — native `<dialog>`-based "report a problem" modal, deliberately self-contained per its own comment rather than reusing `panel.css`'s `.modal-dialog` | 50 | 40 | 20% | **G** |
| 9 | 1415–1492 | `.dev-bp-overlay` + `.dev-bp-frame-wrap`/`.dev-bp-frame` — the breakpoint device-preview iframe chrome | 78 | 23 | 71% | **G** |
| 10 | 1493–1559 | `.side-nav .nav-title`/`.hub-side .nav-title` (hub-name heading sizing/colour) + collapsed hidden-but-reserved state, `.nav-title-link` | 67 | 26 | 61% | **G** |
| 11 | 1560–1879 | Sidebar row interaction states: `.nav-menu` base rows, shared hover nudge (translateX), collapsed icon-only hover, left accent-bar for school/staff rows, row background pill fill + active fill (DES-F1), selected-state colour, collapsed rail icon-pill hover/active, expanded-row active border, `.nav-footer`, `.school-nav-logo`, school-nav accent-bar tuning, dividers, `.nav-search` | 320 | 190 | 41% | **G** |
| 12 | 1880–1928 | `.content-column`, `main` (scroll region) + touch scrollbar-hide, `.main-inner` (max-width 1600px content wrapper) | 49 | 28 | 43% | **G** |
| 13 | 1929–1961 | `.sticky-header-zone`/`.home-header-sticky` (sticky page-header fade) + `.sticky-zone-sentinel` — see note | 33 | 10 | 70% | **G**, wrong tier — see below |
| 14 | 1962–2028 | Home-page residue: `main h1`, `section`, `.hub-cards h1/p`, `.home-toolbar`, `.home-search-row`, `.cards`, plus stray base-element rules (`small`, `a`, `.form-with-validation`, `.errorlist`, `.logout-button`) | 67 | 58 | 13% | **G**, wrong tier — see below |
| 15 | 2029–2107 | `.side-nav .menu-icon`/`.menu-label` (icon+label row primitives shared by every sidebar list), school-logo `<img>` sizing, current-user avatar, `.nav-header` flex base, `.nav-close-btn` (overlay panel's "Close" row) | 79 | 48 | 39% | **G** |
| 16 | 2108–2301 | `.content-shell`/`.list-card` — the full-height list-page shell pattern (ex-`.list-page-shell`, renamed after colliding with `.page-shell` — see taxonomy §6a lesson 1), `.filtered-content`, `.list-card .filter-bar`/`.entity-list`/`.entity-row` overrides, `.list-card .stats-strip`, `.setup-col .entity-list` | 194 | 77 | 60% | **G**, wrong tier — see below |
| 17 | 2302–2338 | `.page-header`/`.page-header-main`/`.page-header-extras`/`.key-actions*`, `.side-nav .nav-row-btn:focus-visible`, `.nav-footer-divider`/`.nav-header-divider`/`.hub-menu-divider` | 37 | 22 | 41% | **G** |
| 18 | 2339–2434 | `.side-nav .menu-label-stack` (current-user name/school/role), `.nav-row-dropdown-list li.hidden`, `.hub-home-header`/`.hub-home-lead`, Settings-overlay `.settings-nav .settings-group`, `.settings-switch-school-group`, `.colour-grid`/`.colour-swatch` (incl. "Corporate" conic-gradient swatch) | 96 | 74 | 23% | **G** |
| 19 | 2435–2529 | Settings-overlay `.theme-toggle` (sun/moon), `.text-size-grid`/`.text-size-option` (accessibility text-size picker) | 95 | 91 | 4% | **G** |

Only 4 of these boundaries are marked by the file's own banner-style comments (lines 79, 687, 1038,
1929/2108 read as topic headers in the comment prose, not literal `====` banners — `panel.css` had 9
real banners; this file has none). Every other boundary was found by selector-root clustering while
reading start to finish.

### Region 13 and 16: sticky-header + list-page shell are already-named taxonomy destinations

Neither is domain-mixed (both G), but neither is genuinely `layout/` tier either, and
[taxonomy.md](taxonomy.md) — written entirely against `panel.css`, before this file was ever read —
already assigned both a destination without knowing it:

- **Region 16** (`.content-shell`/`.list-card`, 2108–2301) is exactly what taxonomy §2's
  `layout/page-shell.css` row describes: *"`.page-shell` and its fill/height chain (ex-`.list-page-shell`
  — the name lied; any full-height page uses it)"*, sourced from `panel.css` region 2. `panel.css`
  region 2 (17–660) independently carries its own `.list-page-shell` fill/stack-mode rules for the
  same pattern. So this is not a fresh split decision — it's confirmation that `layout/page-shell.css`
  needs content from **two** files, and the two copies will need reconciling against each other
  (`panel.css`'s own conservation-of-rules lesson from taxonomy §6a applies here too).
- **Region 13** (`.sticky-header-zone`/`.home-header-sticky`/`.sticky-zone-sentinel`, 1929–1961) is
  exactly taxonomy §2's `components/page-header.css` row: *"`.page-subtitle-stats`,
  `.sticky-header-zone*`"*, also sourced from `panel.css` region 8. Same shape: a rule instantiated by
  every list page's own header (not singleton `layout.html` chrome, taxonomy's own layout-vs-component
  test), duplicated once per stylesheet instead of defined once. `.page-header`/`.key-actions*`
  (region 17, 2302–2325) belong with it for the same reason — reusable per-page header furniture, not
  app-frame singleton.

### Region 14: home-page residue, no taxonomy destination yet

`main h1`, `.hub-cards h1/p`, `.home-toolbar`, `.home-search-row`, `.cards` (1962–2028) style one
page — the MAT/hub home screen (`portal.views.mat_home` / hub landing pages) — not the app frame.
Taxonomy's `pages/` folder is described as "empty at first. Created when a portal-wide page first
needs its own layout" — this is that content, just never moved because nobody has inventoried
`layout.css` before now. No sub-breakdown needed beyond the one-line description above; it's cleanly
one thing (one page's layout), just filed under the wrong tier.

### Region 8: a `.ui-dialog` `panel.css` doesn't reuse

`.ui-dialog` (1365–1414) is a second, independent native-`<dialog>` modal implementation, and its own
comment says why: *"self-contained here rather than depending on `hubs/inclusion/panel`'s own
`.modal-dialog`, since this footer is loaded on every page site-wide, not just Inclusion Panel."* That
reasoning stops applying once `panel.css` region 15's `.modal-dialog*` promotes to portal-wide
`components/modal.css` (taxonomy §2) — at that point this is a second implementation of the same
`position:fixed; inset:0; margin:auto` dialog-centering trick with no reason left to stay separate.
Not urgent (the reasoning was sound when it was written), but worth revisiting once `modal.css` lands.

---

## Stale self-referencing line numbers

Four comments in this file cite `layout.css:<N>` to point at another rule earlier in the same file.
Two are accurate; two are not, by 8 and up to 19 lines:

| Comment (line) | Cites | Actual current content at cited line | Verdict |
| --- | --- | --- | --- |
| 1499 | `layout.css:46` — "the global 1.4" line-height | Line 46 is mid-comment prose ("tracks the bar as it collapses instead...") | **stale** — line-height:1.4 is now at line 54 |
| 1541 | `layout.css:86/394` — the 240px side-nav width / `--space-lg` padding | Line 86 is `.page-shell`'s closing `}`; line 394 is mid-comment prose (#142 grilling) | **stale** — width:240px is now line 94; the padding-lg declaration is now line 375 |
| 1544 | `layout.css:89` — `.side-nav`'s `overflow:hidden` | Line 89 is mid-comment prose (the `.nav-scroll` explanation above `.side-nav`) | **stale** — `overflow:hidden` is now line 97 |
| 1807 | `layout.css:86` — the fixed 240px sidebar | Same as above, `.page-shell`'s `}` | **stale** — should be 94 |
| 1813 | `layout.css:5` — global `box-sizing: border-box` | Line 5 is in fact `box-sizing: border-box;` | accurate |

Not fixed here (fact-finding only, per this document's own scope) — flagged the way the recent
`cards.css`/`navigation.css` cleanup flagged similar drift. All four stale citations sit in
`.side-nav`-width-related comments (regions 10/11), consistent with insertions earlier in the file
(the DES-L1 banner, `.js-preload` blocks) having pushed later line numbers down without their
self-citations being re-checked.

---

## Stays-one-file or split candidate?

**Split candidate**, not a legitimate "stays one." Three independent findings point the same way,
each stronger than "it's over 600 code lines":

1. `layout.css` is 1,378 code lines — more than double the review trigger — with no single
   cross-cutting reason (à la `facts-strip.js`'s shared measurement cache) that the whole file has to
   stay one module. Nothing here is a deep module hiding one mechanism; it's ~7 loosely related
   chrome systems (reset/body, sidebar, hub rail, breakpoint dev-tool, page shell, home-page residue,
   Settings-overlay furniture) that happen to all load on every page.
2. Two regions (13, 16) are independently confirmed by `taxonomy.md` — written before this file was
   ever read — to belong in files that already have names and already have known duplicate content
   waiting in `panel.css`. That's not a judgment call this document is introducing; it's this file
   being caught by a decision already made.
3. One region (14) is straightforwardly one page's layout sitting in the app-frame file for no
   reason other than nobody had mapped this file until #215.

Rough proposed split — same shape as `taxonomy.md`'s own tables, **not a decision**:

| File | Holds | From |
| --- | --- | --- |
| `layout/shell.css` | Reset/body baseline, `.page-shell` nav+main split, `.side-nav` structure + collapse/icon-rail states, `.nav-header`/`.collapse-toggle`/`.hub-icon-mark`/`.nav-title-group`, sidebar row hover/active/selected states, `.menu-icon`/`.menu-label` primitives, `.content-column`/`main`/`.main-inner`, `.nav-close-btn` | 1, 2, 3, 10, 11, 12, 15 |
| `layout/hub-rail.css` | Global hub rail: `.global-nav`, `.hub-rail*`, tab-link seam/notch, rail tooltips | 4 |
| `layout/dev-tools.css` | App footer + breakpoint-switcher, dev error console, report-issue `.ui-dialog`, breakpoint preview overlay | 6, 7, 8, 9 |
| `layout/`**`page-shell.css`** | `.content-shell`/`.list-card` full-height list-page pattern — **name and region-2 source already fixed by taxonomy.md**; reconcile against `panel.css`'s own copy when both move | 16 |
| `components/`**`page-header.css`** | `.sticky-header-zone*`/`.home-header-sticky`/`.sticky-zone-sentinel`, `.page-header`/`.key-actions*` — **name and a `panel.css` region-8 source already fixed by taxonomy.md** | 13, 17 (partial) |
| `components/settings-panel.css` | Settings-overlay furniture: `.settings-nav .settings-group`, `.colour-grid`/`.colour-swatch`, `.theme-toggle`, `.text-size-grid`/`.text-size-option`, `.global-backdrop` | 5, 18, 19 |
| `pages/home.css` | `.hub-cards`, `.home-toolbar`, `.home-search-row`, `.cards`, stray base-element rules (`small`, `a`, `.form-with-validation`, `.errorlist`, `.logout-button`) | 14 |

`layout/responsive.css` (already exists, out of scope here) keeps the breakpoint-tier media queries per
its own header comment; nothing above touches it.
