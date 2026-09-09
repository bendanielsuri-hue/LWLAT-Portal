/* PROTOTYPE - throwaway, never merge to main.
   Branch: prototype/tray-section-fill-variants. Floating switcher for the
   four tray-section states in prototype-tray-variants.css.

   ?tray=a|b|c|now in the URL, mirrored to localStorage so the choice
   survives the filter form's own GET submits (which rebuild the query
   string from the form's fields and would otherwise drop it). Left/right
   arrow keys cycle too, except while typing in a field. */
(function () {
    var VARIANTS = [
        { key: 'now', name: 'today, untouched' },
        { key: 'a', name: 'flowed + wrapping tint' },
        { key: 'b', name: 'tinted box' },
        { key: 'c', name: 'fill the line' }
    ];
    var STORE = 'prototypeTrayVariant';

    function currentKey() {
        var fromUrl = new URLSearchParams(window.location.search).get('tray');
        var stored = null;
        try { stored = window.localStorage.getItem(STORE); } catch (e) { /* private mode */ }
        var key = fromUrl || stored || 'now';
        return VARIANTS.some(function (v) { return v.key === key; }) ? key : 'now';
    }

    function apply(key, pushUrl) {
        document.documentElement.dataset.trayVariant = key;
        try { window.localStorage.setItem(STORE, key); } catch (e) { /* private mode */ }
        if (pushUrl) {
            var url = new URL(window.location.href);
            url.searchParams.set('tray', key);
            window.history.replaceState(null, '', url);
        }
        var label = document.querySelector('[data-prototype-label]');
        if (label) {
            var v = VARIANTS.filter(function (x) { return x.key === key; })[0];
            label.textContent = v.key.toUpperCase() + ' - ' + v.name;
        }
    }

    function cycle(step) {
        var keys = VARIANTS.map(function (v) { return v.key; });
        var i = keys.indexOf(document.documentElement.dataset.trayVariant || 'now');
        apply(keys[(i + step + keys.length) % keys.length], true);
    }

    function build() {
        var bar = document.createElement('div');
        bar.setAttribute('data-prototype-switcher', '');
        /* Deliberately nothing like the app: near-black pill, so it never
           gets mistaken for part of the design being judged. Sits above the
           mobile tabbar/FAB rather than over them. */
        bar.style.cssText = [
            'position:fixed', 'left:50%', 'transform:translateX(-50%)',
            'bottom:88px', 'z-index:9999', 'display:flex', 'align-items:center',
            'gap:12px', 'padding:8px 12px', 'border-radius:999px',
            'background:#11151c', 'color:#fff', 'font:600 12px/1 system-ui,sans-serif',
            'box-shadow:0 6px 20px rgba(0,0,0,0.35)'
        ].join(';');
        bar.innerHTML =
            '<button type="button" data-prototype-prev aria-label="Previous variant" ' +
            'style="all:unset;cursor:pointer;padding:2px 6px;font-size:14px">&#8592;</button>' +
            '<span data-prototype-label style="min-width:170px;text-align:center"></span>' +
            '<button type="button" data-prototype-next aria-label="Next variant" ' +
            'style="all:unset;cursor:pointer;padding:2px 6px;font-size:14px">&#8594;</button>';
        document.body.appendChild(bar);
        bar.querySelector('[data-prototype-prev]').addEventListener('click', function () { cycle(-1); });
        bar.querySelector('[data-prototype-next]').addEventListener('click', function () { cycle(1); });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        var el = document.activeElement;
        if (el && (el.matches('input, textarea, select') || el.isContentEditable)) return;
        cycle(e.key === 'ArrowRight' ? 1 : -1);
    });

    function init() { build(); apply(currentKey(), false); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
