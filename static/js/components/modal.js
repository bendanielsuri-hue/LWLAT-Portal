/* Promoted out of panel.js (#211, ADR 0020) - generic modal-dialog motion
   with no SEND vocabulary in any of it.

   Still also set on `window` alongside the real export: panel.js's own
   nine dialog IIFEs are classic-script code and call these by that name
   at parse time is never the issue (every call site is inside an event
   handler, not top-level), so the window assignment is what keeps them
   working until panel.js's own dialogs are migrated to import this
   directly - the same one-remaining-direction the rafThrottle/
   debounceTrailing pair documents (components/debounce.js). */

// Closes a dialog.modal-dialog instantly (dialog.close() fires synchronously
// - see closeModal() below for why: a showModal() dialog blocks every click
// on the rest of the page for as long as it's still open, regardless of its
// own opacity, so waiting out a fade before closing left a real dead-click
// window) while still visually fading it out - via a detached, non-modal
// clone ("ghost") that plays the closing transition instead of the real
// dialog. The ghost is never shown with .show()/.showModal(), so it never
// enters the top layer and is never "open" in the modal sense - it cannot
// block or receive input no matter how long it lingers, which is what makes
// this safe where simply delaying the real close() wasn't. Belt-and-braces
// on top of that: `inert`, `aria-hidden`, and `pointer-events: none` all
// independently guarantee it's inert, so no single one of them being
// insufficient on its own (e.g. an older browser not supporting `inert`)
// leaves a gap.
export function closeModalWithFadeOut(dialog) {
    if (!dialog || !dialog.open) return;
    var rect = dialog.getBoundingClientRect();
    var duration = parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 450;

    var ghost = dialog.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.style.position = 'fixed';
    ghost.style.inset = 'auto';
    ghost.style.margin = '0';
    ghost.style.top = rect.top + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '2147483647';
    document.body.appendChild(ghost);
    // Force a layout flush so the class removal just below is read as a
    // genuine style change to transition from, not folded into the same
    // frame as the append (which would skip the transition entirely).
    void ghost.offsetHeight;
    ghost.classList.remove('is-open');
    setTimeout(function () { ghost.remove(); }, duration + 50);

    dialog.classList.remove('is-open');
    dialog.close();
}

// Animates a dialog.modal-dialog's height across a content swap (e.g.
// showing/hiding sections in place) via the `height` transition it already
// declares in CSS (components/modal.css) but otherwise never uses, since
// `height: auto` can't itself be transitioned — snapshot the current
// rendered height, run `mutate` (the actual DOM change), measure the
// mutated content's true natural height, then transition to that explicit
// pixel value, clearing back to `height: auto` once the transition's had
// time to finish so later content changes aren't pinned to a stale pixel
// height. A no-op dialog (not open, e.g. content swapped before first
// showModal()) just runs `mutate` immediately - nothing to animate from.
//
// Two things that look like they'd work here don't, both confirmed live
// via Playwright (a plausible-looking fix landed twice before this one and
// visibly still snapped instead of easing):
//
// 1. Measuring the target height with `dialog.scrollHeight` right after
//    `mutate` is wrong whenever the new content is *shorter* than the
//    still-pinned start height — scrollHeight can't report anything
//    smaller than the element's own current rendered box, so it just
//    echoes the pinned startHeight back, forever, no matter how much
//    smaller the actual content is. The only way to measure the mutated
//    content's true natural size is to briefly release the pinned height
//    (`height: auto`), read the now-accurate rendered height, and
//    immediately re-pin back to startHeight — all synchronously, so
//    nothing ever paints the transient unpinned state.
// 2. A *single* requestAnimationFrame isn't enough to get a real "before"
//    frame for the transition to ease from: a rAF callback requested from
//    ordinary script runs in the very next "update the rendering" step,
//    before that step's own paint - so writing the target height there
//    lands in the same rendering opportunity as the mutation, and the
//    browser only ever paints once, straight at the final height. Nesting
//    a second rAF defers the target-height write to the *following*
//    rendering opportunity, guaranteeing a real paint at the start height
//    happens first.
//
// Calls on the same dialog can also overlap (e.g. openInlinePanelGroupCreate's
// "show loading" swap immediately followed by "loading -> loaded content"
// once the fetch resolves — near-instant on a local dev server, easily
// landing before the first swap's own nested rAFs have even fired). A
// per-dialog generation counter is bumped on every call; the nested rAF
// and the clear-timer both bail out if a newer call has since started, so
// a stale write from an overlapped-and-superseded call never clobbers the
// one that actually matters.
export function animateModalHeightChange(dialog, mutate) {
    if (!dialog || !dialog.open) {
        if (mutate) mutate();
        return;
    }
    if (dialog._heightClearTimer) clearTimeout(dialog._heightClearTimer);
    var generation = (dialog._heightChangeGeneration = (dialog._heightChangeGeneration || 0) + 1);
    var duration = parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 450;
    var startHeight = dialog.getBoundingClientRect().height;
    dialog.style.height = startHeight + 'px';
    // Force a synchronous layout flush so this first height write is
    // committed as a real, distinct value (not coalesced with whatever
    // came before it) before `mutate` runs — same fix closeModalWithFadeOut
    // already documents needing (`void ghost.offsetHeight`) for the
    // identical reason.
    void dialog.offsetHeight;
    mutate();
    // Whichever element actually scrolls (`.modal-body` in most dialogs,
    // `.panel-group-modal-scroll` nested a level deeper in Panel Group Edit,
    // since that one's own .modal-body is unscrollable by design) pops its
    // scrollbar the instant its content outgrows the dialog's
    // still-animating pinned height - e.g. switching to a tab with more
    // rows than fit at the *previous* tab's height, for the split second
    // before the dialog eases up to the new target height. Queried fresh
    // *after* mutate (not hardcoded to `.modal-body`, and not captured
    // before mutate runs) because a full innerHTML replace - as opposed to
    // a plain hidden-attribute toggle - swaps in an entirely new element
    // instance, so anything captured beforehand would be suppressing a
    // detached node while the real, connected one goes unsuppressed.
    // Restored by the same generation-guarded timer that clears the pinned
    // height below, once there's no more mid-transition mismatch to hide.
    var scrollEls = Array.prototype.filter.call(dialog.querySelectorAll('*'), function (el) {
        var overflowY = getComputedStyle(el).overflowY;
        return overflowY === 'auto' || overflowY === 'scroll';
    });
    scrollEls.forEach(function (el) { el.style.overflowY = 'hidden'; });
    // Briefly release the pinned height to measure the mutated content's
    // true natural size (see point 1 above), then re-pin to startHeight
    // immediately - all in the same synchronous pass, so this never paints.
    // Must be `''` (remove the inline override entirely), not an explicit
    // `'auto'` string - confirmed live via Playwright that those two are
    // NOT equivalent here: dialog.modal-dialog is `position: fixed;
    // inset: 0; margin: auto` (the fixed-centering trick), and explicitly
    // writing the inline value 'auto' resolves through that positioning
    // math to the element's max-height (86vh) instead of its content size,
    // while genuinely having no inline height at all correctly falls back
    // to content-based sizing. Same two keyword-looking values, different
    // resolved height entirely.
    dialog.style.height = '';
    var targetHeight = dialog.getBoundingClientRect().height;
    dialog.style.height = startHeight + 'px';
    void dialog.offsetHeight;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            if (dialog._heightChangeGeneration !== generation) return;
            dialog.style.height = targetHeight + 'px';
        });
    });
    dialog._heightClearTimer = setTimeout(function () {
        if (dialog._heightChangeGeneration === generation) {
            dialog.style.height = '';
            scrollEls.forEach(function (el) { el.style.overflowY = ''; });
        }
        dialog._heightClearTimer = null;
    }, duration);
}

// Fades an element in/out instead of flipping its `hidden` attribute
// abruptly - for small, same-size elements (a button, a footer row) that
// pop in/out of an already-open dialog without changing its height, e.g.
// the Panel Group modal footer swapping "+ Add Member" for "Back"/"New
// External Contact". Genuine height-affecting swaps still go through
// animateModalHeightChange above - this is for the plain "this one thing
// appears/disappears in place" case that rule doesn't cover.
//
// [hidden] is UA-styled `display: none`, which can't be transitioned - so
// hiding needs the *opposite* order from showing: drop opacity first (via
// removing .is-visible), only set `hidden` once that transition has had
// time to finish. `el._fadeHiddenTarget` (not just reading `el.hidden`,
// which lags behind the true intent while a hide is still mid-transition)
// tracks which state a call actually asked for, so a show that arrives
// before a prior hide's timer fires cancels it instead of the two racing.
export function setFadeHidden(el, hide) {
    if (!el) return;
    var targetHidden = !!hide;
    if (el._fadeHiddenTarget === targetHidden) return;
    el._fadeHiddenTarget = targetHidden;
    if (el._fadeHiddenTimer) window.clearTimeout(el._fadeHiddenTimer);
    el.classList.add('fade-toggle');
    if (targetHidden) {
        el.classList.remove('is-visible');
        el._fadeHiddenTimer = window.setTimeout(function () {
            if (el._fadeHiddenTarget) el.hidden = true;
        }, 160);
    } else {
        el.hidden = false;
        // Force a style flush so the browser commits the pre-transition
        // opacity: 0 (the .fade-toggle base rule, now that [hidden] no
        // longer overrides it) as a real starting frame before the next
        // line asks it to transition away from that - without this the two
        // writes coalesce and the fade-in never plays.
        void el.offsetHeight;
        el.classList.add('is-visible');
    }
}

window.closeModalWithFadeOut = closeModalWithFadeOut;
window.animateModalHeightChange = animateModalHeightChange;
window.setFadeHidden = setFadeHidden;
