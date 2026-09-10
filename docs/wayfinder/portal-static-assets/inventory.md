# Inventory: `panel.css`, `panel.js`, and the panel templates' inline `<script>`s

Fact-finding for [#200](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/200), under the
map [#198](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/198). Feeds the promotion list
(#201) and the taxonomy. Nothing here is a decision — it is what is in the files.

Line ranges are as of `fc0bee0` (branch `feature/breakpoint-device-presets`).

## Nature test

#198 settled that shared-vs-hub-owned is decided by **nature, not usage**. Every region below is
classified:

| Mark | Meaning |
| --- | --- |
| **G** | Generic UI behaviour. No SEND/Panel vocabulary. Portal-wide by definition. |
| **D** | Carries domain vocabulary (Referral, Action, Panel, Meeting, Agenda, Safeguarding, Escalation, Student). Hub-owned. |
| **M** | Mixed — a generic mechanism whose selectors/identifiers are spelled in domain terms. Splits into a G part and a D part; the split is the work. |

"Domain vocabulary" is read strictly per #198: `#my-referrals-list` is domain, `.row-facts-cols` is
not, and a carousel does not become domain-specific by being wired to referrals.

---

## 1. `panel.css` — 11,810 lines, 16 regions

Comment percentages are per-region; #199's global figure (61%) is not evenly distributed — it ranges
from 25% to 74%, and the two largest regions are the two most comment-heavy.

| # | Lines | Region | Total | Code | Cmt | Nature |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1–16 | `.sr-only` visually-hidden utility | 16 | 11 | 25% | **G** |
| 2 | 17–660 | Panel Home cards, `.list-page-shell` fill, stack mode, collapsible cards, phone reclaim | 644 | 293 | 52% | **M** |
| 3 | 661–1930 | Home carousels: `.carousel-filter` dropdown, `#my-referrals-list` + `#my-actions-list` carousel modes (fades/arrows/dots/count), `.action-status-dropdown` | 1,270 | 631 | 48% | **M** |
| 4 | 1931–2305 | `.stats-carousel-*` + `.activity-list` | 375 | 160 | 56% | **G** |
| 5 | 2306–3040 | Card/list/item primitives: `.panel-card*`, `.panel-list`, `.panel-item-*`, `.panel-thumb*`, `.tab-row`, `.status-pill` status modifiers | 735 | 348 | 46% | **M** |
| 6 | 3041–3440 | Meeting card (`.meeting-card-*`, `.meeting-info-label`, `.bd-pill`) | 400 | 94 | 74% | **D** |
| 7 | 3441–5560 | Shared list-row detail — see §1.1 | 2,120 | 558 | 73% | **M** |
| 8 | 5561–8968 | Filter bar tray / mobile mode / phone chrome — see §1.2 | 3,408 | 859 | 73% | **G** |
| 9 | 8969–9060 | `.ui-segmented--action-status`, `.is-submitting`, `.meetings-scroll` | 92 | 33 | 57% | **M** |
| 10 | 9061–9460 | Setup/Discussion column layout (`.setup-col*`, `.discussion-col*`, `.agenda-layout`), `.tab-row` overflow, `count-pulse` keyframes | 400 | 223 | 40% | **M** |
| 11 | 9461–9760 | Agenda table, `.ui-select-trigger/panel`, QA fields (`.qa-*`), `.panel-toolbar`, discussion timers | 300 | 185 | 33% | **M** |
| 12 | 9761–9965 | Safeguarding briefing/notes cards, DSL shell, note rows | 205 | 125 | 36% | **D** |
| 13 | 9966–10145 | Detail stat cards, rings, attendance bars/legends, `.note-thread` | 180 | 83 | 48% | **G** |
| 14 | 10146–11020 | Meeting setup + agenda rows, order rail, drag/drop zones, referral detail/history | 875 | 350 | 56% | **D** |
| 15 | 11021–11713 | Modals (`.modal-dialog*` and per-dialog ids), member picker, member cards, `#panel-search-dialog` | 693 | 393 | 40% | **M** |
| 16 | 11714–11810 | Home cards tail + touch scrollbar-hide audit | 97 | 63 | 34% | **M** |

Only 15 of these boundaries were discoverable from the file's own headers — the file has banners at
3056, 3241, 3445, 6656, 7110, 8287, 8703, 8988 and 11766 only. Regions 2, 3, 5, 7, 10–15 were derived
by selector-root clustering, not read off the file.

### 1.1 Region 7 (3441–5560) broken down

The "shared list-row detail" banner at 3445 covers Students/Referrals/Actions, but the block is not
one thing:

| Lines | Content | Nature |
| --- | --- | --- |
| 3441–3453 | `#meetings-filtered-content` tail of region 6 | D |
| 3454–3534 | `.row-title-row`, `.row-title-pills`, `.row-title-sep`, `.row-secondary-text` | G |
| 3535–3752 | `.row-facts-cols` / `-track` / `-arrow` — the facts strip's scroll chrome | G |
| 3753–3989 | `.row-fact-col`, `.row-fact-col-clamp`, scoped per page id | M |
| 3990–4108 | `.entity-list`, `.entity-row`, `.btn-row`, `.row-btn-row-stacked` | G |
| 4109–5560 | Per-page row detail, **interleaved**: `#escalations-filtered-content`, `#actions-filtered-content`, `#students-filtered-content` alternate 26 times across 1,450 lines | D |

That last band is the file's real structural problem in miniature: three pages' rules are shuffled
together rather than blocked, so "the Actions row rules" is not a range.

### 1.2 Region 8 (5561–8968) broken down

The 3,400-line unlabelled stretch #198 flagged. It is the filter bar, and it is **not contiguous** —
per-page list rules are threaded through it:

| Lines | Content | Nature |
| --- | --- | --- |
| 5561–5796 | `.filter-bar-tray` opening, `.page-subtitle-stats`, `.sticky-header-zone--flush-top`, `.btn-count-badge` | G |
| 5797–6040 | `#students-filtered-content` — 244 lines of page rules mid-block | D |
| 6041–6737 | Tray shell, `.filter-tray-content`, `.filter-section-label`, `.filter-bar-toggle-icon` | G |
| 6738–6895 | `.filter-scroll-more-*`, `.filter-scroll-arrow`, `.filter-scroll-active` (#186 scrolling sections) | G |
| 6896–6995 | `#students-filtered-content` again | D |
| 6996–7104 | `.filtered-content` | G |
| 7105–8425 | `.filter-bar-mobile-mode`, `.phone-chrome`, `.phone-chrome-side`, `.filter-bar-narrow-desktop`, `.filter-bar-mode-switching` (#187 hoist) | G |
| 8426–8968 | `.filtered-content`, more mobile-mode, `.phone-chrome-side` | G |

**859 code lines of filter-bar CSS with zero domain vocabulary sit in a SEND stylesheet**, while
`static/css/components/forms.css` and `static/css/layout/responsive.css` already own `.filter-bar*`
(38 and 20 occurrences respectively). This is the single largest promotion candidate in the map.

---

## 2. `panel.js` — 5,345 lines, 22 regions

Nine anonymous IIFEs, each a single-dialog module keyed on `getElementById(...)` returning early;
plus free functions at top level and a `DOMContentLoaded` block at 5216 that never closes before the
`#panel-search-dialog` IIFE opens inside it (5220–5344).

| # | Lines | Region | Total | Code | Cmt | Nature |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1–365 | Shared helpers: `resolvePanelSchoolFilter`, `wireFilterBarActiveState`, `wireListInfiniteScroll`, `closeModalWithFadeOut`, `animateModalHeightChange`, `setFadeHidden`, `snapshotFormValues`, `formValuesDirty`, `confirmModalDiscard` | 365 | 176 | 48% | **M** — 1 of 9 is domain (`resolvePanelSchoolFilter`) |
| 2 | 366–673 | `#new-referral-dialog` | 308 | 237 | 13% | **D** |
| 3 | 674–1506 | `#panel-group-dialog` (largest dialog; autosave-on-blur, `panel-group:updated` event) | 833 | 456 | 37% | **D** |
| 4 | 1507–1641 | `#panel-meeting-dialog` | 135 | 110 | 9% | **D** |
| 5 | 1642–1705 | `#meeting-start-dialog` (attendance fragment) | 64 | 49 | 12% | **D** |
| 6 | 1706–1913 | `#action-form-dialog` (create-only) | 208 | 127 | 32% | **D** |
| 7 | 1914–1952 | `#discussion-summary-dialog` | 39 | 30 | 12% | **D** |
| 8 | 1953–2039 | Inline action-row autosave (`[data-actions-list]`) | 87 | 62 | 24% | **D** |
| 9 | 2040–2298 | `initMemberPicker` + `resetMemberPicker` | 259 | 182 | 22% | **M** |
| 10 | 2299–2435 | `initActionAssignFields` | 137 | 111 | 10% | **D** |
| 11 | 2436–2549 | `flash`, `setTabCollapsed`, `pulseCount`, `recountTabsFromRows` | 114 | 65 | 37% | **G** |
| 12 | 2550–2730 | Row grow-in/shrink-out (Web Animations API), `diffPatchRowList` | 181 | 113 | 32% | **G** |
| 13 | 2731–2812 | `beginFetchSeq`/`isCurrentFetchSeq` stale-response guard, `wireRowRemoveForm` | 82 | 53 | 31% | **G** |
| 14 | 2813–2858 | Drag-to-scroll for `.row-facts-cols` (mouse only) | 46 | 32 | 30% | **G** |
| 15 | 2859–3555 | Facts-strip measurement: `debounceTrailing`, `markFactsStripEdges`, `naturalFactsColumnWidths`, `fillFactsColumns`, `syncFactsColumnWidths`, `updateFactsLineLayout` + the measurement-cache generation counter | 697 | 215 | 69% | **G** |
| 16 | 3556–3674 | Stack-mode: `factsStripLine`, `factsStripNeed`, `calibrateStackMode`, `updateListStackMode` | 119 | 55 | 53% | **G** |
| 17 | 3675–3823 | `updateButtonRowOverflow`, `syncMeetingsButtonColumnWidth`, `measureButtonRowNatural` | 149 | 53 | 64% | **M** |
| 18 | 3824–4018 | Facts edge wiring, MutationObserver refresh, `animatedScrollBy`, arrow click delegation | 195 | 78 | 59% | **G** |
| 19 | 4019–5046 | `initAgendaDragDrop` — sink/pool zones, live reorder, autoscroll | 1,028 | 563 | 40% | **M** |
| 20 | 5047–5196 | `#expertise-quick-add-dialog`, `#external-contact-quick-add-dialog` | 150 | 107 | 22% | **D** |
| 21 | 5197–5219 | `initExpertiseField(s)` + the `DOMContentLoaded` opener | 23 | 13 | 34% | **D** |
| 22 | 5220–5345 | `#panel-search-dialog` (nested inside region 21's callback) | 126 | 99 | 12% | **D** |

**Generic by nature: regions 11–16, 18, plus 6 of 9 helpers in region 1** — roughly 1,050 lines
(≈600 code lines) of measurement, animation, fetch-sequencing and scroll-chrome machinery with no
domain vocabulary at all. Region 15 alone (facts-strip measurement, 697 lines / 69% comment) is a
self-contained generic module.

`BUTTON_ROW_SELECTORS` (3675) and `LIST_ROOT_SELECTOR` (3556) are the seam in regions 16–17: generic
algorithms configured by a hardcoded list of five domain page ids. Splitting those is a parameter
change, not a rewrite.

---

## 3. Inline `<script>` blocks

Every non-`src` script block of 5+ lines reachable from a panel page. Total **5,218 lines**, i.e.
comparable in size to `panel.js` itself.

| File | Script lines | `{{ }}`/`{% %}` refs | Blocks | Contents | Nature |
| --- | --- | --- | --- | --- | --- |
| `panel/home.html` | 1,255 | **0** | 1 | `wireCarouselFilterDropdown`, `wireActionStatusFilters`, `wireActionStatusOverflow`, `setupTabs`, `wireCardCollapseToggles`, `wireReferralCarouselInteractions` + `rebuildReferralCarousel`, `wireActionCarouselInteractions` + `rebuildActionCarousel`, `initActionTabs`, `wireActionForms`, `refreshMyActionsCard` | **M** |
| `_hub_sidebar.html` (portal-wide) | 1,719 | 139 | 1 | Sidebar, switchers, mobile sheet — reaches *into* panel assets, see §4 | G |
| `layout.html` (portal-wide) | 699 | 1 | 6 | Boot-time theme/class setup | G |
| `panel/meeting_agenda.html` | 263 | 2 | 7 | Panel timer, attendance dialog, inactivity poll + warning countdown, review-date dialog, `panel-group:updated` patch | D |
| `panel/students.html` | 240 | 3 | 1 | Filter bar wiring, `refreshRegOptions`, `setupToggle`, MutationObservers, `wireStudentsInfiniteScroll`, `wireStudentButtonColumnWidth` | M |
| `panel/safeguarding_notes.html` | 205 | 1 | 1 | Filter wiring, `refreshRegOptions`, `setupToggle`, detail-pane swap | M |
| `panel/meeting_setup.html` | 182 | 1 | 3 | Chair pills, members-list patching, `initReferralTabs` (localStorage-backed) | D |
| `panel/discussion.html` | 180 | 3 | 3 | Discussion timer, safeguarding dialog, end-discussion dialog + follow-up date, leave-confirm guard | D |
| `panel/actions.html` | 149 | 6 | 1 | Filter wiring, `wireActionButtonLayout`, `refreshRegOptions`, `refreshTermOptions` | M |
| `panel/referrals.html` | 95 | 2 | 1 | Filter wiring, `refreshRegOptions`, `setupToggle`, `refreshTermOptions` | M |
| `panel/escalations.html` | 80 | 5 | 1 | Filter wiring, `refreshTermOptions`, `syncEscalationButtonWidths` | M |
| `panel/meetings.html` | 58 | 3 | 1 | Filter wiring, `refreshTermOptions` | M |
| `panel/panel_group_settings.html` | 36 | 0 | 1 | `panel-group:created`/`:updated` row patching | D |
| `panel/escalate_form.html` | 13 | 0 | 1 | Small form toggle | D |

`home.html`'s 1,255 lines with **zero template refs** is confirmed — it is movable as-is, and it is
the largest single body of JS in the panel outside `initAgendaDragDrop`. The `{{ }}` counts on the
list pages are all the same two shapes: a `|escapejs` JSON blob (`forms_by_year_json`,
`terms_by_academic_year_json`, `reg_by_year_json`) and a `|date:"c"` timestamp — both of which are
data hand-offs, not logic, so they can become `data-` attributes without touching the code around
them.

---

## 4. Duplication

### 4.1 Panel reimplements something portal-wide already has

1. **Carousel — three implementations, split the wrong way round.**
   - `wireScrollCarousel()` (`static/js/main.js:840`, generic: track/prev/next/drag/arrows) is used
     for `.senco-carousel` (main.js:2903) and the filter-section scroll (main.js:1342).
   - `.stats-carousel-*` has its **JS in `main.js:2918`** and its **CSS split** between
     `panel.css:1931–2305` (375 lines) and `static/css/components/cards.css` +
     `static/css/layout/responsive.css`. Its only markup is `panel/home.html`.
   - The referral and action carousels in `home.html` (≈700 lines, 752–1156 and 1157–1434) **do not
     call `wireScrollCarousel` at all** — they hand-roll arrows, dots, fades, count readout, pointer
     drag, fling velocity and scroll-snap twice over, once per card, near 1:1 with each other. Their
     CSS (`panel.css:661–1930`, 1,270 lines) is likewise two near-identical halves.

   So the generic carousel exists in `main.js` but the three richest carousels in the portal each
   bypass it, and 1,645 lines of carousel CSS live in the hub file.

2. **Drag-to-scroll — four copies** of the same `pointerdown` / `DRAG_THRESHOLD = 6` /
   `setPointerCapture` pattern: `setupOverflowDragScroll` (main.js:224), `wireScrollCarousel`'s own
   (main.js:890), `panel.js:2813` for `.row-facts-cols`, and `home.html`'s two carousel blocks
   (920–1046, 1278–1373). `panel.js:2823` names the duplication in a comment.

3. **Filter bar CSS** — §1.2. 3,408 lines in `panel.css` against `.filter-bar*` rules that already
   live in `forms.css` and `responsive.css`, driven entirely by main.js
   (`setupFilterBarMoreFilters`, `wireFilterSectionScroll`, `isFilterBarMobile`,
   `positionFilterTray`, `groupFilterSections`).

4. **`.sr-only`** (`panel.css:1–16`) is the repo's only definition of a portal-wide a11y utility, and
   it is in the hub stylesheet. Used by 7 panel templates.

5. **Split component ownership.** `.panel-card` (83 refs in panel.css, also in `cards.css` +
   `responsive.css`), `.entity-row`/`.entity-list` (145 refs, also across four `static/css` files),
   `.tab-row` (62, also three), `.ui-select-trigger` (26, also five), `.modal-dialog` (27, also
   three), `.btn-row` (33, also `buttons.css`), `.filter-bar-tray` (110 vs 38). `.status-pill` is
   the one clean case: `pills.css` owns the base, `panel.css` adds only the domain status
   modifiers — that is the shape the others should end up in.

6. **`debounceTrailing`** is defined in `panel.js:2908`, is generic, and is called from three panel
   templates; its own comment says it "pairs with `window.rafThrottle` (main.js)". The pair is split
   across a portal file and a hub file.

### 4.2 Portal-wide code reaching into panel

This is the direction that makes the split urgent, not just tidy.

1. **`templates/hubs/_hub_sidebar.html`** — portal-wide, on every page of every hub — carries five
   comments saying it duplicates `panel.css` values *because* `panel.css` isn't guaranteed loaded
   (lines 862, 867, 875, 934, 967, 994), overrides `dialog#panel-search-dialog` positioning with
   `!important` (1036, 1090, 1132), and calls **`animateModalHeightChange` from `panel.js`** (1051).
   A portal-wide partial has a runtime dependency on a hub script and a copy-paste dependency on a
   hub stylesheet.
2. **`templates/layout.html:66`** reasons about `.filter-bar-collapsible (panel.css)`.
3. **`main.js:2683`** selects `.panel-card .tab-row` by name; **`main.js:2918`** wires
   `.stats-carousel-wrap`. Portal JS targets panel-named classes.
4. **`hubs/portaladmin/{home,themes}.html`** load `panel.css?v=42` — the developer console pulls an
   11,810-line SEND stylesheet for its generics. `hubs/inclusion/hub.html` loads both files at
   `?v=107` / `?v=14`, against `_base.html`'s `?v=465` / `?v=136` — three independent cache-bust
   counters on two files, already drifted.

### 4.3 Duplication inside panel (template ↔ template, template ↔ `panel.js`)

Not asked for, but it is the same body of code and it changes the shape of the promotion list:

| Pattern | Copies |
| --- | --- |
| Dependent-select refresh (`refreshRegOptions` / `refreshTermOptions`) | 6 — students, actions, referrals, escalations, meetings, safeguarding_notes |
| Button-column width sync | 4 — `syncMeetingsButtonColumnWidth` (panel.js:3770), `wireStudentButtonColumnWidth` (students.html:518), `wireActionButtonLayout` (actions.html:237), `syncEscalationButtonWidths` (escalations.html:219) |
| `setupToggle(toggle, input)` | 3 — students, referrals, safeguarding_notes |
| mm:ss timer tick with local `pad()` | 3 — meeting_agenda ×2, discussion ×1 |
| Infinite scroll | 2 — `wireListInfiniteScroll` (panel.js:87, described in its own comment as generic) and `wireStudentsInfiniteScroll` (students.html:458) |
| Dialog open/close | `closeModalWithFadeOut` (panel.js:151) exists, yet discussion.html:585 and meeting_agenda.html:543/547 define their own `openDialog`/`closeDialog` |

---

## 5. Summary counts

| | Total lines | Code lines | Clearly **G** | Clearly **D** | **M** |
| --- | --- | --- | --- | --- | --- |
| `panel.css` | 11,810 | 3,833 | ~4,000 (regions 1, 4, 8, 13 + G sub-bands of 7) | ~1,700 (6, 12, 14 + 4109–5560) | ~6,100 |
| `panel.js` | 5,345 | 3,000 | ~1,050 (11–16, 18, most of 1) | ~2,300 (2–8, 10, 20–22) | ~2,000 (9, 17, 19) |
| Panel inline scripts | 2,756 | — | — | ~750 | ~2,000 (home.html dominates) |

The **M** column is the map's actual workload: most of both files is a generic mechanism wearing
domain-named selectors, which is why the split is discovery rather than cutting at existing seams.
