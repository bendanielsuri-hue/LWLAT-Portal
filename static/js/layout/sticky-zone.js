/* Marks whatever follows a .sticky-zone-sentinel as .is-stuck once that
   zero-height marker scrolls out of the viewport.

   Layout tier: the sticky header zone is part of the page frame. CSS has no
   "is this element stuck" selector, so this is the standard sentinel +
   IntersectionObserver stand-in for one. */

// Toggle .is-stuck on whatever sits right after a .sticky-zone-sentinel
// once that (zero-height) marker scrolls out of the viewport — CSS has no
// way to detect "currently pinned" for a position:sticky element on its
// own, so pages that want a stronger stuck-state style (e.g. the SEND &
// Provision dashboard's filter bar) add the marker as the sticky
// element's immediately preceding sibling.
export function initStickyZoneSentinels() {
    var sentinels = document.querySelectorAll('.sticky-zone-sentinel');
    if (!sentinels.length || !window.IntersectionObserver) return;
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            var stuckEl = entry.target.nextElementSibling;
            if (stuckEl) stuckEl.classList.toggle('is-stuck', !entry.isIntersecting);
        });
    }, { threshold: 0 });
    sentinels.forEach(function (sentinel) { observer.observe(sentinel); });
}
