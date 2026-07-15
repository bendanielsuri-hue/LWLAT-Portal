# Inclusion Panel — Interaction Language

Panel-specific motion/interaction implementation — tied to `panel.js`/`panel.css`. For portal-wide hover/focus/transition rules, see the root [InteractionLanguage.md](../../../InteractionLanguage.md); for static visual rules, see root [DesignLanguage.md](../../../DesignLanguage.md) and this app's own [DesignLanguage.md](DesignLanguage.md).

Mechanics are commented inline at each function in `panel.js` — this doc covers *when to reach for which helper* and the design decisions behind them, not a restatement of the code.

---

## Search (implementation)

The shared search-box behaviour (root InteractionLanguage.md's Search entry) queries `inclusion_panel_search` (`hubs/inclusion/panel/views.py`, one view parameterized by `kind`) — see [docs/adr/0006-shared-search-endpoint-server-fetch-pickers.md](../../../docs/adr/0006-shared-search-endpoint-server-fetch-pickers.md) for why every DB-backed picker fetches server-side rather than filtering a pre-rendered list. Switching a picker's source (e.g. Add Member's staff/external segmented control) keeps whatever's typed and re-queries against the new source rather than clearing it — only the "Change" button on an already-selected result clears the search text. See `initMemberPicker`'s `showPicker(keepSearchText)` in `panel.js`.

## Fade toggle

`window.setFadeHidden(el, hide)` — for a small, same-size element popping in/out of an already-open dialog without changing its height (e.g. Add Member's footer button swapping to Back to New External Contact). Fades opacity instead of an instant `hidden`/`display:none` snap. Not a substitute for a height-changing swap — see Modal content swap below for that case; the two combine (rare) by wrapping this inside the height-transition's mutate callback.

## Modal content swap (height transition) — growable modals

`window.animateModalHeightChange(dialog, mutate)` is the general rule for any modal content change that alters the dialog's natural height — not just an explicit view/step swap, also a live filter narrowing an already-rendered list. Panel-specific "growable" modals (content resizes repeatedly while open, so anchored near the top rather than vertically centred — `top: 8vh`, see `dialog#panel-search-dialog[open]` in `panel.css`): Panel Search, Panel Group Edit, New Referral (its student search re-filters live even though the picker-vs-form step itself is a one-off switch). A dialog that only switches once between fixed modes (e.g. Panel Meeting/Settings' inline "Create Panel Meeting" ↔ "Create Panel Group" swap) still animates the height change but stays centred.

## Row grow-in / shrink-fade-out

Helpers (`shrinkAndFadeOut`, `growIn`, `flash`, `cancelRowAnim`, `wireRowRemoveForm`) live as top-level functions in `panel.js`, above `initAgendaDragDrop` — reuse directly rather than reimplementing per page.

## Refreshing a live fragment in place

Panel Group modal's `render()` in `panel.js` is the reference implementation for: preserving scroll position of a scrollable descendant across an `innerHTML` refresh, and suppressing replay of one-shot entrance animations (`.tab-row-fade-in`) on a refresh (vs. first render).

## Discussing pulse

`.status-pill.discussing` — `animation: discussing-pulse 2s ease-in-out infinite`, oscillates opacity 1→0.6. Panel's own status-pill state; only on the active-discussion status, not a general attention-drawing device.

## Count-delta pulse (implementation)

`window.pulseCount(el, 'up'|'down')` (`panel.js`) adds/removes `.count-pulse-up`/`.count-pulse-down` on whichever element holds the number. A page with its own drag-and-drop/fragment-swap flow (Panel Agenda Setup, Panel Agenda) marks each countable element with `data-count-key`/`data-count`, and `initAgendaDragDrop`'s shared `applyFreshDoc` diffs old vs. new automatically on every column swap. A page recomputing counts purely from remaining DOM rows (e.g. Home's My Referrals after a delete) uses `window.recountTabsFromRows` instead. **General rule**: bump and pulse a count synchronously the moment its own triggering click lands, whenever the new value is fully knowable client-side (a row leaving a column always means that column's count drops by one) — don't defer it to wait for a row's own removal animation or a gated re-render, or it reads as a laggy second-class citizen next to an increase elsewhere that isn't gated. See `optimisticallyDecrementCounts` (drag-and-drop) and the `toggle_group_member_active` handler (Edit Panel Group) for the two current instances.
