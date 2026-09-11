# Inventory: `static/js/main.js`

Fact-finding for [#213](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/213), under the map
[#198](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/198). The third of the three big
static files and the only one [#200](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/200)
never inventoried — [taxonomy.md](taxonomy.md) §7 holds `main.js` out explicitly, so no taxonomy
call could be made on it without this.

Line ranges are as of `03241f7` (`main`). **5,251 total lines, 2,605 code lines, 48% comment.**

Counts come from `scripts/check_stale_comments.py`'s comment scanner, the same definition
`scripts/check_file_size.py` and #199/#200's figures use, so a region's code count here is directly
comparable to the ~600-line review trigger.

The regions below are **contiguous and exhaustive**: they sum to 5,251 total / 2,605 code with no
gaps and no overlaps. That is the check that nothing was missed, and it is the reason the boundaries
are stated as ranges rather than as a function list.

## Nature test

Same marks as [inventory.md](inventory.md), per ADR 0020:

| Mark | Meaning |
| --- | --- |
| **G** | Generic UI behaviour. No SEND/Panel vocabulary. Portal-wide by definition. |
| **D** | Carries domain vocabulary (Referral, Action, Panel, Meeting, Agenda, Safeguarding, Escalation, Student). |
| **M** | Mixed — a generic mechanism whose selectors or identifiers are spelled in domain terms. |

**The finding this test produces for `main.js` is that it barely discriminates.** For the panel files
the G/D/M split *was* the map — ~6,100 of `panel.css`'s lines are M. Here 36 of 38 regions are G,
and the three exceptions are three identifiers, not three regions (§4). `main.js` is portal-wide by
nature almost throughout, which is the correct result and also a useless one: it sorts the file into
one pile. The axis that does sort it is §3's.

---

## 1. Structure

Three top-level bodies, not one:

| Lines | Body |
| --- | --- |
| 1–1420 | Free functions at top level, 5 of them assigned onto `window` |
| 1421–3970 | One `DOMContentLoaded` handler — **2,550 lines, 49% of the file** |
| 3971–5251 | Two IIFEs: form controls (3971–5239), `ui-select-row` adders (5240–5251) |

The `DOMContentLoaded` handler is the shape that matters. It is not a dispatcher — it is thirty-odd
unrelated setup blocks in one closure, several of which close over variables defined by earlier
blocks (`isTouchNav`, `studentsNarrowMql`, `portraitMql`). Those closures are why the file has
resisted splitting: a block cannot be lifted out without first deciding what the shared media-query
state becomes. §3 says what it becomes.

---

## 2. Regions

Destination column is §3's ruling; §5 names the module.

### 2.1 Top level (1–1420) — 1,420 lines, 602 code

| Lines | Region | Total | Code | Cmt | Nature | Destination |
| --- | --- | --- | --- | --- | --- | --- |
| 1–38 | `closest`, `rafThrottle` | 38 | 19 | 47% | **G** | components |
| 39–88 | `initSelectable` | 50 | 31 | 34% | **G** | components |
| 89–133 | `syncDisabledTooltip`, `wireDisabledTooltips` | 45 | 24 | 45% | **G** | components |
| 134–223 | `setupOverflowTabs`, `buildOverflowFade` | 90 | 48 | 41% | **G** | components |
| 224–275 | `setupOverflowDragScroll` | 52 | 30 | 40% | **G** | components (§6) |
| 276–823 | `setupFilterBarMoreFilters`, `SEARCH_MIN_WIDTH` | 548 | 147 | 72% | **G** | filter-bar |
| 824–935 | `wireScrollCarousel` | 112 | 69 | 35% | **G** | components (§6) |
| 936–1051 | `wireMoreFiltersToggle`, `animateFilterTrayReflow`, the `change` listener | 116 | 50 | 55% | **G** | filter-bar |
| 1052–1180 | `groupFilterSections` | 129 | 37 | 69% | **G** | filter-bar |
| 1181–1373 | Filter-section scroll: tracks, items, host, fade, `stepFilterSectionScroll`, `revealFilterSectionItem`, `updateFilterSectionScroll`, `wireFilterSectionScroll` | 193 | 114 | 40% | **G** | filter-bar |
| 1374–1420 | `balanceFilterGroupLabels`, `setMoreFiltersLabel` | 47 | 33 | 25% | **G** | filter-bar |

### 2.2 The `DOMContentLoaded` handler (1421–3970) — 2,550 lines, 1,354 code

| Lines | Region | Total | Code | Cmt | Nature | Destination |
| --- | --- | --- | --- | --- | --- | --- |
| 1421–1449 | Handler preamble, `syncDisabledTooltips` | 29 | 9 | 67% | **G** | layout |
| 1450–1491 | Touch-nav detection, `__setDevBpTouch` | 42 | 17 | 59% | **G** | layout |
| 1492–1676 | Breakpoint MQLs, `phone-chrome`/`filter-bar-mobile` class sync, the five `window` exports | 185 | 54 | 70% | **M** (§4.1) | layout |
| 1677–1912 | Sidebar collapse / icon rail / rail tooltip | 236 | 115 | 49% | **G** | layout |
| 1913–1960 | `positionHubRailSeam` | 48 | 25 | 47% | **G** | layout |
| 1961–2082 | Overlay nav, `addBackdrop`/`removeBackdrop` | 122 | 93 | 18% | **G** | layout + components |
| 2083–2118 | Hub cards, `.hub-more-toggle` | 36 | 26 | 21% | **G** | pages |
| 2119–2318 | `setupSettingsPanel` — theme, colour, mode, swatch probing | 200 | 155 | 16% | **G** | layout |
| 2319–2401 | `setupCookieSwitcher`, `HUB_RESULT_ICONS` | 83 | 56 | 27% | **G** | layout |
| 2402–2550 | `setupAppSearch` | 149 | 97 | 28% | **G** | layout |
| 2551–2666 | `setupListPageShellHeight` | 116 | 38 | 66% | **G** | layout |
| 2667–2676 | Overflow-tabs wiring | 10 | 1 | 90% | **G** | components |
| 2677–2759 | Filter-bar wiring | 83 | 60 | 19% | **G** | filter-bar |
| 2760–2805 | `.card-switcher` | 46 | 22 | 50% | **G** | components |
| 2806–2885 | Breadcrumbs | 80 | 69 | 0% | **G** | layout |
| 2886–2901 | `.senco-carousel-wrap` call | 16 | 3 | 80% | **D** (§4.2) | hub-owned |
| 2902–3047 | Stats carousel — second carousel implementation | 146 | 88 | 35% | **G** | components (§6) |
| 3048–3074 | `setupStickyZoneSentinels` | 27 | 12 | 54% | **G** | layout |
| 3075–3120 | Filter scroll-position persistence | 46 | 13 | 71% | **G** | filter-bar |
| 3121–3165 | `fabProtrusionAboveTabbar`, `fabOverlapClearance` | 45 | 10 | 78% | **G** | layout |
| 3166–3392 | `positionFilterTray`, sticky-tray reposition, `scrollStickyBarToTop` | 227 | 57 | 75% | **G** | filter-bar |
| 3393–3748 | Filter-bar expand/collapse click delegation | 356 | 69 | 81% | **G** | filter-bar |
| 3749–3773 | Filter-field label click → control | 25 | 8 | 65% | **G** | filter-bar |
| 3774–3970 | AJAX filter forms, `enhanceFormControls` call | 197 | 81 | 58% | **M** (§4.3) | filter-bar |

### 2.3 The form-control IIFEs (3971–5251) — 1,281 lines, 649 code

| Lines | Region | Total | Code | Cmt | Nature | Destination |
| --- | --- | --- | --- | --- | --- | --- |
| 3971–4022 | `closeAllUiPopovers`, popover keydown/close, `forwardClickThrough` | 52 | 25 | 50% | **G** | components |
| 4023–4120 | `positionPopover` | 98 | 32 | 67% | **G** | components |
| 4121–4350 | Select-trigger width measurement (ghost element, `resolveTriggerMinWidth`, `applyTriggerWidth`) | 230 | 89 | 59% | **G** | components |
| 4351–4553 | `enhanceSelect` | 203 | 128 | 34% | **G** | components |
| 4554–4806 | `enhanceDateInput` | 253 | 226 | 3% | **G** | components |
| 4807–5154 | `enhanceTimeInput` | 348 | 274 | 15% | **G** | components |
| 5155–5239 | Fused-field stacking, `enhanceFormControls` | 85 | 39 | 51% | **G** | components |
| 5240–5251 | `ui-select-row` adders | 12 | 12 | 0% | **G** | components |

**`enhanceDateInput` at 3% comment and `enhanceTimeInput` at 15% are the two least-commented regions
in either big file** — against a file average of 48% and a `panel.css` average of 61%. They are also
two of the three largest single functions here (226 and 274 code lines). That combination is worth
naming: they are the regions a reader arriving cold has least help with, and the ones a
`check_file_size.py` run will flag first once they are their own files.

---

## 3. The ruling #198 left open: general vs. portal chrome

#213 asks whether `main.js`'s internals need the same distinction the hub files needed. **They do,
and the folder for it already exists on the CSS side and is missing on the JS side.**

[taxonomy.md](taxonomy.md) §1 gives the portal `static/css/layout/` — *"app frame: shell, sidebar,
page shell, the breakpoint registry"* — and then lists `static/js/` as `main.js`, `components/`,
`list-page/`, `pages/`. **There is no `static/js/layout/`.** The asymmetry was invisible while
`main.js` was one unsplit file, because `main.js` *was* the app frame's JS.

The distinction is not stylistic. It is a testable property:

> A **component** is instantiated per element and could appear many times on a page. A **layout**
> module is singleton chrome bound to `layout.html`'s own DOM — there is one sidebar, one hub rail,
> one settings panel, one app search, one mobile tab bar — and it reads or writes state on
> `document.documentElement`.

Sorting the regions by that test:

| Tier | Total | Code | What |
| --- | --- | --- | --- |
| `components/` | 1,870 | 1,157 | Form controls, popovers, tabs, carousel, selectable, tooltips, card-switcher |
| `components/filter-bar/` | 1,967 | 669 | The filter bar, entire (§5.2) |
| `layout/` | 1,362 | 750 | App frame: breakpoints, sidebar/rail, overlay nav, settings, app search, shell height, sticky zones, breadcrumbs, FAB |
| `pages/` | 36 | 26 | MAT home's hub cards |
| hub-owned | 16 | 3 | The `.senco-carousel` call (§4.2) |
| | **5,251** | **2,605** | |

Two things fall out of that table that were not visible before:

1. **The filter bar is a third of the file and is spread across nine non-adjacent regions** — 276–823,
   936–1420, 2677–2759, 3075–3120, 3166–3392, 3393–3748, 3749–3970. It is the single largest thing in
   `main.js` and it does not currently exist as anything. Nothing in the map had costed it, because the
   map was reading `panel.css`/`panel.js`, where the filter bar's *styling* lives but its *driver* does
   not.
2. **`layout/` is what unblocks the `DOMContentLoaded` closure.** The shared state that made the handler
   un-splittable — `isTouchNav`, `studentsNarrowMql`, `portraitMql`, `portraitWideMql`,
   `isFilterBarMobile` — is entirely region 1450–1676, and every one of its consumers is either a
   `layout/` module or the filter bar. Extracting `layout/breakpoints.js` **first**, exporting those as
   module bindings instead of `window` properties, is what makes the other twenty blocks liftable one at
   a time. It is the same shape as `initListPage` in #210: the ordering constraint is the finding.

### Why not fold layout into `components/`

Tried and rejected while sorting: it puts `sidebar.js` (reads `pref-sidebar-collapsed` from
`localStorage`, mutates `documentElement`'s classes, assumes exactly one `.side-nav`) next to
`date-input.js` (pure, per-element, N per page, no globals), and the folder then answers no question
at all. The taxonomy's own justification for mirroring folder names portal-side and hub-side —
*"a reader moving between them carries one vocabulary"* — applies just as much between `css/` and
`js/`. `static/css/layout/content-shell.css` and `static/js/layout/content-shell.js` should be the
same word.

### Why not `pages/`

`pages/` is "one portal page's own layout". The sidebar is on every page. Only region 2083–2118 (hub
cards) is genuinely one page's, and it goes there.

---

## 4. Domain vocabulary under `static/` — three violations

Taxonomy §1's rule 1 is *nothing under `static/` carries domain vocabulary*, stated as a file-level
invariant. `main.js` breaks it three times. All three are identifiers, none is a mechanism, and all
three are one-line fixes at split time — but they are the exact class of thing ADR 0020 says a later
pass never gets round to, so they are listed for whoever executes.

### 4.1 `studentsNarrowMql`, `studentsPortraitMql`, `studentsPortraitWideMql`

Declared at 1524/1538/1549, exported at 1673–1675. **These are portal-wide breakpoints named after
one page.** They gate the filter-bar mode for every filter bar in the portal, and the `students`
prefix is only history — the 900px tier was introduced for the Students page.

The leak is already outside `main.js`: `static/css/layout/responsive.css` cites `studentsNarrowMql`
by name in the breakpoint registry (line 35) and twice more (88, 110), so **the canonical tier list
currently names a tier after a SEND page.** `main.js:367` and `:1543` both carry comments reasoning
about the collision between this name and the tier it actually means.

Rename at extraction, per ADR 0020's "at promotion, never as a later pass". The registry comment in
`responsive.css` has to change in the same commit or it goes stale — and it is the file `CLAUDE.md`
points at as the single source of tier numbers.

### 4.2 `.senco-carousel-wrap` / `.senco-card`

`main.js:2886–2887` wires a SEND-named carousel. Its only consumer is
`hubs/inclusion/templates/hubs/inclusion/hub.html:261`.

**Worse than the call: the styling was already promoted.** `.senco-carousel*` and `.senco-card` now
live in `static/css/components/cards.css` (829–1033), `static/css/layout/responsive.css` (563–570)
and `static/css/theme/themes.css` (371). That happened in #208/#209 and is a live breach of rule 1 in
`static/`, on files that shipped.

This is [taxonomy.md](taxonomy.md) §6a lesson 6 — *"a surviving `panel-` token means domain
vocabulary"* — failing on its own terms. The test was written as a prefix list, and `senco-` was not
on it. **The generalisation the lesson should have drawn: the test is the vocabulary list in ADR 0020
plus every role and acronym in the trust's own domain, not a list of prefixes observed so far.**
SENCo is a job title, which is why it reads as a component name and slipped through.

Fix is a rename to a neutral name (the CSS is a card carousel, nothing SEND-specific in it) plus
repointing the hub's own `hub.html` markup. Not this ticket's; recorded so a follow-on picks it up
rather than rediscovering it.

### 4.3 `input[name=student]`

`main.js:3875`, inside the AJAX filter-form reset: portal-wide code clearing a named field that only
exists on panel's list pages. Small, but it is portal JS knowing a hub form's field name — the same
category as the `.panel-card` selector ADR 0020 cites as evidence, which #209 has since removed.
`.panel-card` is gone from `main.js`; this is what is left.

---

## 5. The file list

Against [taxonomy.md](taxonomy.md) §1's `static/js/` layout, plus the `layout/` folder §3 adds.
Code-line estimates are the region sums from §2; the ~600-line trigger counts code, so every module
below is under it except where noted.

### 5.1 `static/js/components/`

| Module | Exports | From | Code |
| --- | --- | --- | --- |
| `dom.js` | `closest` | 1–20 | ~10 | ✅ done (slice 2) |
| `raf-throttle.js` | `rafThrottle` | 21–38 — **pairs with `debounce.js`**, already named in taxonomy §3 | ~9 | ✅ done (slice 2) |
| `selectable.js` | `initSelectable` | 39–88 | 31 | ✅ done (slice 3b) |
| `disabled-tooltip.js` | `wireDisabledTooltips`, `syncDisabledTooltip` | 89–133 | 24 |
| `tabs.js` | `setupOverflowTabs`, `buildOverflowFade` — **merges into the `tabs.js` taxonomy §3 already assigns from `panel.js` region 11** | 134–223, 2667–2676 | ~49 |
| `drag-scroll.js` | `setupOverflowDragScroll` | 224–275 — see §6 | 30 |
| `carousel.js` | `wireScrollCarousel` | 824–935, 2902–3047 — see §6 | ~157 | ✅ done (slice 4a for the first range; the second, the stats carousel, stayed its own file — §6) |
| `card-switcher.js` | card-switcher wiring | 2760–2805 | 22 | ✅ done (slice 3b) |
| `backdrop.js` | `addBackdrop`, `removeBackdrop` | 2042–2082 | ~25 | ✅ done (slice 3a) |
| `popover.js` | `positionPopover`, `closeAllUiPopovers`, `forwardClickThrough` | 3971–4120 | 57 | ✅ done (slice 5) |
| `select.js` | `enhanceSelect`, `resyncFilterTriggerWidths` | 4121–4553 | 217 | ✅ done (slice 5) |
| `date-input.js` | `enhanceDateInput` | 4554–4806 | 226 | ✅ done (slice 5) |
| `time-input.js` | `enhanceTimeInput` | 4807–5154 | 274 | ✅ done (slice 5) |
| `fused-field.js` | `initFusedFieldStacking` | 5155–5206 | ~27 | ✅ done (slice 5) |
| `form-controls.js` | `enhanceFormControls` | 5207–5239 | ~12 | ✅ done (slice 5) |
| `select-row.js` | `uiSelectRowAdders` click delegation | 5240–5251 | 12 |

`select.js` at 217 code lines keeps the width-measurement half (4121–4350) rather than publishing it:
the ghost measurement element and the `SELECT_TRIGGER_*` constants are one cache with one consumer,
the same argument `facts-strip.js` makes in ADR 0020 and at a fifth of the size.

### 5.2 `static/js/components/filter-bar/`

**669 code lines across nine regions — over the review trigger as one file, so it is a folder.** The
trigger asks "one module or two?" and the honest answer here is six:

| Module | From | Code |
| --- | --- | --- |
| ✅ `more-filters.js` | 276–823, 936–1051, 1374–1420 | 230 |
| ✅ `sections.js` (`groupFilterSections`, `balanceFilterGroupLabels`) | 1052–1180 | 37 |
| ✅ `section-scroll.js` | 1181–1373 | 114 |
| ✅ `tray-position.js` (`positionFilterTray`, sticky trays, `scrollStickyBarToTop`) | 3166–3392 | 57 |
| ✅ `expand-collapse.js` | 3393–3773 | 77 |
| ✅ `ajax-form.js` | 3774–3970, 3075–3120 | 94 |
| ✅ `wire.js` — the one call a page makes | 2677–2759 | 60 |

**`static/js/components/filter-bar.js` already exists** (61 lines, `wireFilterBarActiveState`,
promoted from `panel.js` region 1 in #208). A folder and a file of the same name cannot coexist
cleanly; that file becomes `filter-bar/active-state.js`. Its own header already schedules the second
half of the change — it is still a `window.*` global rather than an export, deliberately, until
#212 moves its six inline-`<script>` callers to modules — so **the rename and the export should land
in the same commit as that move**, or those six templates change twice.

Recorded because it is the same class of collision as §6a lesson 1: checking the name being moved
*to*, not only the one being moved from.

`wire.js` is the `initListPage` shape at smaller scale: one call, six behaviours behind it, and a
page that stops knowing there are six.

### 5.3 `static/js/layout/` — new folder

| Module | From | Code |
| --- | --- | --- |
| `breakpoints.js` | 1450–1676 — ✅ **done**, and it was extracted first for the reason §3 gives | 71 |
| `sidebar.js` | 1677–1912 | 115 | ✅ done (slice 3a) |
| `hub-rail.js` | 1913–1960 | 25 | ✅ done (slice 3a) |
| `overlay-nav.js` | 1961–2041 | ~68 | ✅ done (slice 3a) |
| `settings-panel.js` | 2119–2318 | 155 | ✅ done (slice 2), and it took `setupViewFullSystemToggle` with it |
| `identity-switcher.js` (`setupCookieSwitcher` — school + current user) | 2319–2401 | 56 | ✅ done (slice 2) |
| `app-search.js` | 2402–2550 | 97 | ✅ done (slice 2) |
| `content-shell.js` — same name as `static/css/layout/content-shell.css` | 2551–2666 | 38 | ✅ done (slice 2) |
| `breadcrumbs.js` | 2806–2885 | 69 | ✅ done (slice 3b) |
| `sticky-zone.js` | 3048–3074 | 12 | ✅ done (slice 3b) |
| `mobile-tabbar.js` (FAB clearance) | 3121–3165 | 10 | ✅ done (slice 3b) |
| `boot.js` — the handler that calls the rest | 1421–1449 | 9 |

### 5.4 `static/js/pages/`

| Module | From | Code |
| --- | --- | --- |
| `mat-home.js` — hub cards, `.hub-more-toggle` | 2083–2118 | 26 | ✅ done (slice 3b) |

### 5.5 What leaves `static/`

The `.senco-carousel` call (2886–2901) is the one region that is not portal-wide. Per ADR 0020's
composition rule — *both ingredients promote and the composition stays hub-owned* — `carousel.js`
promotes and the call moves to a hub entry module, once §4.2's rename settles what it is called.

---

## 6. Drag-to-scroll: **six copies, not four**

#213 names four (`main.js:224`, `main.js:890`, `panel.js:2813`, and home.html's two blocks, which is
five as written). At `03241f7` there are six implementations of pointer-drag-to-scroll, plus a
seventh mouse-only variant:

| # | Site | Shape |
| --- | --- | --- |
| 1 | `static/js/main.js:224` | `setupOverflowDragScroll` — `pointerdown`/`move`/`up`, `moved` flag |
| 2 | `static/js/main.js:874` | Inside `wireScrollCarousel`, `DRAG_THRESHOLD = 6`, suppresses the trailing click |
| 3 | `static/js/main.js:2992` | Stats carousel's own `isPointerDown`/`dragMoved`/`startScrollLeft` |
| 4 | `hubs/inclusion/panel/static/panel/js/panel.js:2773` | Facts-strip drag; **its own comment at :2773 names the duplication** |
| 5 | `hubs/inclusion/panel/templates/hubs/inclusion/panel/home.html:931` | Referral carousel viewport |
| 6 | `hubs/inclusion/panel/templates/hubs/inclusion/panel/home.html:1285` | Second carousel viewport, same code |
| 7 | `templates/hubs/_hub_sidebar.html:1580` | `mousedown`-based, axis-switching (`pageY` in the side tier, `pageX` in portrait) — **not a copy of the other six**, and the only one that is not `pointerdown` |

Copies 2, 5 and 6 all independently rediscovered the same two bugs — a drag over a `role="button"`
row firing a click on release, and `preventDefault` on every `pointerdown` breaking focus — and each
carries its own comment explaining the fix. Three sites, three prose explanations, one bug.

Consolidation is **#214's**, held out of the map by #201 constraint 2. What this inventory adds to
#214: the count is six, #7 is a genuinely different mechanism and should be assessed separately
rather than assumed in, and the merged interface has to take the click-suppression behaviour as an
option because #1 does not want it and #2/#5/#6 do.

**Carousel implementations are three, not one**: `wireScrollCarousel` (824), the stats carousel
(2902) and home.html's referral carousel. Only the `.senco-carousel` uses `wireScrollCarousel`.

---

## 7. `window` as the current import graph

18 assignments onto `window` in `main.js`, of which 13 are the public interface and 5 are the
media-query state §3 identifies as the blocker:

```
rafThrottle  initSelectable  wireDisabledTooltips  setupOverflowTabs  setupFilterBarMoreFilters
resyncFilterTriggerWidths  enhanceSelect  enhanceDateInput  enhanceTimeInput
initFusedFieldStacking  enhanceFormControls  uiSelectRowAdders  __setDevBpTouch
isFilterBarMobile  isFilterBarNarrowDesktop
studentsNarrowMql  studentsPortraitMql  studentsPortraitWideMql
```

Taxonomy §3 says this convention dies with the migration — *"none installs itself on `window`; an
import graph replaces it"*. Two consequences worth stating before execution:

1. **The `window` list is the honest module boundary.** Every name on it is reachable from outside
   `main.js` today, so the split cannot make any of them private without checking consumers —
   `panel.js` and the inline template scripts are the callers, which is #212's territory.
2. **`__setDevBpTouch` is a dev-tools hook, not an interface.** It stays on `window` deliberately
   after the migration, or the breakpoint dev presets stop working. Worth an explicit note in
   `layout/breakpoints.js`'s header so a later tidy-up does not remove it as dead code.

---

## 8. Summary counts

| | Total | Code | **G** | **D** | **M** |
| --- | --- | --- | --- | --- | --- |
| `main.js` | 5,251 | 2,605 | ~5,050 (36 of 38 regions) | 16 (the `.senco-` call) | ~382 (regions 1492–1676, 3774–3970) |

Set against #200's figures for the other two files, the contrast is the finding:

| | Total | Code | Dominant mark |
| --- | --- | --- | --- |
| `panel.css` | 11,810 | 3,833 | **M** (~6,100) |
| `panel.js` | 5,345 | 3,000 | **M** (~2,000) |
| `main.js` | 5,251 | 2,605 | **G** (~5,050) |

The panel files were hard because most of them was a generic mechanism in domain clothing. `main.js`
is not that. Its difficulty is a different one and simpler to state: **one 2,550-line closure with
shared media-query state, and a filter bar scattered across nine non-adjacent regions.** Both are
ordering problems, not discovery problems — which is why this inventory can name the extraction
order (`layout/breakpoints.js` first) where #200 could not.

---

## 9. Execution log

### Slice 1 — `layout/breakpoints.js` ✅

Everything §3 predicted about the ordering held, and one thing it did not predict:

- **`narrowMql` was already taken.** §4.1 said to rename `studentsNarrowMql` to its registry tier
  name, "narrow". The sidebar block already had a `narrowMql` — the **1200px rail tier**. Renaming
  one onto the other's name without moving the other is §6a lesson 1 exactly. Both moved into
  `breakpoints.js` in the same commit and each is now named for the tier it implements
  (`narrowMql` = 900, `railMql` = 1200). **The general form: two declaration sites for one tier list
  is what let two tiers claim one name.** There is one site now, which is what makes the next
  rename checkable rather than lucky.
- **The `window` surface shrank by three.** `studentsNarrowMql`/`studentsPortraitMql`/
  `studentsPortraitWideMql` had one reader — `setupFilterBarMoreFilters`, in `main.js` itself,
  which could not see the `DOMContentLoaded` locals. It imports them now, so all three globals are
  gone and §4.1's leak is closed. `isFilterBarMobile`/`isFilterBarNarrowDesktop` cannot follow
  until #212 moves their inline-`<script>` callers.
- **`main.js` became `type="module"`, and nothing outside it had to change.** Every external
  consumer already went through an explicit `window.*` property — checked against all 28 top-level
  names, and every bare-looking hit was prose in a comment. `panel.js` is a *non-deferred* classic
  script, so it already executed before `main.js` did under `defer`; module semantics keep that
  order identical.
- **Verification, since a browser was not driven:** both files pass `node --check` as modules; the
  module graph links and executes under a DOM stub with the `window.*` surface intact; the dev
  server serves `layout/breakpoints.js` as `text/javascript`; and panel home/students render 200.

### Slice 2 — four `layout/` modules, plus the two helpers they needed ✅

`settings-panel.js`, `identity-switcher.js`, `app-search.js`, `content-shell.js`, and the
`components/dom.js` + `components/raf-throttle.js` they depend on. **`main.js`: 2,605 → 2,228 code
lines.**

- **A dependency probe, not eyeballing.** For each candidate range: which identifiers does it use
  that are declared outside it? That is exactly the import list, and it is what decides whether a
  cut is mechanical or a rewrite. All four blocks came back clean once the probe was right —
  `app-search` needs `closest`, `content-shell` needs `rafThrottle`, the other two need nothing.
- **The probe was wrong twice before it was right, and both bugs read as good news.** First it
  used `` `\b${n}\b` `` in a *template literal*, where `\b` is a backspace character rather than a
  word boundary, so the filter matched nothing and every block reported "no dependencies". Then its
  "declared outside" set included function-locals from unrelated blocks, so it reported noise.
  **A dependency checker that cannot fail loudly will report "no dependencies" for a block that has
  them**, which is the one answer that makes a bad cut look safe. It is validated now against a
  known-true case (`app-search` must show `closest`) — keep that check when reusing it.
- **One cut improved on §5.3's guess.** `setupViewFullSystemToggle` was grouped with the cookie
  switchers by line adjacency; it belongs with the settings panel, which is what its own comment
  says (it contrasts itself with the theme-mode toggle). Adjacency is not membership.
- **Verified in a browser this time**, behaviourally rather than by presence: app search filters,
  renders its hub icons and closes on an outside click (the `closest` import path); identity search
  filters 17 → 1 → 17; the theme toggle flips `data-theme-mode`, persists to `localStorage` and
  restores; the content shell's pinned height recalculates on resize (the `rafThrottle` import
  path). Zero console errors or warnings on home, hub, panel home, students and portal-admin.

### Slice 3 — the rest of `layout/`, in two halves ✅

**3a, the sidebar cluster:** `sidebar.js`, `hub-rail.js`, `overlay-nav.js` and the
`components/backdrop.js` they share. These could not be separated — `overlay-nav` calls
`positionHubRailSeam` so the seam follows the active item, and both the sidebar's touch
expand-in-place and every overlay share one backdrop element.

**3b, the independents:** `breadcrumbs.js`, `sticky-zone.js`, `mobile-tabbar.js`,
`components/card-switcher.js`, `components/selectable.js`, `pages/mat-home.js` — the first use of
`pages/`. **`main.js`: 2,228 → 1,849 code lines.**

- **The probe needed two more fixes, and both failed the same way as the first.** Its
  declared-outside set held only module-scope names, so it could not see one block inside the
  `DOMContentLoaded` handler depending on another — widening it to handler scope is what revealed
  `overlay-nav`'s use of `addBackdrop` at all. Then its free-use test counted a name appearing
  inside a string or a kebab class, so `icon-tooltip-host` read as a use of `host` and `aria-label`
  as a use of `label`. **Three bugs, all resolving toward "no dependencies."** That is the direction
  a dependency checker must never fail in, and it is now pinned in both directions: `overlay-nav`
  must report `addBackdrop`, and `sidebar` must not report its own locals.
- **Two boundaries were wrong, and the probe caught neither.** `hub-rail` had swallowed
  `overlay-nav`'s leading comment; the sidebar block had a trailing `js-preload` lift that is boot
  ordering rather than sidebar behaviour. Both were found by *reading the extracted file*. A
  dependency probe answers "what does this need", never "is this the right thing".
- **One deletion that had to be undone.** `window.initSelectable` went out with the block it sat
  under. Panel's `home.html` calls it after an AJAX fragment swap, so it is back beside
  `window.rafThrottle` under one comment saying why both survive until #212.
- **Verified in a browser, including the failure modes the comments describe:** the backdrop
  survives an overlay-to-overlay switch (the stale-timer bug its own comment records), the
  suppressed rail-active item is restored once every overlay closes, desktop collapse persists and
  relabels, touch expand-in-place adds and clears the backdrop, `.is-stuck` toggles on scroll and
  clears on the way back, single-select `.chosen` is mutually exclusive, the card switcher moves and
  restores, and at 430px the tray still sizes itself from the two FAB measurements. Zero JS console
  errors across six pages.

### Slice 4 — `components/filter-bar/`, in two halves ✅

**4a:** `more-filters.js`, `sections.js`, `section-scroll.js`, plus `components/carousel.js` because
section-scroll imports it. **4b:** `tray-position.js`, `expand-collapse.js`, `ajax-form.js` and
`wire.js`. **`main.js`: 1,849 → 1,173 code lines.** The filter bar is seven modules, one call.

- **§5.2's shape held, and one module deliberately did not split.** `more-filters.js` covers three
  non-adjacent regions of the old file because `setupFilterBarMoreFilters` and
  `wireMoreFiltersToggle` are mutually recursive — the trigger builder calls the toggle, and the
  toggle re-enters the builder's `measure()` after a reflow. Splitting along the old line numbers
  would publish that recursion as a file boundary. 233 code lines in 765 total: over the review
  trigger on total, under it on code.
- **The file/folder collision resolved as §5.2 predicted** — `components/filter-bar.js` →
  `filter-bar/active-state.js`, keeping its `window.*` so the six inline callers are untouched.
  **Two templates load it and I repointed one**, because the grep I checked was truncated at eight
  lines and I read a missing second hit as proof there wasn't one. The browser console caught it: a
  404 plus `window.wireFilterBarActiveState is not a function`. Third time in this migration a
  truncated or mis-scoped search has answered "nothing there" and been believed.
- **Module bodies run before `DOMContentLoaded`, so side effects need an init.** `tray-position.js`
  ends in a block that measures the tab bar immediately; left at module scope it would have measured
  at a different point in the page lifecycle. It is `initTrayPosition()`, called from the same place
  the old code ran.
- **A correction to what slice 4a's commit message claims.** It records a pre-existing bug —
  the tray keeping `.is-expanded` after close while `aria-expanded` returns to false. There is no
  bug. The close path deliberately holds the class for the whole 720ms height animation (its own
  comment says why: several tray styles are scoped to `.is-expanded`, so stripping it early makes
  the box visibly fall back to non-mobile styling mid-shrink). The 600ms sample landed inside the
  animation; sampling at 900ms shows it cleared. **Two observations agreeing is not a finding when
  both share one wrong assumption** — the stash-and-compare that "confirmed" it used the same short
  wait against both versions, so it could only ever agree.
- **Verified in a browser:** tray opens and closes fully with its inline `top`/`left`/`width`/
  `max-height` cleared on close (the stray-line fix), clicking a field's label opens its popover,
  the AJAX dashboard bar updates in place — proven by a `window` marker surviving the change, not
  just by the URL moving — and at 430px the tray pins to the bar's rect and stops above the tab bar.
  Zero console errors.

### Slice 5 — the last two IIFEs: popovers, form controls, the KPI carousel ✅

`popover.js`, `select.js`, `date-input.js`, `time-input.js`, `fused-field.js`, `form-controls.js`,
`select-row.js`, `stats-carousel.js`, `layout/page-header-actions.js`, and `components/format.js`
for a shared `pad2`. **`main.js`: 1,173 → 213 code lines** — under the review trigger for the first
time since this file existed as one thing. What remains is `syncDisabledTooltip`/
`wireDisabledTooltips`, `setupOverflowTabs`/`buildOverflowFade`/`setupOverflowDragScroll`, and a
`DOMContentLoaded` handler of ~15 `init*()` calls in the order they always ran in.

- **Two boundary slips in the same extraction, both caught before commit.** `form-controls.js`
  first grabbed 1919–1951, which is `initFusedFieldStacking` *and* `enhanceFormControls` both —
  `initFusedFieldStacking` actually starts at 1919, not 1935, so it printed with an unclosed IIFE
  wrapper stitched onto the end. Re-derived the boundary from a fresh grep rather than trusting the
  number in my head and it split cleanly at 1926/1935. Second: a `sed -n` preview of
  `setupPageExtrasOverflow`'s bounds was stale from an earlier point in this same slice (main.js had
  shifted under it since); re-grepped fresh and the true range was 494, not 491, off by exactly the
  three lines the earlier edit had removed elsewhere.
- **A shared-preamble constant split unevenly, and it shipped before the browser caught it.**
  `CALENDAR_ICON_SVG`/`CLOCK_ICON_SVG`/`MONTH_NAMES`/`daysInMonth` were declared once, together,
  ahead of both `enhanceDateInput` and `enhanceTimeInput` in the original closure. Splitting the
  closure in two put all four in `date-input.js` by line-range accident — `CLOCK_ICON_SVG` is never
  read there, only assigned. `time-input.js`, which actually uses it, got nothing. `node --check`
  passed (it's valid syntax, just a runtime `ReferenceError`); `enhanceFormControls`'s own
  `try`-free forEach loop meant one throw aborted the whole enhancement pass for every remaining
  field on the page. Found live: opening "New Panel Meeting" left the dialog un-enhanced past the
  date field. Moved to the file that uses it, with a comment on why a clock icon was ever declared
  in the date module.
- **A side-effect-only module needs an explicit import, and I shipped one that didn't have one.**
  `select-row.js` has zero exports — its only job is the `document.addEventListener('click', ...)`
  it attaches at module-load time. Nothing in `main.js` referenced it by name, so nothing forced the
  browser to fetch or execute it, and the listener silently never attached. `node --check` cannot
  catch this — the file is valid on its own; the bug is an absent import in a *different* file.
  Found by testing the actual feature end to end (the "Create new Panel Group" quick-add button did
  nothing), not by any static check. Swept every other new module for the same shape — one file
  with zero exports (a real hit) turned out to load via its own `<script src>` tag, not an import,
  so it needed nothing.
- **Both bugs were invisible to every check that ran before the browser did**: `node --check` on
  every file individually, the linked-module-graph execution under a DOM stub, `check_stale_comments`,
  `check_file_size`. All passed on both bugs. A hand-rolled static "undeclared free identifier"
  scanner was attempted for the `CLOCK_ICON_SVG` class of bug and abandoned — its own regex-based
  string/comment stripping had false positives (bare words leaking out of what should have been
  stripped string literals), and a heredoc pass silently dropped backslashes from its source twice
  while writing it, the same class of tooling failure as the truncated-grep in slice 4a. A checker
  that cannot be trusted to be right is worse than no checker: it was worth building, and worth
  discarding once it proved unreliable rather than shipping "clean" results from it.
- **The methodology for finding both bugs, once browser-checked, still needed a second pass to
  trust.** The first click-delegation test used a synthetic `.ui-select-row` container that (it
  turned out, on inspection) no real template in this codebase ever pairs with `data-add-trigger` —
  a latent gap in the original selector's comma-concatenation, not a regression. The real regression
  was confirmed only by testing the actual "Create new Panel Group" button against a genuinely fresh
  page load, comparing content-length before/after rather than dialog-open count (which never
  changes — the feature swaps content into the existing dialog, it doesn't open a second one), and
  stash-comparing against pristine `main` with the identical signal. Two of those three signals were
  wrong on the first attempt; only the third was trustworthy.
- **Verified in a browser:** `enhanceSelect` opens/picks/writes/closes and fires a real `change`
  (referrals filter navigated); `enhanceDateInput`'s day/month/year triplet and its calendar-grid
  popover both write the native input; `enhanceTimeInput`'s spinner arrows write it too, with the
  clock icon rendering; `initFusedFieldStacking` genuinely stacks rows that don't fit (2 of 7 groups
  on a real discussion page) and leaves the rest inline; `select-row.js`'s delegated "+" opens the
  inline Panel Group create form, confirmed against a pristine baseline; the KPI carousel's arrow
  click and pointer-drag both scroll. Zero console errors across nine pages at desktop and 430px.

Remaining, in order — each unblocked by the one above it:

| Item | Owner |
| --- | --- |
| `.senco-*` already promoted into `static/css/` under a domain name (§4.2) | new issue — a live breach of rule 1 on shipped files |
| Drag-to-scroll ×6 plus the sidebar's seventh variant (§6) | #214 |
| Adding `static/js/pages/` and `static/js/layout/` to taxonomy §1's tree, now that both are populated | the execution issue's wrap-up |
