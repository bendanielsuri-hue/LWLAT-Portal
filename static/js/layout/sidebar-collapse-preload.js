/* Pre-paint duplicate of setupSidebarCollapse's locked()/touchRailActive()/
   wideDesktop()+manualCollapsePreferred() decision (layout/sidebar.js) -
   #212 moved this out of layout.html's inline <script>, ADR 0021, but it
   stays a plain blocking classic script (no type="module", no defer) on
   purpose: it has to run synchronously the instant #hub-sidebar-nav has
   been parsed, before first paint, closing the other half of the same
   flash hub-rail-seam-preload.js exists for (the sidebar's own width/
   labels, not just the global rail). A module can't do this - module
   scripts always run after parsing, same as defer, which is the exact
   delay this exists to avoid. Also reveals the sidebar (layout.css's
   .js-preload #hub-sidebar-nav starts it visibility:hidden) as the very
   last step, unconditionally, outside the try/catch and after every class
   decision above, so nothing can ever paint before this point regardless
   of which branch ran or whether one threw - measured happening in
   practice for landscape tablet width (900-1180px, no plain-CSS-only
   fallback the way <=900px has) even after the class fix shipped.
   main.js still runs its full setup afterwards as normal; on a page load
   this just confirms the same state again, a no-op with nothing left to
   visibly snap to. */
(function () {
    var nav = document.getElementById('hub-sidebar-nav');
    if (!nav) return;
    try {
        var touch = document.documentElement.classList.contains('nav-touch-mode');
        var narrow = window.matchMedia('(max-width: 1200px)').matches;
        var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        var locked = narrow && hoverCapable && !touch;
        var touchRail = window.matchMedia('(min-width: 481px) and (max-width: 1180px)').matches && touch;
        var wideDesktop = hoverCapable && !narrow && !touch;
        var manualCollapsed = false;
        try { manualCollapsed = localStorage.getItem('pref-sidebar-collapsed') === '1'; } catch (e) { }
        if (touchRail || locked || (wideDesktop && manualCollapsed)) {
            nav.classList.add('collapsed');
        }
    } catch (e) { }
    nav.style.visibility = 'visible';
})();
