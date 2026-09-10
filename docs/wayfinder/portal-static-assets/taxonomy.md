# The target taxonomy: folders, files, names

Decision record for [#204](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/204), under the
map [#198](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/198). Consumes #200's
[inventory.md](inventory.md) (region numbers), #201's [promotion-list.md](promotion-list.md) (tiers)
and #202's [es-modules-findings.md](es-modules-findings.md) (module mechanics). Read those first;
this file assigns the filenames they deliberately left unassigned.

Line ranges are as of `fc0bee0`.

---

## 0. The constraint nobody chose: hub static must be namespaced

Not a preference — measured. Django's `AppDirectoriesFinder` collapses every app's `static/` into
**one flat namespace** alongside the project's `STATICFILES_DIRS`. With a probe file added at
`hubs/inclusion/panel/static/css/components/cards.css`:

```
finders.find('css/components/cards.css', all=True)
  → ['…/static/css/components/cards.css',
     '…/hubs/inclusion/panel/static/css/components/cards.css']
```

Two files, one name. `{% static %}` and `finders.find()` return the **first** — `FileSystemFinder`
runs before `AppDirectoriesFinder`, so the portal file wins and **the hub's file is silently
shadowed**. No error, no warning, in dev or at render time.

`panel.css` only works today because that filename happens to be unique in the whole project. The
moment a hub adopts any of the folder names below, every file collides.

**So every hub's static tree gets an app-namespace directory** — Django's own documented convention,
which this project has never applied:

```
hubs/inclusion/panel/static/panel/css/…      →  {% static 'panel/css/…' %}
hubs/inclusion/panel/static/panel/js/…       →  {% static 'panel/js/…' %}
```

The rename of `css/panel.css` → `panel/css/panel.css` touches three templates and is the first
mechanical step of any execution issue, because nothing else in this document is safe without it.

---

## 1. Folders

Tier names from #201 become folder names, so the only question a new file has to answer is "which
tier is this?".

```
static/css/
  style.css          entry chain, no rules
  tokens/            design primitives, no selectors          portal-only, invariant
  theme/             colour system                             portal-only, invariant
  layout/            app frame: shell, sidebar, page shell, the breakpoint registry
  components/        reusable, zero domain vocabulary
  list-page/         the filterable-entity-list pattern's own machinery
  pages/             one portal page's own layout
static/js/
  main.js            portal chrome — unsplit, its own ticket (#201 §4)
  components/        one behaviour per module
  list-page/
  pages/

hubs/<hub>/static/<hub>/css/
  <hub>.css          hub entry chain, <link>ed after style.css
  components/        domain components
  pages/             one page's own layout
hubs/<hub>/static/<hub>/js/
  <hub>.js           hub entry
  components/        domain behaviours
  pages/             one page's entry module
```

**The hub mirrors the portal, minus `tokens/` and `theme/`.** That omission is the point, and it is
statable as an invariant: *a hub never defines a design token or a theme.* Everything else uses the
same word on both sides, so a reader moving between them carries one vocabulary.

**How a reader tells which they are looking at:** the path, plus two rules that make the path
trustworthy —

1. No file under `static/` may contain domain vocabulary (Referral, Action, Panel, Meeting, Agenda,
   Safeguarding, Escalation, Student). #200's nature test, applied as a file-level invariant.
2. No file under `hubs/*/static/` may define a token, a theme, or anything another hub could want.
   If it could, it promotes.

Promoted names never say "panel" (#201 §5), so a `panel-` prefix appearing anywhere under `static/`
is itself the signal that something was moved without being finished.

### 1.1 Media queries live with the component

A component's responsive behaviour goes in the component's own file. `layout/responsive.css` keeps
the **breakpoint registry comment** (the canonical tier list, which stays the single source of tier
numbers) and the rules that belong to the layout tier itself — shell, sidebar, rail.

This follows directly from #198's settled split axis (component/behaviour, not page), and it is the
difference between `filter-bar.css` being one file and being one file plus 700 lines somewhere else.
It shrinks `responsive.css` substantially; the registry comment does not move.

---

## 2. Portal CSS — the file list

Existing files in **bold**. Everything else is new. Sources are #200 region numbers.

| File | Holds | From |
| --- | --- | --- |
| `layout/page-shell.css` | `.page-shell` and its fill/height chain (ex-`.list-page-shell` — the name lied; any full-height page uses it) | region 2 |
| `layout/`**`responsive.css`** | breakpoint registry + layout-tier media queries only | shrinks, see §1.1 |
| `components/a11y.css` | `.sr-only` | region 1 |
| `components/`**`buttons.css`** | + `.btn-row`, `.btn-row-stacked`, `.row-btn-row-stacked`, `.btn-icon-only`, `.row-corner-action`, `.row-corner-icon-btn`, `.btn-count-badge` | 7, 8, 14, 15 |
| `components/`**`cards.css`** | + the `.card` family (ex-`.panel-card*`), collapsible card + chevron, `.thumb` (ex-`.panel-thumb`) — **and the reconciliation** of the `.panel-card`/`.stats-carousel` rules already living here and in `responsive.css` | 2, 5, §4 |
| `components/carousel.css` | carousel chrome (fades, arrows, dots, count readout), `.carousel-filter*`, `.stats-carousel-*` | 3, 4 |
| `components/drag.css` | `.drag-handle`, `.drag-handle-pattern`, `.drop-indicator` (ex-`.agenda-drop-indicator`) | 14 |
| `components/filter-bar.css` | the whole filter bar incl. tray, sections, scroll chrome, mobile mode, phone chrome, narrow-desktop — **and the reconciliation** of `.filter-bar*` out of `forms.css` and `responsive.css` | 8 (859 code lines) |
| `components/`**`forms.css`** | + `.field-readonly`, `.field-group`, `.field-error`, `.field-editable`, `.ui-fused-field-*`, `.quick-add-row`, `.is-submitting`, the `.ui-select-panel` overflow deltas (base already here) | 9, 11, 14, 15 |
| `components/lists.css` | `.entity-list`, `.entity-row` (**reconciled** from four `static/css` files + panel), `.entity-list--bleed`, `.stack-list` (ex-`.panel-list`), `.row-title-row/-pills/-sep`, `.row-secondary-text`, `.empty-note`, `.empty-note-inline`, `.activity-*`, the end-of-list stripe | 2, 5, 7, 10 |
| `components/metrics.css` | detail stat cards, rings, attendance bars + legends | 13 |
| `components/modal.css` | `.modal-dialog*`, `.modal-header-row`, `.modal-subtitle`, `.modal-divider`, `.modal-close`, `.fade-toggle` | 15 |
| `components/note-thread.css` | `.note-thread` | 13 |
| `components/page-header.css` | `.page-subtitle-stats`, `.sticky-header-zone*` | 8 |
| `components/person-picker.css` | `.person-card*`, `.person-picker-controls`, `.person-result-*` (ex-`.member-*` — "member" is Panel-group vocabulary) | 15 |
| `components/`**`pills.css`** | unchanged base; domain status modifiers stay hub-side (the `.status-pill` model, #201 §2.3) | — |
| `components/search.css` | `.search-result-*`, `.search-hint`, search field + results shell | 15 |
| `components/settings.css` | `.settings-section`, `.settings-body`, `.settings-row`, `.settings-fixed` — ~30 lines, and the whole reason portaladmin can drop `panel.css` | 14 |
| `components/tabs.css` | `.tab-row`, overflow/collapse, `.tab-collapsed`, `count-pulse` keyframes + `.count-pulse-*` | 5, 10 |
| `list-page/facts-strip.css` | `.row-facts-cols`, `-track`, `-arrow`, `.row-fact-col`, `.row-fact-col-clamp` | 7 |
| `list-page/list-page.css` | `.filtered-content`, stack-mode rules | 2, 8 |
| `pages/` | **empty at first.** Created when a portal-wide page first needs its own layout; today's page-tier residue is all hub-side | — |

Nineteen component files where there were six. Each is nameable in one noun, which is the test that
the split axis was applied rather than approximated.

---

## 3. Portal JS — the module list

One behaviour per module, named for the behaviour. Every one exports functions; none installs itself
on `window` (that convention dies with the migration — an import graph replaces it, which is #202's
surviving reason for choosing modules at all).

| Module | Exports | From |
| --- | --- | --- |
| `components/carousel.js` | `wireScrollCarousel` | `main.js:840` |
| `components/raf-throttle.js` | `rafThrottle` | `main.js` |
| `components/debounce.js` | `debounceTrailing` | `panel.js:2908` — **reunites the split pair**; its own comment already says it pairs with `rafThrottle` |
| `components/modal.js` | `closeModalWithFadeOut`, `animateModalHeightChange`, `setFadeHidden` | JS region 1 |
| `components/form-dirty.js` | `snapshotFormValues`, `formValuesDirty`, `confirmModalDiscard` | JS region 1 |
| `components/filter-bar.js` | `wireFilterBarActiveState` | JS region 1 — the one symbol `inclusion/hub.html` needs |
| `components/infinite-scroll.js` | `wireListInfiniteScroll` | JS region 1 |
| `components/tabs.js` | `setTabCollapsed`, `recountTabsFromRows`, `pulseCount` | JS region 11 |
| `components/flash.js` | `flash` | JS region 11 |
| `components/row-animate.js` | row grow-in/shrink-out (Web Animations API) | JS region 12 |
| `components/row-list-patch.js` | `diffPatchRowList`, `wireRowRemoveForm` | JS regions 12, 13 |
| `components/fetch-seq.js` | `beginFetchSeq`, `isCurrentFetchSeq` | JS region 13 |
| `components/person-picker.js` | `initPersonPicker`, `resetPersonPicker` | JS region 9 |
| `components/drag-reorder.js` | `initDragReorder(zoneConfig, options)` | JS region 19 — 1,028 lines, already parameterised; drop the `removeAction` default |
| `list-page/facts-strip.js` | `initFactsStrip(root, options)` | JS regions **14 + 15 + 18** — see below |
| `list-page/stack-mode.js` | `calibrateStackMode`, `updateListStackMode` — `LIST_ROOT_SELECTOR` becomes a parameter | JS region 16 |
| `list-page/button-row-overflow.js` | `updateButtonRowOverflow`, `measureButtonRowNatural` — `BUTTON_ROW_SELECTORS` becomes a parameter | JS region 17 |
| `list-page/list-page.js` | `initListPage(root, options)` — the deep module; see §4 | new, assembled |

**`facts-strip.js` merges three inventory regions on purpose.** Measurement (15), its drag-to-scroll
(14) and its edge wiring / MutationObserver refresh (18) are one mechanism reached through one
interface, `initFactsStrip(root, options)`. Splitting them by inventory region would publish the
measurement cache's generation counter as an interface between files, which is exactly the internal
detail the module exists to hide. 938 total lines, ~325 code lines — see §5.

---

## 4. Entry points — the question #202 deferred here

**One entry module per page template**, `<script type="module">`, importing what that page needs.
Not one portal-wide entry, and not one per hub.

#202 could not settle this because the question is really "how much would an entry file duplicate?",
and its single-entry prototype couldn't show duplication. The inventory can: the six list pages each
re-implement filter wiring, `refreshRegOptions`/`refreshTermOptions`, `setupToggle`, infinite scroll
and button-column width sync in their own `<script>` block — #200 §4.3 counted the copies at 6, 6, 3,
2 and 4.

A per-hub entry would have to import every page's behaviour and dispatch on page identity, which is
the `LIST_ROOT_SELECTOR`-style hardcoded page list this whole map is removing. A portal-wide entry is
that, larger.

So the duplication is removed by a **module**, not by an entry: `initListPage(root, options)` takes
the facts strip, stack mode, button-row overflow, filter wiring and infinite scroll and puts them
behind one call. Each list page's entry becomes roughly:

```js
import { initListPage } from '…/list-page/list-page.js';
initListPage(document.querySelector('#students-filtered-content'), { … });
```

That is the deep-module shape: one small interface, five behaviours' worth of implementation, and a
page that no longer knows they are five things. It also makes the parameterisation of
`LIST_ROOT_SELECTOR` and `BUTTON_ROW_SELECTORS` (#201's "whole cut for regions 16–17") pay for
itself immediately rather than in principle.

Load mechanics, all measured in #202 §3: a module body runs before `DOMContentLoaded`, so existing
DCL handlers inside these files survive untouched; deferred classic scripts and modules execute in
document order, so `main.js` at `layout.html:139` still runs first; and a module entry coexists with
the classic scripts with neither changed — **so this is page-by-page, never big-bang.**

`main.js` stays a classic deferred script until its own inventory ticket lands (#201 §4). Nothing
here depends on it moving.

---

## 5. The ~600-line review trigger

**Counts code lines, not total lines**, per #199 — `panel.css` is 61% comments, so a total-line
trigger fires on prose and makes deleting good comments the cheapest way to comply.

**It is a review trigger, not a cap.** Crossing it asks one question: *is this one module or two?*
A legitimate "one" is a normal answer — `facts-strip.js` is 938 total lines and stays one file,
because its three parts share a measurement cache that would otherwise become an interface. When the
answer is "one", the reason goes in the file's header comment, which is precisely what
[doc-conventions.md](../../agents/doc-conventions.md) says a comment must earn: a contested decision,
recorded at the site.

**Enforced advisorily by `scripts/check_file_size.py`**, following #199's `check_stale_comments.py`
precedent — a script, not a hook, reporting code lines per file under `static/` and `hubs/*/static/`.
A rule nothing checks is a rule that decays; a rule that blocks a commit gets worked around.

---

## 6. Hub-owned: `panel`, file by file

`hubs/inclusion/panel/static/panel/`. The residue is **split as part of the migration**, not left as
two files afterwards — every line is already in hand and being re-homed, which is the same argument
#199 used to make the comment pass part of the split. A second pass over `panel.css` is the thing
that never gets scheduled.

### CSS — `panel/css/`

| File | Holds |
| --- | --- |
| `panel.css` | entry chain only, no rules |
| `components/meeting-card.css` | `.meeting-card-*`, `.meeting-info-label`, `.bd-pill` (region 6) |
| `components/referral.css` | `.referral-row-grid`, `-pills`, `-details-actions`, `-view-fields`, `-edit-summary`, `-history-*`, `-decision-strip/-cta`, student picker (14, 15) |
| `components/action.css` | `.action-row*`, `.set-action-card`, `.actions-complete-row`, `.action-status-dropdown`, `.ui-segmented--action-status` (3, 9, 14) |
| `components/agenda.css` | `.agenda-table`, `.agenda-section`, `.student-cell`, `.agenda-row*`, `.agenda-order-*`, `[data-drop-zone]` (11, 14) |
| `components/discussion.css` | `.qa-*`, `.panel-toolbar*`, `.discussion-timer*`, `.agenda-row-timer` (11) |
| `components/safeguarding.css` | briefing/notes cards, DSL shell, note rows (region 12) |
| `components/status-pills.css` | the domain `.status-pill.<status>` modifiers only — base stays in portal `pills.css` (region 5) |
| `components/panel-group.css` | `.panel-group-member-row`, `.member-expertise-*`, `.member-list-divider`, `.discussion-thumb`, `.review-date-controls` (14, 15) |
| `pages/home.css` | `.panel-home-cards`, `.panel-row-primary/-secondary`, `#referrals-card`, `#actions-card`, `#activity-card`, `#upcoming-meetings-list`, `#my-referrals-list`, `#my-actions-list` (2, 3, 16) |
| `pages/students.css` | `#students-filtered-content` — **including the two bands threaded through the filter bar** (5797–6040, 6896–6995) and its share of 4109–5560 |
| `pages/referrals.css` · `pages/actions.css` · `pages/escalations.css` | their shares of 4109–5560 |
| `pages/meetings.css` | `#meetings-filtered-content`, `.meetings-scroll` |
| `pages/meeting-setup.css` · `pages/meeting-agenda.css` · `pages/discussion.css` | `.setup-col*`, `.discussion-col*`, `.agenda-layout`, `.members-register-col*`, `.panel-details-row` (region 10) |
| `pages/dialogs.css` | the per-dialog id-scoped positioning: `#panel-group-dialog`, `#action-form-dialog`, `#expertise-quick-add-dialog`, `#external-contact-quick-add-dialog`, `#attendance-dialog`, `#panel-member-dialog`, `#panel-search-dialog` |

**`pages/{students,referrals,actions,escalations}.css` is where the file's worst structural problem
dies.** #200 §1.1 found three pages' rules interleaved **26 times across 1,450 lines** (4109–5560) —
de-interleaving them into files named after the pages is the single most legible outcome of this
migration. #201's warning stands: expect to find generic rules stranded in there, and promote them
when found rather than carrying them across.

### JS — `panel/js/`

| File | Holds |
| --- | --- |
| `panel.js` | entry, imports only |
| `components/school-filter.js` | `resolvePanelSchoolFilter` — the 1 domain helper of region 1's 9 |
| `components/action-assign.js` | `initActionAssignFields`, inline action-row autosave (regions 8, 10) |
| `components/expertise-field.js` | `initExpertiseField(s)` (region 21) |
| `dialogs/new-referral.js` · `panel-group.js` · `panel-meeting.js` · `meeting-start.js` · `action-form.js` · `discussion-summary.js` · `expertise-quick-add.js` · `external-contact-quick-add.js` · `panel-search.js` | one file per dialog — the nine IIFEs, which #201 §9 established are already independent modules with no shared state, so this split is mechanical |
| `pages/home.js` | `home.html`'s 1,255 inline lines, **zero template refs** — moves as-is (#203 owns the rule; the destination is named here) |
| `pages/*.js` | one entry module per list page, per §4 |

`panel-search.js` needs care: region 22 is currently nested *inside* region 21's
`DOMContentLoaded` callback, which never closes before it opens. Untangling that is part of the move,
not a rewrite.

---

## 7. What this leaves open

| Item | Owner |
| --- | --- |
| The rule for inline template scripts, incl. `_hub_sidebar.html`'s 1,719 lines / 139 refs | #203 — destinations named above, the rule is theirs |
| ADR + CLAUDE.md wording; `scripts/check_file_size.py` | #205 |
| `main.js`'s own inventory and internal split | new issue, prerequisite to any taxonomy call on it |
| Carousel *implementation* consolidation (three hand-rolled copies) | new issue — #201 constraint 2 holds it out |
| Intra-panel duplication (`refreshRegOptions` ×6 et al.) | new issue against the finished convention — but §4's `initListPage` is where most of it lands |
