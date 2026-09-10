# The promotion list

Decision record for [#201](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/201), under the
map [#198](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/198). Built on the #200 inventory
([inventory.md](inventory.md)) — read that first; this file assumes its region numbers.

Line ranges are as of `fc0bee0`.

## What this decides, and what it doesn't

**Decides:** which regions of `panel.css`/`panel.js` become portal-wide, which tier each lands in,
what the promoted things are called, what the three cross-hub imports load afterwards, and what
moves in the *other* direction out of `static/`.

**Doesn't decide:** the target folder and file list (#204), ES module linkage (#202), the rule for
inline template scripts (#203), how the migration is sliced into execution issues (#198, still open).
Entries below name symbols and destinations, never `import`/`export` — that is #202's to supply for
the whole list at once, and writing it here would encode an answer that ticket hasn't given yet.

### Constraints this list was built under

Settled while grilling; every entry obeys them.

1. **The line is drawn inside every mixed region now**, not deferred to execution. Mixed regions are
   ~6,100 of `panel.css`'s 11,810 lines and ~2,000 of `panel.js`'s 5,345 — deferring them means
   shipping a convention that never touches the majority of the files it exists for.
2. **Relocate, don't rewrite.** The one exception: CSS blocks that are textually identical modulo
   the selector may be collapsed, because nothing renders differently and a diff proves it. No JS is
   consolidated, and the three carousel *implementations* stay three.
3. **A tier holds what has nowhere else to go.** Test for the `list-page` tier: could a page outside
   the list pattern use this sensibly? If yes it is a component.
4. **Promoted names don't say "panel".** Renames happen at promotion, not as a later pass.
5. **Both directions.** What leaves `static/` for a hub is on the same list as what leaves the hub.

---

## 1. Tiers

Four destinations. #204 turns these into actual files.

| Tier | Holds | Existing home |
| --- | --- | --- |
| **component** | Anything a page outside the list pattern could use — cards, rows, pills, modals, form controls, empty states | `static/css/components/`, `static/js/` |
| **list-page** | The filterable-entity-list pattern's own machinery: facts-strip measurement, stack mode, button-row overflow, row scroll chrome. Meaningless outside a list row. | *new* |
| **page** | Rules for one specific page's layout that aren't a reusable pattern | `static/css/pages/` (granted by #198) |
| **hub-owned** | Domain vocabulary: Referral, Action, Panel, Meeting, Agenda, Safeguarding, Escalation | stays in `hubs/inclusion/panel/static/` |

`list-page` is deliberately smaller than it first looked. Most of the *volume* a list page uses
(`.entity-row`, `.entity-list`, `.empty-note`, `.tab-row`, the filter bar) passes the "could another
page use it" test and is therefore **component**. What's left for `list-page` is the measurement
machinery — roughly 1,160 JS lines and the facts-strip CSS — which genuinely has nowhere else to go.

The filter bar is **component**, following its existing home in `components/forms.css`, even though
a list page is its only current consumer. Splitting it across two tiers to satisfy a taxonomy would
be worse than either tier alone.

---

## 2. `panel.css` — region by region

**G** = promotes whole. **D** = stays hub-owned whole. **M** = the line is drawn below.

| # | Lines | Nature | Verdict |
| --- | --- | --- | --- |
| 1 | 1–16 | G | → **component**. `.sr-only`, the repo's only definition of a portal-wide a11y utility. |
| 2 | 17–660 | M | see §2.1 |
| 3 | 661–1930 | M | see §2.2 |
| 4 | 1931–2305 | G | → **component**. `.stats-carousel-*`, `.activity-list`. Merge with the `.stats-carousel` rules already in `cards.css`/`responsive.css` — see §4. |
| 5 | 2306–3040 | M | see §2.3 |
| 6 | 3041–3440 | D | stays. Meeting card. |
| 7 | 3441–5560 | M | see §2.4 |
| 8 | 5561–8968 | G | → **component**. The filter bar, minus the per-page bands threaded through it (5797–6040, 6896–6995) which are **D**. Largest single promotion: ~859 code lines. |
| 9 | 8969–9060 | M | `.is-submitting` → component. `.ui-segmented--action-status`, `.meetings-scroll` → stay. |
| 10 | 9061–9460 | M | see §2.5 |
| 11 | 9461–9760 | M | see §2.6 |
| 12 | 9761–9965 | D | stays. Safeguarding briefing/notes. |
| 13 | 9966–10145 | G | → **component**. Detail stat cards, rings, attendance bars, `.note-thread`. |
| 14 | 10146–11020 | M | see §2.7 — **reclassified from D**; see §7. |
| 15 | 11021–11713 | M | see §2.8 |
| 16 | 11714–11810 | M | `.panel-home-cards` tail → **page**. Touch scrollbar-hide audit → component. |

### 2.1 Region 2 (17–660) — Panel Home cards, shell, stack mode

| Goes | Tier | Stays |
| --- | --- | --- |
| `.list-page-shell` and its fill/height chain | component | `.panel-home-cards`, `.panel-row-primary/-secondary` |
| `.panel-card-collapsible`, `.card-collapse-toggle`, `.card-collapse-chevron` — a generic collapsible card | component | `#referrals-card`, `#actions-card`, `#activity-card`, `#upcoming-meetings-list` |
| the end-of-list stripe (`::after` treatment, 240–362) | component | |

The `#*-card` id-scoped rules are the residue: they're Panel Home's layout, and under §1 they are
**page**, not hub-generic. Flagged for #204 — this is the clearest case for the `pages/` folder.

### 2.2 Region 3 (661–1930) — Home carousels

| Goes | Tier | Stays |
| --- | --- | --- |
| `.carousel-filter*` — trigger, chevron, menu, badge. A generic compact-dropdown-replaces-tabs control. | component | `#my-referrals-list`, `#my-actions-list` and their card/stack styling |
| carousel chrome: fades, arrows, dots, count readout | component | `.action-status-dropdown` (Action status is domain) |

**Apply constraint 2 here.** The referral and action halves are near-1:1 — same rules, different
class prefix. Collapse to one base plus two modifier blocks *as part of the move*; verify by diff
that nothing renders differently. This is the largest single application of the collapse rule
(~1,270 lines in, materially fewer out) and the one most worth doing during the move rather than
after, because the two halves drift every time one is touched.

### 2.3 Region 5 (2306–3040) — card/list/item primitives

| Goes | Tier | New name | Stays |
| --- | --- | --- | --- |
| `.panel-card*` | component | see §5 | `.status-pill.<status>` modifiers — `overdue_review`, `in_panel`, `awaiting_review`, `discussed`, `assigned`, `discussing`, `requires_follow_up`, … |
| `.panel-list` | component | see §5 | `.referral-category-row`, `.referral-meta-row` |
| `.panel-item-*` (body, col, header, title, meta, pills, note) | component | see §5 | |
| `.panel-thumb*` | component | see §5 | |
| `.tab-row` | component | keeps name | |
| `.activity-*` (icon, time) | component | keeps name | |

`.status-pill` is the model the whole list copies: `components/pills.css` already owns the base, and
`panel.css` keeps only the domain status modifiers. Region 5's card/list/item primitives should end
up in exactly that shape.

### 2.4 Region 7 (3441–5560) — shared list-row detail

Per inventory §1.1:

| Lines | Goes / stays | Tier |
| --- | --- | --- |
| 3441–3453 | stays (Meeting card tail) | — |
| 3454–3534 | `.row-title-row`, `.row-title-pills`, `.row-title-sep`, `.row-secondary-text` → goes | component |
| 3535–3752 | `.row-facts-cols`/`-track`/`-arrow` → goes | **list-page** |
| 3753–3989 | `.row-fact-col`, `.row-fact-col-clamp` → goes; the per-page id scoping stays | list-page + hub |
| 3990–4108 | `.entity-list`, `.entity-row`, `.btn-row`, `.row-btn-row-stacked` → goes | component |
| 4109–5560 | stays whole. Per-page row detail. | — |

⚠️ **4109–5560 needs verification at execution time.** The inventory found three pages' rules
interleaved 26 times across 1,450 lines. It is classified D wholesale on the strength of its id
scoping, which is a reasonable prior and not a line-by-line audit. Whoever executes should expect to
find generic rules stranded in there.

### 2.5 Region 10 (9061–9460) — setup/discussion layout

| Goes | Tier | Stays |
| --- | --- | --- |
| `.tab-row` overflow/collapse behaviour, `.tab-collapsed` | component | `.setup-col*`, `.discussion-col*`, `.agenda-layout`, `.members-register-col*`, `.panel-details-row` |
| `count-pulse-up`/`-down` keyframes + `.count-pulse-*` | component | |
| `.empty-note`, `.empty-note-inline` (9421–9446) | component | |
| `.entity-list--bleed` | component | |

`.empty-note` matters disproportionately: it's one of the seven classes `inclusion/hub.html` needs
(§6).

### 2.6 Region 11 (9461–9760) — agenda table, selects, QA fields

| Goes | Tier | Stays |
| --- | --- | --- |
| `.field-readonly`, `.field-group` | component | `.agenda-table`, `.agenda-section`, `.student-cell` |
| `.ui-select-panel` overflow/scroll deltas — **merge into `components/forms.css`**, which owns the base | component | `.qa-*` (category, definition list, prev-discussion, packed grid) |
| | | `.panel-toolbar*`, `.discussion-timer*`, `.agenda-row-timer` |
| | | `.ui-select-trigger.status-pill` — see below |

`.ui-select-trigger.status-pill` is a **composition of two portal components used as a domain
control** (Referral status as a dropdown). Both ingredients promote; the composition stays hub-owned.
That's the general rule for this shape wherever it appears.

### 2.7 Region 14 (10146–11020) — meeting setup, agenda rows, referral detail

**Reclassified from D to M** — see §7.

| Goes | Tier | Stays |
| --- | --- | --- |
| `.settings-section`, `.settings-body`, `.settings-row`, `.settings-fixed` (10204, 10707–10743) — generic settings furniture, no SEND in it | component | `.agenda-row*`, `.agenda-order-*`, `.agenda-drop-indicator`, `[data-drop-zone]` |
| `.drag-handle`, `.drag-handle-pattern` | component | `.referral-*` (row-grid, pills, details-actions, view-fields, edit-summary, history-*, decision-strip/cta) |
| `.entity-row` additions (10495–10526, 10670–10676) — merge with 3990–4108 | component | `.action-row*`, `.set-action-card`, `.actions-complete-row` |
| `.quick-add-row`, `.ui-fused-field-label/-value`, `.field-editable` | component | `.member-list-divider`, `.member-expertise-form`, `.discussion-thumb`, `.review-date-controls` |
| `.btn-row-stacked` | component | `.priority-*` — see §7 |

The `.settings-*` promotion is what lets both portaladmin pages drop `panel.css` (§6). It is ~30
lines and it unblocks the map's cleanest acceptance test, which is a good argument for it being in
the first execution slice.

### 2.8 Region 15 (11021–11713) — modals, member picker, search

| Goes | Tier | Stays |
| --- | --- | --- |
| `.modal-dialog*`, `.modal-header-row`, `.modal-subtitle`, `.modal-divider`, `.modal-close`, `.fade-toggle` | component | `#panel-group-dialog`, `#action-form-dialog`, `#expertise-quick-add-dialog`, `#external-contact-quick-add-dialog`, `#attendance-dialog`, `#requires-followup-row` |
| `.field-error`, `.ui-fused-field-group` | component | `.panel-group-member-row`, `.member-expertise-*` |
| `.search-result-*`, `.search-hint`, `.panel-search-field/-results` — generic search-results UI | component | `.leave-confirm-actions` |
| `.member-card*`, `.member-picker-controls`, `.member-result-*` — a generic "pick a person" pattern | component | `#panel-member-dialog` wiring specifics |
| `.btn-icon-only`, `.row-corner-action`, `.row-corner-icon-btn` | component | `.referral-student-picker`, `.referral-student-option*` |

The modal shell promotion is the one that lets `_hub_sidebar.html` delete its six duplication
comments (§8). `#panel-search-dialog` is domain-*named* but generic search UI — promote the styling,
leave the id-scoped positioning with whatever page owns the dialog.

---

## 3. `panel.js` — region by region

| # | Lines | Nature | Verdict |
| --- | --- | --- | --- |
| 1 | 1–365 | M | 8 of 9 helpers → **component** (`wireFilterBarActiveState`, `wireListInfiniteScroll`, `closeModalWithFadeOut`, `animateModalHeightChange`, `setFadeHidden`, `snapshotFormValues`, `formValuesDirty`, `confirmModalDiscard`). `resolvePanelSchoolFilter` stays. |
| 2–8 | 366–2039 | D | stay. Seven dialog modules + inline action autosave. |
| 9 | 2040–2298 | M | `initMemberPicker`/`resetMemberPicker` → **component**. Generic "staff source + search" picker, already scoped via `closest()` on its own root rather than global ids. Its staff/external source vocabulary is config, not structure. |
| 10 | 2299–2435 | D | stays. `initActionAssignFields`. |
| 11 | 2436–2549 | G | → **component**. `flash`, `setTabCollapsed`, `pulseCount`, `recountTabsFromRows`. |
| 12 | 2550–2730 | G | → **component**. Row grow/shrink animations, `diffPatchRowList`. |
| 13 | 2731–2812 | G | → **component**. `beginFetchSeq`/`isCurrentFetchSeq`, `wireRowRemoveForm`. |
| 14 | 2813–2858 | G | → **list-page**. `.row-facts-cols` drag-to-scroll. |
| 15 | 2859–3555 | G | → **list-page**. Facts-strip measurement, 697 lines. Self-contained; the measurement-cache generation counter comes with it. |
| 16 | 3556–3674 | G | → **list-page**. Stack mode. `LIST_ROOT_SELECTOR` becomes a parameter. |
| 17 | 3675–3823 | M | → **list-page**. `BUTTON_ROW_SELECTORS` becomes a parameter; `syncMeetingsButtonColumnWidth`'s Meetings-specific default stays hub-side. |
| 18 | 3824–4018 | G | → **list-page**. Edge wiring, MutationObserver refresh, `animatedScrollBy`, arrow delegation. |
| 19 | 4019–5046 | M | → **component**, renamed. See below. |
| 20–22 | 5047–5345 | D | stay. Quick-add dialogs, expertise fields, panel search wiring. |

**Region 19 (`initAgendaDragDrop`, 1,028 lines) is ~95% generic and already parameterised** —
`initAgendaDragDrop(zoneConfig, options)` takes its zones from the caller and its remove action from
`options`. The only domain leakage is the default `removeAction: 'remove_referral_from_agenda'` and
the `.agenda-drop-indicator` class name. Promote as a generic sink/pool drag-reorder module with the
default removed and the indicator renamed; the agenda's own `zoneConfig` stays hub-side. This is the
single largest JS promotion and the least risky, because the seam already exists.

`LIST_ROOT_SELECTOR` and `BUTTON_ROW_SELECTORS` are hardcoded lists of five Panel page ids sitting
inside otherwise page-agnostic algorithms. Parameterising them is the whole cut for regions 16–17.

---

## 4. The reverse direction

What leaves `static/` or gets reconciled, so split ownership doesn't survive the split.

| Item | Now | Action |
| --- | --- | --- |
| `.panel-card` rules | `components/cards.css` + `layout/responsive.css` *and* `panel.css` (83 refs) | Reconcile into one component definition under the new name (§5). |
| `.stats-carousel` rules | `components/cards.css` + `layout/responsive.css` *and* `panel.css` (54 refs) | Reconcile into one component definition. |
| `main.js:2683` — `document.querySelectorAll('.panel-card .tab-row, …')` | portal JS selecting a panel-named class | Update to the promoted name. |
| `main.js:2918` — wires `.stats-carousel-wrap` | portal JS, panel-only markup | Stays portal-wide; its CSS joins it (region 4). |
| `.entity-row`/`.entity-list` | four `static/css` files *and* `panel.css` (145 refs) | Reconcile. |
| `.tab-row`, `.ui-select-trigger`, `.modal-dialog`, `.btn-row`, `.toggle-pill` | split across both | Reconcile; base portal-side, domain modifiers hub-side, per the `.status-pill` model. |

**Not in scope: `main.js`'s own internal split.** #198 flags it under *Not yet specified* and it
needs its own inventory ticket first — #200 mapped `panel.*`, not `main.js`, so there is a function
outline of its 5,267 lines and nothing more. Ruling on its taxonomy from that would be guessing.

---

## 5. Renames

Promoted names must not say "panel". Renames happen **at promotion**, not as a later pass — every
occurrence is already being touched during the move, and a standalone rename pass with no functional
payoff is the first thing dropped when a migration runs long.

| Now | Promoted as | Refs |
| --- | --- | --- |
| `.panel-card`, `.panel-card-header`, `.panel-card-count`, `.panel-card-collapsible` | `.card` family — exact name is #204's | 83 |
| `.panel-list` | `.entity-list` variant or `.stack-list` | 60 |
| `.panel-item-*` | `.entity-row` family — likely merges with the existing one | — |
| `.panel-thumb`, `.panel-thumb-photo` | `.thumb` | — |
| `.panel-chevron` | `.chevron` | — |
| `.agenda-drop-indicator` (JS region 19) | `.drop-indicator` | — |
| `initAgendaDragDrop` | `initDragReorder` or similar | — |

⚠️ Find/replace discipline: `.panel-list` is a prefix of `.panel-list-item`, and `.panel-card` of
`.panel-card-header`. Longest-match-first, or the rename silently corrupts the sub-classes.

---

## 6. What the three cross-hub imports load

**All three load zero panel-owned assets.** Not "a smaller shared bundle" — nothing.

Grounded in what they actually use (classes present in their markup, defined in `panel.css`, defined
nowhere in `static/css/`):

| Page | Needs from `panel.css` today | After |
| --- | --- | --- |
| `hubs/portaladmin/home.html` | `.settings-section`, `.settings-body`, `.settings-row` (~30 lines) | those promote (§2.7) → drops `panel.css` |
| `hubs/portaladmin/themes.html` | same three, plus `.priority-chips` | same, plus §7 → drops `panel.css` |
| `hubs/inclusion/hub.html` | `.empty-note`, `.filter-bar-clear--sticky`, `.filter-bar-close`, `.filter-bar-collapsible-inner`, `.filter-bar-sticky-footer`, `.filter-tray-content`, `.sticky-header-zone--flush-top` | all promote (regions 8, 10) → drops `panel.css` |
| `hubs/inclusion/hub.html` (JS) | one symbol: `window.wireFilterBarActiveState` | promotes (JS region 1) → drops `panel.js` |

Nothing new needs to exist for them. Every class and the single JS symbol is promoting on its own
merits under the nature test; usage never had to be invoked as the backstop.

`portaladmin` currently pulls 11,810 lines of SEND stylesheet for about 30 lines of settings
furniture.

---

## 7. `themes.html` is a catalogue, not a consumer

`portaladmin/themes.html` renders component swatches under headings — it is a **preview gallery of
the design system**, which is a categorically different relationship to the CSS than `home.html`'s.

**Rule: the catalogue previews portal-wide components only.** Domain components are previewed by the
hub that owns them, if at all. A theme gallery's job is the things a theme must get right
*everywhere*, and exempting it would quietly re-legitimise the coupling this map exists to remove —
and keep the developer console loading a SEND stylesheet indefinitely.

Consequence found while deciding this: **`.priority-chip` has no live consumer.** Panel renders
Referral priority with `.priority-select` and `.priority-static`; the chip variant
(`panel.css:10242–10265`) is rendered *only* by the theme gallery. Under the rule above the gallery
stops previewing it, and the whole block becomes deletable.

General hazard worth recording: **a catalogue that previews everything gives dead CSS a fake
consumer**, so it never shows up as dead. Anything the gallery is the sole renderer of should be
treated as a deletion candidate, not a promotion candidate.

---

## 8. Acceptance tests

Two things #205 can actually check, rather than asserting the split went well.

1. **All three cross-hub imports load zero panel-owned assets** (§6). If any still needs
   `panel.css` after the split, the split is wrong somewhere — and this is the cheapest place to
   find out.
2. **All six `_hub_sidebar.html` duplication comments become deletable** (lines 862, 867, 875, 934,
   967, 994). Each exists *because* `panel.css` isn't guaranteed loaded; once the modal shell is a
   portal component that reason evaporates. If a comment survives, something it depends on didn't
   promote.

Note on (2): the sidebar makes **no runtime call** into `panel.js`, so this is not a load-order fix.
It is knowledge duplication — a partial on every page of every hub encoding panel's values — and the
test is that the duplication becomes unnecessary, not that a crash stops happening.

---

## 9. Deferred, with owner

| Item | Owner | Note |
| --- | --- | --- |
| Target folder + file list | #204 | Tiers are assigned here; filenames are not. |
| ES module linkage | #202 | This list names symbols and destinations only. |
| Inline template scripts: the rule | #203 | `home.html`'s 1,255 lines (0 template refs) named here with a destination — panel-owned JS, since the carousels are `#my-referrals-list`-specific. `_hub_sidebar.html` (1,719 lines, 139 refs) and `layout.html` (699, 1) are #203's inputs; the sidebar is its hardest case and probably determines the rule. |
| Migration slicing | #198, open | Unordered set — but §6 and §2.7 imply a natural first move: filter bar + `.settings-*` makes acceptance test 1 pass early, on the hardest volume rather than the easiest. |
| Intra-panel duplication | new issue, file against the finished convention | `refreshRegOptions`/`refreshTermOptions` ×6, button-column-width sync ×4, `setupToggle` ×3, mm:ss timer ×3, `wireStudentsInfiniteScroll` duplicating `wireListInfiniteScroll`. Held out under constraint 2. Loudest: `panel.js`'s own comment already calls `wireListInfiniteScroll` generic. |
| Carousel *implementation* consolidation | new issue | `home.html`'s two hand-rolled carousels bypass `wireScrollCarousel` entirely. Real rewrite, own risk, own ticket. CSS collapse (§2.2) is in scope; JS is not. |
| `main.js` inventory + internal split | new issue | Prerequisite for any taxonomy call on it. |
| `panel.css`/`panel.js` residue shape | #204 | ~1,700 CSS + ~2,300 JS lines remain. Observation for #204, not a decision: the nine dialog IIFEs are already independent modules with no shared state, so the residue has obvious internal seams — it needn't stay two files. |

---

## 10. Corrections to the inventory

- **Region 14 is M, not D.** `.settings-section`/`.settings-body`/`.settings-row`/`.settings-fixed`
  are generic settings furniture, not meeting setup. Caught by checking what portaladmin actually
  uses. [inventory.md](inventory.md) updated.
