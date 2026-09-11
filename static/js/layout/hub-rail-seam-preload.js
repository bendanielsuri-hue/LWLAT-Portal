/* Pre-paint duplicate of positionHubRailSeam (layout/hub-rail.js) - #212
   moved this out of layout.html's inline <script>, ADR 0021, but it stays a
   plain blocking classic script (no type="module", no defer) on purpose:
   it has to run synchronously the instant .hub-rail-inner has been parsed,
   before first paint, or the seam/fill default to "no active item" (layout.css's
   .js-preload rules) until main.js's own deferred copy measures the active
   icon later - visible as a flash on page load. A module can't do this; module
   scripts always run after parsing, same as defer, which is the exact delay
   this exists to avoid. main.js still runs positionHubRailSeam() itself
   afterwards as normal - a no-op here once this already got it right. */
(function () {
    var rail = document.querySelector('.hub-rail-inner');
    var seamTop = document.getElementById('hub-rail-seam-top');
    var seamBottom = document.getElementById('hub-rail-seam-bottom');
    var activeFill = document.getElementById('hub-rail-active-fill');
    if (!rail || !seamTop || !seamBottom || !activeFill) return;
    try {
        var active = rail.querySelector('.hub-rail-item.active');
        if (active) {
            var railRect = rail.getBoundingClientRect();
            var pillRect = (active.querySelector('svg') || active).getBoundingClientRect();
            var top = pillRect.top - railRect.top;
            seamTop.style.height = top + 'px';
            seamBottom.style.top = (top + pillRect.height) + 'px';
            activeFill.style.top = top + 'px';
            activeFill.style.height = pillRect.height + 'px';
            activeFill.style.left = (pillRect.left - railRect.left) + 'px';
        }
    } catch (e) { }
    seamTop.style.visibility = 'visible';
    seamBottom.style.visibility = 'visible';
    activeFill.style.visibility = 'visible';
})();
