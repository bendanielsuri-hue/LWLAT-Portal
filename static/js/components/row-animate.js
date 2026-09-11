/* Promoted out of panel.js (#211, ADR 0020) - generic row grow-in/
   shrink-fade-out, no SEND vocabulary in it.

   Still also set on `window`, same reason as components/modal.js: panel.js's
   own dialogs and initAgendaDragDrop are classic-script code and call these
   by that name from inside event handlers, so the window assignment keeps
   them working until they're migrated to import this directly. */

// Both animations below use the Web Animations API (Element.animate) rather
// than toggling a CSS transition class - explicit from/to keyframes over a
// fixed duration are scheduled directly by the browser's animation engine,
// so there's no dependency on catching an intermediate painted frame the way
// a manually reflow-forced CSS transition has (that approach - even with a
// double rAF - still intermittently snapped straight to the end state
// instead of animating, especially on freshly-inserted rows or under load
// from a concurrent fetch).
var ROW_ANIM_DURATION = 900;
var ROW_ANIM_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

// If this element still has an animation in flight from a previous
// shrinkAndFadeOut/growIn call (e.g. the same row reordered twice in
// quick succession before the first grow-in finished), cancel it first.
// Two Element.animate() effects racing on the same properties otherwise
// fight each other - the browser has to arbitrate between them, which is
// exactly what made some reorders/adds look like they'd snapped
// instantly instead of animating. Cancelling also reverts the element to
// its underlying (un-animated) style, so the height measured right after
// is always the row's true natural height, not a mid-animation value.
function cancelRowAnim(el) {
    if (el._rowAnim) {
        el._rowAnim.cancel();
        el._rowAnim = null;
    }
}

// Removing collapses the row in place (rather than just flashing red
// somewhere it reappears once zones refresh, which doesn't read as "this
// went away"). Animates max-height/opacity/padding/margin together from
// the row's current rendered size down to 0.
export function shrinkAndFadeOut(el, done) {
    if (!el) { done(); return; }
    cancelRowAnim(el);
    var height = el.getBoundingClientRect().height;
    var cs = getComputedStyle(el);
    el.classList.add('agenda-row-removing');
    var anim = el.animate([
        { maxHeight: height + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
        { maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
    ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
    el._rowAnim = anim;
    var finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        if (el._rowAnim === anim) el._rowAnim = null;
        // Lock in the collapsed end-state via inline styles *before*
        // cancelling - cancel() reverts a fill:'forwards' animation to
        // the element's underlying (non-animated, full-size) style. That
        // used to be invisible because the deferred column swap that
        // finally removes this row happened synchronously right after
        // this callback. Now that swap can wait on a fresh fetch (see
        // refreshZonesAfter), so without a locked-in inline style the row
        // snaps back to full size/opacity for that gap - reads as the
        // row fading away and then flicking back on.
        el.style.maxHeight = '0px';
        el.style.opacity = '0';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        anim.cancel();
        done();
    }
    anim.onfinish = finish;
    anim.oncancel = finish;
    setTimeout(finish, ROW_ANIM_DURATION + 150);
}

// Mirror of shrinkAndFadeOut for a freshly-added or just-moved row:
// animates from collapsed/transparent up to its natural height/padding/
// margin and full opacity, instead of just appearing at full size.
// Returns a promise that resolves once the grow-in has actually finished
// (not just started).
export function growIn(el) {
    if (!el) return Promise.resolve();
    cancelRowAnim(el);
    var targetHeight = el.getBoundingClientRect().height;
    var cs = getComputedStyle(el);
    el.classList.add('agenda-row-adding');
    var anim = el.animate([
        { maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
        { maxHeight: targetHeight + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
    el._rowAnim = anim;
    var finished = false;
    return new Promise(function (resolve) {
        function finish() {
            if (finished) return;
            finished = true;
            if (el._rowAnim === anim) el._rowAnim = null;
            el.classList.remove('agenda-row-adding');
            anim.cancel();
            resolve();
        }
        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, ROW_ANIM_DURATION + 150);
    });
}

window.shrinkAndFadeOut = shrinkAndFadeOut;
window.growIn = growIn;
