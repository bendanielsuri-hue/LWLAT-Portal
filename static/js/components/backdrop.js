/* The dimming layer behind an open overlay.

   A component rather than layout chrome: it is one element, created on demand,
   with no knowledge of which overlay asked for it. The overlay nav, the school
   and identity switchers and the touch-expanded rail all share this one
   instance - which is the whole reason the removal timer below exists. */

/* Switching directly from one open overlay to another (e.g. Settings -> Change
   School) reuses the same backdrop element rather than removing/recreating it, so
   its pending removal (scheduled by the close that's part of that switch) must be
   cancelled - otherwise the backdrop a later overlay is relying on gets deleted out
   from under it once that stale timer fires, and the dimming just vanishes. */
var backdropRemovalTimer = null;

export function addBackdrop(onClick) {
    // .content-column > main, not .page-shell > main - main hasn't been
    // a direct child of .page-shell since the #128 footer restructure
    // (it's nested one level deeper now), which left every overlay
    // (Settings/Search/School/Staff/Hubs, and now the touch-expanded rail) opening
    // with zero backdrop dimming - the querySelector silently matched
    // nothing instead of erroring.
    var main = document.querySelector('.content-column > main');
    if (!main) return;
    if (backdropRemovalTimer) {
        clearTimeout(backdropRemovalTimer);
        backdropRemovalTimer = null;
    }
    var existing = main.querySelector('.global-backdrop');
    if (existing) {
        existing.classList.add('active');
        existing.onclick = onClick;
        return;
    }
    var d = document.createElement('div');
    d.className = 'global-backdrop';
    d.onclick = onClick;
    main.appendChild(d);
    // allow CSS transition to animate in
    window.setTimeout(function () { d.classList.add('active'); }, 10);
}

export function removeBackdrop() {
    var existing = document.querySelector('.content-column > main .global-backdrop');
    if (!existing) return;
    existing.classList.remove('active');
    if (backdropRemovalTimer) clearTimeout(backdropRemovalTimer);
    // remove after fade out transition
    backdropRemovalTimer = setTimeout(function () {
        if (existing.parentNode) existing.parentNode.removeChild(existing);
        backdropRemovalTimer = null;
    }, 380);
}

