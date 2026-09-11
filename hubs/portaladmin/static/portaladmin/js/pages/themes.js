/* Themes gallery page's own behavior (#212 - moved out of themes.html's
   inline <script>, ADR 0021). Mirrors the on-page preference bar onto the
   sidebar's real controls so clicking it fires main.js's full handler
   chain (applyThemeSwatches, colour name labels, etc.) instead of
   duplicating that logic here. */
(function () {
    var root = document.documentElement;

    function syncSelected(containerId, value) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('[data-value]').forEach(function (btn) {
            btn.classList.toggle('selected', btn.dataset.value === value);
        });
    }

    function syncBar() {
        syncSelected('themes-pref-theme', root.getAttribute('data-theme') || 'pastel');
        syncSelected('themes-pref-color', root.getAttribute('data-color') || 'purple');
        syncSelected('themes-pref-text-size', root.getAttribute('data-text-size') || 'md');
        var t = document.getElementById('themes-pref-theme-mode');
        if (t) t.setAttribute('aria-checked', (root.getAttribute('data-theme-mode') || 'light') === 'dark' ? 'true' : 'false');
    }
    syncBar();

    // Delegate all three controls to their sidebar counterparts so main.js's
    // full handler chain fires — applyThemeSwatches, colour name labels, etc.
    var themeBar = document.getElementById('themes-pref-theme');
    if (themeBar) {
        themeBar.querySelectorAll('[data-value]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var sb = document.querySelector('#pref-theme [data-value="' + btn.dataset.value + '"]');
                if (sb) sb.click();
            });
        });
    }

    var colorBar = document.getElementById('themes-pref-color');
    if (colorBar) {
        colorBar.querySelectorAll('[data-value]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var sb = document.querySelector('#pref-color [data-value="' + btn.dataset.value + '"]');
                if (sb) sb.click();
            });
        });
    }

    var textSizeBar = document.getElementById('themes-pref-text-size');
    if (textSizeBar) {
        textSizeBar.querySelectorAll('[data-value]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var sb = document.querySelector('#pref-text-size [data-value="' + btn.dataset.value + '"]');
                if (sb) sb.click();
            });
        });
    }

    var themeModeBtn = document.getElementById('themes-pref-theme-mode');
    if (themeModeBtn) {
        themeModeBtn.addEventListener('click', function () {
            var sb = document.getElementById('pref-theme-mode');
            if (sb) sb.click();
        });
    }

    // Keep bar in sync when the sidebar settings panel changes the same root attributes
    new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            if (m.attributeName === 'data-theme') syncSelected('themes-pref-theme', root.getAttribute('data-theme') || 'pastel');
            if (m.attributeName === 'data-color') syncSelected('themes-pref-color', root.getAttribute('data-color') || 'purple');
            if (m.attributeName === 'data-text-size') syncSelected('themes-pref-text-size', root.getAttribute('data-text-size') || 'md');
            if (m.attributeName === 'data-theme-mode') {
                var t = document.getElementById('themes-pref-theme-mode');
                if (t) t.setAttribute('aria-checked', (root.getAttribute('data-theme-mode') || 'light') === 'dark' ? 'true' : 'false');
            }
        });
    }).observe(root, { attributes: true, attributeFilter: ['data-theme-mode', 'data-color', 'data-theme', 'data-text-size'] });
})();
