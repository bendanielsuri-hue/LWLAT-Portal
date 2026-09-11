/* Opening and closing the filter tray, and the click targets that do it.

   One delegated click handler, not a listener per bar: the label, the
   "View filters" button and [data-filter-bar-close] are all the same gesture,
   and the close button is the same gesture one-directional.

   CLOSING DELIBERATELY KEEPS .is-expanded ON for the whole height animation
   rather than stripping it up front - several tray styles are scoped to
   .filter-bar.is-expanded, so removing it first makes the box visibly fall
   back to non-mobile styling for the entire shrink. The class is cleared on
   transitionend, with a fallback read from the box's own computed
   transition-duration rather than a hardcoded guess, because that guess had
   already gone stale once when the duration grew. */

import { closest } from '../dom.js';
import { resyncFilterTriggerWidths } from '../select.js';
import { positionFilterTray, scrollStickyBarToTop } from './tray-position.js';
import { balanceFilterGroupLabels, setMoreFiltersLabel } from './more-filters.js';
import { resyncFilterSections } from './sections.js';
import { isFilterBarMobile } from './mobile-mode.js';

export function initFilterBarExpandCollapse() {
    // Tapping the "Filters · count" label toggles `.is-expanded`, which is
    // what reveals the fields below 480px (responsive.css). No-op above that
    // width, where the CSS ignores the class and shows fields regardless.
    // [data-filter-bar-close] is the same gesture one-directional - always
    // collapses, never toggles open.
    document.addEventListener('click', function (e) {
        /* .more-filters-toggle counts as the same trigger as the label now:
           a no-search tray bar keeps View filters on the bar in the tray
           tiers (setupFilterBarMoreFilters), where the tray - not
           secondaryRow - is what opens. Safe to accept unconditionally
           because this handler already returns immediately for any bar that
           isn't in a tray tier (barIsMobile, below), which is exactly where
           the button's own click handler stays in charge. */
        var label = closest(e.target, '.filter-bar-label') || closest(e.target, '.more-filters-toggle');
        var closeBtn = closest(e.target, '[data-filter-bar-close]');
        if (!label && !closeBtn) return;
        // closest('.filter-bar') covers a close control nested inside the bar
        // (the Close button); the document.querySelector fallback covers one
        // that deliberately is not - the backdrop overlay sits beside the
        // list content rather than inside .filter-bar, so that a semi-
        // transparent layer never renders inside the bar's own box and dims
        // the bar's own background through its padding and gaps. Only one bar
        // is ever realistically .is-expanded at a time, so the fallback is
        // safe without the overlay naming which bar it belongs to.
        var bar = closest(label || closeBtn, '.filter-bar') || (closeBtn && document.querySelector('.filter-bar.is-expanded'));
        if (!bar) return;
        // Above mobile the bar's trigger is "View filters"/"Hide filters"
        // (moreFiltersBtn), not this label - the label is descriptive text
        // there, so clicking it must do nothing rather than toggle
        // .is-expanded without also updating the aria-expanded/secondaryRow
        // state wireMoreFiltersToggle's own click handler owns.
        //
        // An opted-in tray bar (.filter-bar-tray) also opens this way at a
        // narrowed, hover-capable desktop width; a plain `.filter-bar` with
        // no tray keeps the exact 480px threshold.
        var isTrayBar = bar.matches('.filter-bar-tray');
        var barIsMobile = window.matchMedia('(max-width: 480px)').matches || (isTrayBar && isFilterBarMobile());
        if (!barIsMobile) {
            return;
        }
        var box = bar.querySelector('.filter-bar-collapsible');
        var wasExpanded = bar.classList.contains('is-expanded');
        var willExpand = closeBtn ? false : !wasExpanded;
        /* Keep the on-bar View filters/Hide filters button describing the
           tray's real state. Driven from here rather than from the button's
           own click handler because the tray closes by routes that button
           never sees: the Close button and the dimmed backdrop both land in
           this same handler as closeBtn. */
        var trayToggleBtn = bar.querySelector('.more-filters-toggle');
        if (trayToggleBtn) {
            trayToggleBtn.setAttribute('aria-expanded', String(willExpand));
            setMoreFiltersLabel(trayToggleBtn);
        }
        // The dimmed backdrop (.filter-bar-overlay) fades via an opacity
        // transition keyed off .overlay-visible, NOT off .is-expanded: that
        // class persists for the whole close (below), so an overlay keyed to
        // it stays fully opaque throughout and snaps rather than fades.
        // Toggled immediately in both directions, so it and the tray's height
        // transition start on the same synchronous frame and a matching
        // duration on both (panel.css) lands them together. bar.parentElement
        // rather than a page-specific query - other filter-bar pages have no
        // such overlay, and null is a harmless no-op.
        var overlayEl = bar.parentElement && bar.parentElement.querySelector('.filter-bar-overlay');
        bar.classList.toggle('overlay-visible', willExpand);
        // (INT-M5) Height animates in plain CSS - .filter-bar-collapsible's
        // height: 0/auto + transition gated by .tray-open (panel.css), on top
        // of the site-wide interpolate-size: allow-keywords opt-in
        // (layout.css). No JS measures the tray's height, and nothing here
        // should start: docs/adr/0023 covers why measuring it is a trap and
        // what three earlier techniques failed at. This code keeps only what
        // CSS genuinely cannot know: .is-expanded's lifetime across the close
        // (below) and positionFilterTray's top/left/width/max-height.
        var inner = box && box.querySelector('.filter-bar-collapsible-inner');
        // Commits a real, rendered "before" frame ahead of any class change
        // below. Both forced reflows in this handler are load-bearing and
        // they are not interchangeable: the one AFTER the class change is
        // what calc-size() needs to register a height transition at all, but
        // running only that one means a normal property like opacity never
        // gets a committed starting frame - the browser batches the whole
        // before-after cycle into one tick and skips the transition, so
        // .filter-bar-collapsible-inner/.filter-bar-sticky-footer's fade
        // snapped straight to its end value. Reflowing here too gives
        // opacity its starting frame regardless of what the later one does.
        if (box) void box.offsetHeight;
        if (willExpand) {
            bar.classList.add('is-expanded');
            bar.classList.add('tray-open');
            if (box) {
                // Before positionFilterTray, so its max-height reservation
                // accounts for any label that just gained a second line
                // rather than the pre-wrap, shorter one.
                balanceFilterGroupLabels(box);
                // After the labels are split (a label that just gained a
                // second line changes its group's height) and before
                // positionFilterTray, whose max-height cap depends on the
                // row count grouping decides.
                resyncFilterTriggerWidths(bar);
                // Opening the tray is the first moment these rows have a real
                // width to overflow, so the scroll half matters here too.
                resyncFilterSections(bar);
                // Take the header out of the way BEFORE measuring. In the
                // `short` tier the page header scrolls away and the bar is
                // sticky to the top of <main>, so the height the tray gets is
                // whatever sits below the bar's CURRENT position - opening it
                // while scrolled to the top spends the header's ~50px on a
                // title you already know instead of on filters.
                // positionFilterTray runs immediately on the pre-scroll rect;
                // the smooth scroll then re-anchors and re-caps frame by
                // frame through repositionStickyTrays (the capture scroll
                // listener in tray-position.js), so the tray grows into the
                // space as the header leaves rather than jumping after it.
                scrollStickyBarToTop(bar);
                positionFilterTray(bar, box);
            }
        } else {
            bar.classList.remove('tray-open');
        }
        // Forces the browser to commit the height this class toggle implied
        // before anything else runs. Without it a transition triggered by
        // toggling .tray-open sometimes never starts at all - an engine quirk
        // specific to interpolate-size: allow-keywords' calc-size()-based
        // auto-height resolution, not the class logic. An open already forces
        // this incidentally through positionFilterTray's
        // getBoundingClientRect() reads; a close touches layout for no other
        // reason, so it needs the explicit read.
        if (box) void box.offsetHeight;
        if (box) {
            // inner's overflow-y: auto (panel.css) makes it scroll once
            // genuinely too tall for the settled state - but for most of the
            // transition, either direction, box's height is smaller than that
            // settled height, so inner's content overflows its shrunk bounds
            // the whole way through and flashes a scrollbar even on a tray
            // that never needed one. Pinned hidden for the animation only;
            // box's own max-height still caps the resting state, so a tray
            // that does need to scroll gets overflow-y back when it ends.
            if (inner) inner.style.overflowY = 'hidden';
            var cleanupDone = false;
            function cleanup() {
                if (cleanupDone) return;
                cleanupDone = true;
                if (inner) inner.style.overflowY = '';
                // .is-expanded comes off here, not up front - see this file's
                // header for why the whole shrink needs it.
                if (!willExpand) {
                    bar.classList.remove('is-expanded');
                    // Clears positionFilterTray's inline top/left/width/
                    // max-height. Those pin a position: fixed box to the
                    // bar's on-screen rect, so that inline top is a frozen
                    // VIEWPORT coordinate, not a position in the page's flow.
                    // Left set on a closed tray, scrolling moves the real
                    // "Filters" row out from under where the stale top still
                    // points, and the collapsed box's otherwise-harmless 1px
                    // border-bottom floats at whatever screen position the
                    // tray was last opened at - a stray misplaced line.
                    // Cleared on every close, so a collapsed tray only holds
                    // a computed fixed position while genuinely reopening.
                    box.style.top = '';
                    box.style.left = '';
                    box.style.width = '';
                    box.style.maxHeight = '';
                }
                box.removeEventListener('transitionend', onTransitionEnd);
            }
            function onTransitionEnd(e) {
                if (e.target !== box || e.propertyName !== 'height') return;
                cleanup();
            }
            box.addEventListener('transitionend', onTransitionEnd);
            // Fallback for when transitionend never fires - box's height
            // genuinely does not change (an empty field grid), so no
            // transition starts to end, and .is-expanded would stick on
            // forever. Read off box's own computed transition-duration, NEVER
            // a hardcoded guess: a flat number here went stale the moment the
            // CSS duration grew, and this firing early strips every
            // is-expanded-gated style mid-shrink and corrupts calc-size()'s
            // live "auto" height recomputation for the rest of the close -
            // which surfaces as a border flash, a height stall, labels
            // vanishing and fields shifting, all on close only. Longest of
            // the declared durations plus a small buffer for a slow frame.
            var closeDurations = getComputedStyle(box).transitionDuration.split(',').map(function (s) {
                s = s.trim();
                var n = parseFloat(s) || 0;
                return s.indexOf('ms') !== -1 ? n : n * 1000;
            });
            setTimeout(cleanup, Math.max.apply(null, closeDurations.concat([0])) + 100);
        } else if (!willExpand) {
            bar.classList.remove('is-expanded');
        }
    });


    // Clicking a filter field's label activates its control. A plain
    // <label for="..."> already focuses its target natively, but the real
    // interactive control for an enhanceSelect()'d field is the separate
    // .ui-select-trigger button beside it, not the <select> the label points
    // at - that one is hidden and inert (enhanceSelect sets tabIndex = -1),
    // so native label-click behaviour never opened anything. Forwarding to
    // whichever control the field holds covers a select's trigger and a
    // toggle's pill with one handler, and gives touch a far bigger target.
    document.addEventListener('click', function (e) {
        var label = closest(e.target, '.filter-field label');
        if (!label) return;
        var field = closest(label, '.filter-field');
        var control = field && field.querySelector('.ui-select-trigger, .toggle-pill');
        if (control) control.click();
    });
}
