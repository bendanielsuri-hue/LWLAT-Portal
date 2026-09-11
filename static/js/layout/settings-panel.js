/* The settings panel: primary colour, theme, theme mode and text size, plus
   the "Show all modules" developer toggle.

   Layout tier, not a component (ADR 0020): there is exactly one settings panel,
   it lives in layout.html's own chrome, and everything it does is write a
   preference to localStorage or a cookie and re-apply it to <html>. The initial
   values are set before first paint by layout.html's inline boot script; this
   is what changes them afterwards. */

// Settings panel: primary colour, theme, theme mode (light/dark), text size — applied app-wide via
// attributes on <html> (set early by the inline boot script in layout.html) and persisted.
export function initSettingsPanel() {
    var root = document.documentElement;

    // Per-theme swatch labels only — the hex itself is read from the
    // actual CSS via swatchProbe below rather than duplicated here, so
    // this can't drift out of sync with theme/themes.css the way a
    // hardcoded hex table did. "pastel" matches the hardcoded swatch
    // title/aria-label values already in the template, so it's omitted
    // here and falls back to those.
    var themeSwatchLabels = {
        vibrant: {
            purple: 'Vivid Violet', blue: 'Vivid Blue', teal: 'Vivid Teal',
            green: 'Vivid Green', yellow: 'Vivid Yellow', orange: 'Vivid Orange',
            red: 'Vivid Red', pink: 'Vivid Pink'
        },
        greytone: {
            purple: 'Slate', blue: 'Steel', teal: 'Graphite',
            green: 'Stone', yellow: 'Taupe', orange: 'Umber',
            red: 'Onyx', pink: 'Ash'
        },
        colourblind: {
            purple: 'Muted Plum', blue: 'Sky Blue', teal: 'Bluish Green',
            green: 'Sea Green', yellow: 'Safe Yellow', orange: 'Safe Orange',
            red: 'Muted Red', pink: 'Safe Magenta'
        },
        minimal: {
            purple: 'Iris', blue: 'Denim', teal: 'Sage',
            green: 'Moss', yellow: 'Sand', orange: 'Rust',
            red: 'Clay', pink: 'Mauve'
        },
        neon: {
            purple: 'Plasma', blue: 'Electric', teal: 'Cyber',
            green: 'Toxic', yellow: 'Solar', orange: 'Inferno',
            red: 'Laser', pink: 'Magenta'
        },
        cool: {
            purple: 'Twilight', blue: 'Arctic', teal: 'Glacial',
            green: 'Alpine', yellow: 'Polar', orange: 'Dusk',
            red: 'Aurora', pink: 'Blush'
        }
    };
    var pastelSwatches = {};
    // Excludes [data-value="school"] ("Corporate") - it has no inline
    // --swatch of its own (styled by class instead, layout.css) since
    // it doesn't resolve to one fixed hex, only whichever school's
    // currently selected.
    document.querySelectorAll('#pref-color .colour-swatch:not(.colour-swatch--corporate)').forEach(function (btn) {
        pastelSwatches[btn.dataset.value] = [btn.style.getPropertyValue('--swatch'), btn.title];
    });

    var colourNames = {};
    Object.keys(pastelSwatches).forEach(function (key) { colourNames[key] = pastelSwatches[key][1]; });
    colourNames.school = 'Corporate';

    // Off-screen probe element: reading --primary-base off it with the
    // target [data-theme]/[data-color] attributes gets the real,
    // currently-live swatch colour straight from the CSS cascade instead
    // of a second hand-maintained hex table.
    var swatchProbe = document.createElement('div');
    swatchProbe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
    document.body.appendChild(swatchProbe);

    function getThemeAccentHex(theme, colour) {
        swatchProbe.setAttribute('data-theme', theme);
        swatchProbe.setAttribute('data-color', colour);
        return getComputedStyle(swatchProbe).getPropertyValue('--primary-base').trim() || null;
    }

    // Shared wiring for the swatch/option button-groups (colour, text size)
    function setupButtonGroup(containerId, attr, storageKey, fallback, onSelect) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var buttons = container.querySelectorAll('[data-value]');

        function applySelection(value) {
            buttons.forEach(function (btn) {
                btn.classList.toggle('selected', btn.dataset.value === value);
            });
            if (onSelect) onSelect(value);
        }

        applySelection(root.getAttribute(attr) || fallback);

        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var value = btn.dataset.value;
                root.setAttribute(attr, value);
                try { localStorage.setItem(storageKey, value); } catch (e) { }
                applySelection(value);
            });
        });
    }

    function applyThemeSwatches(theme) {
        var labels = themeSwatchLabels[theme];
        // Corporate excluded - see pastelSwatches' own identical exclusion
        // above for why; it has nothing here to refresh.
        document.querySelectorAll('#pref-color .colour-swatch:not(.colour-swatch--corporate), #themes-pref-color .colour-swatch:not(.colour-swatch--corporate)').forEach(function (btn) {
            var colour = btn.dataset.value;
            var pastelEntry = pastelSwatches[colour];
            var hex = labels ? getThemeAccentHex(theme, colour) : null;
            var label = (labels && labels[colour]) || (pastelEntry && pastelEntry[1]);
            if (!hex && !pastelEntry) return;
            btn.style.setProperty('--swatch', hex || pastelEntry[0]);
            if (label) {
                btn.title = label;
                btn.setAttribute('aria-label', label);
                colourNames[colour] = label;
            }
        });
        updateColourLabel();
    }

    // "Corporate" (pref-color absent or 'school') resolves to whichever
    // school is currently selected (data-school-color, server-rendered
    // from core.portal_settings) rather than one fixed colour - live
    // feedback: "I do want to override the primary colour with my
    // preferred colour... reverts to the school colour" once real
    // per-school accent colours made data-school-color's existing
    // precedence (layout.html) actually visible for the first time.
    // Picking a real colour swatch instead is remembered the same way
    // pref-color already was, just no longer silently overridden.
    function colourMode() {
        var stored = localStorage.getItem('pref-color');
        return (stored && stored !== 'school') ? stored : 'school';
    }
    function updateColourLabel() {
        var label = document.getElementById('pref-color-current');
        if (!label) return;
        var mode = colourMode();
        if (mode === 'school') {
            var resolved = root.getAttribute('data-school-color') || 'purple';
            label.textContent = 'Corporate (' + (colourNames[resolved] || resolved) + ')';
        } else {
            label.textContent = colourNames[mode] || mode;
        }
    }
    (function () {
        var container = document.getElementById('pref-color');
        if (!container) return;
        var buttons = container.querySelectorAll('[data-value]');
        function applySelection(mode) {
            buttons.forEach(function (btn) { btn.classList.toggle('selected', btn.dataset.value === mode); });
            updateColourLabel();
        }
        applySelection(colourMode());
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var value = btn.dataset.value;
                try { localStorage.setItem('pref-color', value); } catch (e) { }
                root.setAttribute('data-color', value === 'school' ? (root.getAttribute('data-school-color') || 'purple') : value);
                applySelection(value);
            });
        });
    })();

    var themeDescriptions = {
        pastel: 'Calm, low-contrast tones with warm borders and subtle depth.',
    vibrant: 'Bold, high-visibility colours designed for dashboards and data.',
        cool: 'Crisp blue-grey tones for a focused, professional look.',
        minimal: 'Clean, understated styling that keeps attention on content.',
        neon: 'Vivid, energetic colours with striking electric accents.',
        colourblind: 'Accessible Okabe-Ito colours, clearly distinguishable across colour vision types.'
    };

    setupButtonGroup('pref-theme', 'data-theme', 'pref-theme', 'pastel', function (value) {
        applyThemeSwatches(value);
        var themeLabel = document.getElementById('pref-theme-current');
        if (themeLabel) themeLabel.textContent = themeDescriptions[value] || '';
    });
    applyThemeSwatches(root.getAttribute('data-theme') || 'pastel');

    setupButtonGroup('pref-text-size', 'data-text-size', 'pref-text-size', 'md');
    setupButtonGroup('pref-time-format', 'data-time-format', 'pref-time-format', '24');

    // Theme mode toggle: a single switch showing sun (light) / moon (dark)
    var themeModeToggle = document.getElementById('pref-theme-mode');
    if (themeModeToggle) {
        function applyThemeMode(value) {
            themeModeToggle.setAttribute('aria-checked', value === 'dark' ? 'true' : 'false');
        }
        applyThemeMode(root.getAttribute('data-theme-mode') || 'light');
        themeModeToggle.addEventListener('click', function () {
            var next = (root.getAttribute('data-theme-mode') || 'light') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme-mode', next);
            try { localStorage.setItem('pref-theme-mode', next); } catch (e) { }
            applyThemeMode(next);
        });
    }
}

// "Show all modules" toggle: unlike the theme mode toggle (pure CSS, no reload),
// this needs a cookie write + reload since it changes server-rendered menus
// (read server-side in core.modules.view_full_system).
export function initViewFullSystemToggle() {
    var toggle = document.getElementById('pref-view-full-system');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
        var next = toggle.getAttribute('aria-checked') !== 'true';
        document.cookie = 'view_full_system=' + (next ? '1' : '0') + '; path=/; max-age=31536000; SameSite=Lax';
        location.reload();
    });
}
