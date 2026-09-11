/* Promoted out of panel.js (#211, ADR 0020) - generic row feedback flash
   with no SEND vocabulary in it.

   Still also set on `window`, same reason as components/modal.js: panel.js's
   own dialogs and initAgendaDragDrop are classic-script code and call this
   by that name from inside event handlers, so the window assignment keeps
   them working until they're migrated to import this directly. */

// Brief colour-coded flash (green/added, yellow/moved, red/removed) so an
// action reads as feedback rather than a silent DOM change. The flash
// colour itself snaps on instantly (no transition on the class add), then
// fades back out over 1s via a transition set inline just for that
// moment - keeping the row free of any permanent transition that would
// otherwise also catch (and fade) its own hover fill. `kind` becomes the
// CSS class suffix `agenda-flash-<kind>` (panel.css) - a domain-adjacent
// name kept as-is rather than renamed here, since the class itself still
// lives in panel's own stylesheet.
export function flash(el, kind) {
    if (!el) return;
    el.classList.add('agenda-flash-' + kind);
    setTimeout(function () {
        el.style.transition = 'background-color 1s ease';
        el.classList.remove('agenda-flash-' + kind);
        el.addEventListener('transitionend', function clearTransition() {
            el.style.transition = '';
        }, { once: true });
    }, 1200);
}

window.flash = flash;
