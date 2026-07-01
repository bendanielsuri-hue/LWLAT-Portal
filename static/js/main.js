document.addEventListener('DOMContentLoaded', function () {
    function closest(el, selector) {
        while (el) {
            if (el.matches && el.matches(selector)) return el;
            el = el.parentElement;
        }
        return null;
    }

    // Manual collapse/expand of the hub sidebar to an icon-only rail. Below the
    // narrow-window breakpoint there's no stored preference yet, default to
    // collapsed for space — but (unlike the old forced-icon-only @media rule)
    // the toggle itself stays visible there, so a tap can still expand it.
    // Touch devices have no :hover, so this toggle is the only way to ever
    // reach the full labels on a narrow/mobile viewport.
    (function setupSidebarCollapse() {
        var toggle = document.getElementById('sidebar-collapse-toggle');
        var nav = toggle && closest(toggle, '.side-nav');
        if (!toggle || !nav) return;
        var toggleIconEl = toggle.querySelector('.icon-tooltip-host');
        var toggleLabelEl = document.getElementById('sidebar-collapse-toggle-label');
        var STORAGE_KEY = 'pref-sidebar-collapsed';
        var NARROW_QUERY = '(max-width: 900px)';

        function updateToggleLabel() {
            var collapsed = nav.classList.contains('collapsed');
            var label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
            toggle.setAttribute('aria-label', label);
            if (toggleIconEl) toggleIconEl.setAttribute('data-tooltip', label);
            if (toggleLabelEl) toggleLabelEl.textContent = collapsed ? 'Expand' : 'Collapse';
            // Hub landing pages render their H1 as "Dashboard" with a hidden
            // "<Hub Name> " prefix (see e.g. hubs/inclusion/templates/hubs/inclusion/hub.html)
            // — once the sidebar collapses to an icon-only rail, the hub name
            // disappears from the nav-title there too, so the H1 is the only
            // place left to show it.
            var hubTitlePrefix = document.getElementById('hub-title-prefix');
            if (hubTitlePrefix) hubTitlePrefix.hidden = !collapsed;
        }

        var storedPref = localStorage.getItem(STORAGE_KEY);
        var shouldCollapse = storedPref === null
            ? window.matchMedia(NARROW_QUERY).matches
            : storedPref === 'true';
        if (shouldCollapse) {
            nav.classList.add('collapsed');
        }
        updateToggleLabel();

        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            var collapsed = nav.classList.toggle('collapsed');
            try { localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false'); } catch (err) { }
            updateToggleLabel();
        });
    })();

    // Generic overlay nav handling: "Switch Hub", "Select School", "Select User" and
    // "Settings" are absolutely-positioned layers stacked inside one shared
    // `.overlay-slot`, which is the actual flex column that slides out beside the
    // primary sidebar/rail (CSS `order` places it after the rail, before <main>) —
    // opening a panel shows that layer and widens the slot from 0, pushing <main>
    // over, and dims <main> behind a backdrop scoped to it.
    function openOverlay(navEl) {
        if (!navEl) return;
        document.querySelectorAll('.overlay-nav.open').forEach(function (other) {
            if (other !== navEl) closeOverlay(other);
        });
        navEl.classList.add('open');
        var slot = closest(navEl, '.overlay-slot');
        if (slot) slot.classList.add('open');
        addBackdrop(function () { closeOverlay(navEl); });
        var input = navEl.querySelector('.nav-header input, .nav-scroll input');
        if (input) input.focus();
    }
    function closeOverlay(navEl) {
        if (!navEl) return;
        navEl.classList.remove('open');
        var slot = closest(navEl, '.overlay-slot');
        if (slot && !slot.querySelector('.overlay-nav.open')) slot.classList.remove('open');
        removeBackdrop();
    }

    document.querySelectorAll('[data-overlay-target]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var navEl = document.querySelector(btn.dataset.overlayTarget);
            if (!navEl) return;
            if (navEl.classList.contains('open')) {
                closeOverlay(navEl);
            } else {
                openOverlay(navEl);
            }
        });
    });

    // Close button inside any overlay
    document.querySelectorAll('.overlay-nav .nav-close-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            closeOverlay(closest(e.target, '.overlay-nav'));
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var openNav = document.querySelector('.overlay-nav.open');
        if (openNav) closeOverlay(openNav);
    });

    // Switching directly from one open overlay to another (e.g. Settings -> Change
    // School) reuses the same backdrop element rather than removing/recreating it, so
    // its pending removal (scheduled by the close that's part of that switch) must be
    // cancelled — otherwise the backdrop a later overlay is relying on gets deleted out
    // from under it once that stale timer fires, and the dimming just vanishes.
    var backdropRemovalTimer = null;

    function addBackdrop(onClick) {
        var main = document.querySelector('.page-shell > main');
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

    function removeBackdrop() {
        var existing = document.querySelector('.page-shell > main .global-backdrop');
        if (!existing) return;
        existing.classList.remove('active');
        if (backdropRemovalTimer) clearTimeout(backdropRemovalTimer);
        // remove after fade out transition
        backdropRemovalTimer = setTimeout(function () {
            if (existing.parentNode) existing.parentNode.removeChild(existing);
            backdropRemovalTimer = null;
        }, 380);
    }

    // Make the top section of each hub card clickable, without double-navigating when an inner link/button is clicked
    document.querySelectorAll('.hub-card-top').forEach(function (top) {
        var url = top.dataset.url;
        if (!url) return;
        top.addEventListener('click', function (e) {
            if (closest(e.target, 'a, button')) return;
            window.location.href = url;
        });
        top.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (closest(e.target, 'a, button')) return;
            e.preventDefault();
            window.location.href = url;
        });
    });

    // Selectable cards/rows: clicking (or Enter/Space on) a card toggles a "chosen"
    // state, without triggering when the click lands on an inner link/button.
    document.querySelectorAll('[data-selectable]').forEach(function (container) {
        var single = container.dataset.selectable === 'single';

        function toggle(item) {
            var isChosen = item.classList.contains('chosen');
            if (single && !isChosen) {
                container.querySelectorAll('.selectable.chosen').forEach(function (other) {
                    other.classList.remove('chosen');
                    other.setAttribute('aria-pressed', 'false');
                });
            }
            item.classList.toggle('chosen', !isChosen);
            item.setAttribute('aria-pressed', String(!isChosen));
        }

        container.addEventListener('click', function (e) {
            if (closest(e.target, 'a, button')) return;
            var item = closest(e.target, '.selectable');
            if (!item || !container.contains(item)) return;
            toggle(item);
        });
        container.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (closest(e.target, 'a, button')) return;
            var item = closest(e.target, '.selectable');
            if (!item || !container.contains(item)) return;
            e.preventDefault();
            toggle(item);
        });
    });

    // "+N more" toggles the hidden apps within a card instead of navigating to the hub
    document.querySelectorAll('.hub-more-toggle').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var container = closest(e.target, '.hub-card-items');
            if (!container) return;
            var expanded = container.classList.toggle('expanded');
            var moreCount = btn.dataset.moreCount || '0';
            btn.textContent = expanded ? 'Show less' : ('+' + moreCount + ' more');
        });
    });

    // Limit each hub card to 3 rows of app badges, only showing "+N more" if there's genuine overflow
    function layoutHubCardBadges(container) {
        // Don't fight a user-initiated expand (e.g. when our own resize observer fires
        // because expanding grew the card's height)
        if (container.classList.contains('expanded')) return;

        var toggle = container.querySelector('.hub-more-toggle');
        var badges = Array.prototype.slice.call(container.querySelectorAll('.hub-badge:not(.hub-more-toggle)'));
        if (!badges.length) {
            if (toggle) toggle.style.display = 'none';
            return;
        }
        badges.forEach(function (b) { b.classList.remove('hub-badge-extra'); });
        if (toggle) toggle.style.display = 'none';

        var tops = [];
        badges.forEach(function (b) {
            if (tops.indexOf(b.offsetTop) === -1) tops.push(b.offsetTop);
        });
        tops.sort(function (a, b) { return a - b; });

        if (tops.length <= 3) return;

        var rowLimit = tops[2];
        var hiddenCount = 0;
        badges.forEach(function (b) {
            if (b.offsetTop > rowLimit) {
                b.classList.add('hub-badge-extra');
                hiddenCount++;
            }
        });

        if (!toggle) return;
        toggle.style.display = 'inline-block';
        toggle.dataset.moreCount = hiddenCount;
        toggle.textContent = '+' + hiddenCount + ' more';

        var guard = 0;
        while (toggle.offsetTop > rowLimit && guard < badges.length) {
            var visibleInLastRow = badges.filter(function (b) {
                return !b.classList.contains('hub-badge-extra') && b.offsetTop === rowLimit;
            });
            if (!visibleInLastRow.length) break;
            visibleInLastRow[visibleInLastRow.length - 1].classList.add('hub-badge-extra');
            hiddenCount++;
            toggle.dataset.moreCount = hiddenCount;
            toggle.textContent = '+' + hiddenCount + ' more';
            guard++;
        }
    }

    function layoutAllHubCardBadges() {
        document.querySelectorAll('.hub-card-items').forEach(layoutHubCardBadges);
    }

    // Run after layout/paint has settled, not just after DOM parsing
    window.requestAnimationFrame(function () {
        window.requestAnimationFrame(layoutAllHubCardBadges);
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layoutAllHubCardBadges, 150);
    });

    // Self-correct if a card's content reflows after layout (e.g. icon/font finishing load)
    if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(function () {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(layoutAllHubCardBadges, 150);
        });
        document.querySelectorAll('.hub-card').forEach(function (card) { ro.observe(card); });
    }

    // Settings panel: primary colour, light/dark theme, text size — applied app-wide via
    // attributes on <html> (set early by the inline boot script in layout.html) and persisted.
    (function setupSettingsPanel() {
        var root = document.documentElement;

        // Per-palette swatch labels only — the hex itself is read from the
        // actual CSS via swatchProbe below rather than duplicated here, so
        // this can't drift out of sync with theme/palettes.css the way a
        // hardcoded hex table did. "pastel" matches the hardcoded swatch
        // title/aria-label values already in the template, so it's omitted
        // here and falls back to those.
        var paletteSwatchLabels = {
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
            }
        };
        var pastelSwatches = {};
        document.querySelectorAll('#pref-color .colour-swatch').forEach(function (btn) {
            pastelSwatches[btn.dataset.value] = [btn.style.getPropertyValue('--swatch'), btn.title];
        });

        var colourNames = {};
        Object.keys(pastelSwatches).forEach(function (key) { colourNames[key] = pastelSwatches[key][1]; });

        // Off-screen probe element: reading --primary-base off it with the
        // target [data-palette]/[data-color] attributes gets the real,
        // currently-live swatch colour straight from the CSS cascade instead
        // of a second hand-maintained hex table.
        var swatchProbe = document.createElement('div');
        swatchProbe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
        document.body.appendChild(swatchProbe);

        function getPaletteAccentHex(palette, colour) {
            swatchProbe.setAttribute('data-palette', palette);
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
                    layoutAllHubCardBadges();
                });
            });
        }

        function applyPaletteSwatches(palette) {
            var labels = paletteSwatchLabels[palette];
            document.querySelectorAll('#pref-color .colour-swatch').forEach(function (btn) {
                var colour = btn.dataset.value;
                var pastelEntry = pastelSwatches[colour];
                var hex = labels ? getPaletteAccentHex(palette, colour) : null;
                var label = (labels && labels[colour]) || (pastelEntry && pastelEntry[1]);
                if (!hex && !pastelEntry) return;
                btn.style.setProperty('--swatch', hex || pastelEntry[0]);
                if (label) {
                    btn.title = label;
                    btn.setAttribute('aria-label', label);
                    colourNames[colour] = label;
                }
            });
            var currentLabel = document.getElementById('pref-color-current');
            var selectedColour = root.getAttribute('data-color') || 'purple';
            if (currentLabel) currentLabel.textContent = colourNames[selectedColour] || selectedColour;
        }

        setupButtonGroup('pref-color', 'data-color', 'pref-color', 'purple', function (value) {
            var label = document.getElementById('pref-color-current');
            if (label) label.textContent = colourNames[value] || value;
        });

        var paletteDescriptions = {
            pastel: 'Calm, low-contrast pastel tones with subtle borders.',
            vibrant: 'Bold, saturated colours with richer surface tint.',
            greytone: 'Neutral greys only — no colour tinting.',
            colourblind: 'High-contrast, colourblind-friendly hues.'
        };

        setupButtonGroup('pref-palette', 'data-palette', 'pref-palette', 'pastel', function (value) {
            applyPaletteSwatches(value);
            var paletteLabel = document.getElementById('pref-palette-current');
            if (paletteLabel) paletteLabel.textContent = paletteDescriptions[value] || '';
        });
        applyPaletteSwatches(root.getAttribute('data-palette') || 'pastel');

        setupButtonGroup('pref-text-size', 'data-text-size', 'pref-text-size', 'md');
        setupButtonGroup('pref-time-format', 'data-time-format', 'pref-time-format', '24');

        // Theme toggle: a single switch showing sun (light) / moon (dark)
        var themeToggle = document.getElementById('pref-theme');
        if (themeToggle) {
            function applyTheme(value) {
                themeToggle.setAttribute('aria-checked', value === 'dark' ? 'true' : 'false');
            }
            applyTheme(root.getAttribute('data-theme') || 'light');
            themeToggle.addEventListener('click', function () {
                var next = (root.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
                root.setAttribute('data-theme', next);
                try { localStorage.setItem('pref-theme', next); } catch (e) { }
                applyTheme(next);
                layoutAllHubCardBadges();
            });
        }
    })();

    // "Show all modules" toggle: unlike the theme toggle (pure CSS, no reload),
    // this needs a cookie write + reload since it changes server-rendered menus
    // (read server-side in core.modules.view_full_system).
    (function setupViewFullSystemToggle() {
        var toggle = document.getElementById('pref-view-full-system');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
            var next = toggle.getAttribute('aria-checked') !== 'true';
            document.cookie = 'view_full_system=' + (next ? '1' : '0') + '; path=/; max-age=31536000; SameSite=Lax';
            location.reload();
        });
    })();

    // Shared by the "Select School" and "current user" switchers: both just
    // persist a chosen value to a cookie (read server-side in core.identity)
    // and reload, so the server re-renders everything (label, filtered staff
    // list, default identity) consistently rather than patching the DOM.
    function setupCookieSwitcher(options, cookieName, datasetKey, onClick) {
        options.forEach(function (opt) {
            opt.addEventListener('click', function () {
                var value = opt.dataset[datasetKey];
                document.cookie = cookieName + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax';
                if (onClick) onClick(opt);
                location.reload();
            });
        });
    }

    // School switcher: persists the selected school via a cookie so the server
    // can filter the identity dropdown and pick a sensible default identity.
    (function setupSchoolSwitcher() {
        var options = Array.prototype.slice.call(document.querySelectorAll('.school-nav-option[data-key]'));
        if (!options.length) return;
        setupCookieSwitcher(options, 'current_school_key', 'key', function (opt) {
            // Mirrors the selection for hubs/inclusion/templates/hubs/inclusion/panel/meeting_setup.html,
            // which still reads this localStorage key to default its own school filter.
            try { localStorage.setItem('pref-school', opt.dataset.school); } catch (e) { }
        });
    })();

    // Current-user identity switcher: a full overlay nav (like "Select School"),
    // opened via the sidebar's user row. No login system exists yet, so "who am I"
    // is just remembered per-browser via a cookie (server-side fallback/default
    // lives in core.identity).
    (function setupIdentitySwitcher() {
        var options = Array.prototype.slice.call(document.querySelectorAll('.staff-nav-option[data-staff-id]'));
        if (!options.length) return;
        setupCookieSwitcher(options, 'current_staff_id', 'staffId');
    })();

    // Identity search: filters the (already server-filtered-by-school) staff
    // list in the staff overlay by typed name, client-side only.
    (function setupIdentitySearch() {
        var overlay = document.getElementById('staff-nav-overlay');
        var input = overlay && overlay.querySelector('.identity-search-input');
        if (!input) return;
        var items = Array.prototype.slice.call(overlay.querySelectorAll('.nav-row-dropdown-list > li'));

        input.addEventListener('input', function () {
            var query = input.value.trim().toLowerCase();
            // Group dividers separate runs of options by school — a divider should
            // only stay visible when it has a visible option on both sides, otherwise
            // a fully-filtered-out group leaves a stray line with an empty gap.
            var groupHasVisible = false;
            var pendingDividers = [];
            items.forEach(function (li) {
                if (li.classList.contains('staff-nav-divider')) {
                    li.classList.add('hidden');
                    pendingDividers.push({ li: li, precededByVisible: groupHasVisible });
                    groupHasVisible = false;
                    return;
                }
                var option = li.querySelector('.staff-nav-option');
                if (!option) return;
                var name = (option.dataset.name || '').toLowerCase();
                var visible = !query || name.indexOf(query) !== -1;
                li.classList.toggle('hidden', !visible);
                if (visible) {
                    groupHasVisible = true;
                    pendingDividers.forEach(function (entry) {
                        if (entry.precededByVisible) entry.li.classList.remove('hidden');
                    });
                    pendingDividers = [];
                }
            });
        });
    })();

    // Small inline icons for the search results' hub label — kept here rather than
    // round-tripped through the server, since the result rows are built in JS from
    // the {{ search_items|json_script }} data, not server-rendered templates. Mirrors
    // the corresponding templates/icons/*_svg.html partials, just at a smaller size.
    var HUB_RESULT_ICONS = {
        'Staff': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        'Operations': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2.5v2.6M12 18.9v2.6M4.2 6.2l1.9 1.5M17.9 16.3l1.9 1.5M2.5 12h2.6M18.9 12h2.6M4.2 17.8l1.9-1.5M17.9 7.7l1.9-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        'Resources': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7L12 3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
        'Student': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.3c-1.9-1.4-4.4-1.9-6.8-1.4v12.8c2.4-.5 4.9 0 6.8 1.4 1.9-1.4 4.4-1.9 6.8-1.4V4.9c-2.4-.5-4.9 0-6.8 1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.3v12.8" stroke="currentColor" stroke-width="1.6"/></svg>',
        'SEND & Provision': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20.5s-8-4.6-8-10.8A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8 3.1c0 6.2-8 10.8-8 10.8z" fill="currentColor"/></svg>',
        'Registers': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3.5" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="2" width="6" height="3" rx="1" fill="currentColor"/><path d="M8.5 11.2l1.6 1.6L13 9.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 16.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        'Careers': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" fill="currentColor"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
    };

    // App search: client-side typeahead over every hub/page link, built from the JSON
    // embedded sitewide via {{ search_items|json_script }} in layout.html. Used both by
    // the home screen's own search box and the one inside the "Switch Hub" overlay.
    function setupAppSearch(inputId, resultsId, dataId) {
        var input = document.getElementById(inputId);
        var results = document.getElementById(resultsId);
        var dataEl = document.getElementById(dataId);
        if (!input || !results || !dataEl) return;

        var items = [];
        try { items = JSON.parse(dataEl.textContent) || []; } catch (e) { }

        function closeResults() {
            results.classList.add('hidden');
            results.innerHTML = '';
        }

        function render(matches) {
            results.innerHTML = '';
            if (!matches.length) {
                var empty = document.createElement('div');
                empty.className = 'app-search-empty';
                empty.textContent = 'No matching apps';
                results.appendChild(empty);
            } else {
                matches.forEach(function (item, index) {
                    var row = document.createElement('div');
                    row.className = 'app-search-result' + (index === 0 ? ' active' : '');
                    row.setAttribute('role', 'option');
                    row.dataset.url = item.url;

                    var name = document.createElement('span');
                    name.className = 'app-search-result-name';
                    name.textContent = item.name;
                    row.appendChild(name);

                    var hub = document.createElement('span');
                    hub.className = 'app-search-result-hub';
                    hub.innerHTML = (HUB_RESULT_ICONS[item.hub] || '') + '<span></span>';
                    hub.querySelector('span').textContent = item.hub;
                    row.appendChild(hub);

                    row.addEventListener('click', function () { window.location.href = item.url; });
                    row.addEventListener('mouseenter', function () {
                        var active = results.querySelector('.app-search-result.active');
                        if (active) active.classList.remove('active');
                        row.classList.add('active');
                    });
                    results.appendChild(row);
                });
            }
            results.classList.remove('hidden');
        }

        function search(query) {
            query = query.trim().toLowerCase();
            if (!query) { closeResults(); return; }
            var matches = items.filter(function (item) {
                return item.name.toLowerCase().indexOf(query) !== -1 || item.hub.toLowerCase().indexOf(query) !== -1;
            }).slice(0, 8);
            render(matches);
        }

        input.addEventListener('input', function () { search(input.value); });

        input.addEventListener('keydown', function (e) {
            var rows = Array.prototype.slice.call(results.querySelectorAll('.app-search-result'));
            if (!rows.length) {
                if (e.key === 'Escape') closeResults();
                return;
            }
            var activeIndex = rows.findIndex(function (r) { return r.classList.contains('active'); });

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeIndex >= 0) rows[activeIndex].classList.remove('active');
                activeIndex = (activeIndex + 1) % rows.length;
                rows[activeIndex].classList.add('active');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeIndex >= 0) rows[activeIndex].classList.remove('active');
                activeIndex = (activeIndex - 1 + rows.length) % rows.length;
                rows[activeIndex].classList.add('active');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                var target = activeIndex >= 0 ? rows[activeIndex] : rows[0];
                if (target && target.dataset.url) window.location.href = target.dataset.url;
            } else if (e.key === 'Escape') {
                closeResults();
            }
        });

        document.addEventListener('click', function (e) {
            if (!results.classList.contains('hidden') && !closest(e.target, '.app-search')) closeResults();
        });
    }

    setupAppSearch('app-search-input', 'app-search-results', 'app-search-data');
    setupAppSearch('rail-app-search-input', 'rail-app-search-results', 'app-search-data');

    // List page shells (Students/Referrals/Actions): sized to exactly fill the
    // space between the sticky page header and the bottom of the viewport, so
    // the shell/page never scrolls — only the entity-list inside the list-card
    // does. 32 is .main-inner's bottom padding.
    (function setupListPageShellHeight() {
        var header = document.querySelector('.page-header');
        var shells = document.querySelectorAll('.list-page-shell');
        if (!header || !shells.length) return;

        function applyHeight() {
            var height = window.innerHeight - header.getBoundingClientRect().bottom - 32;
            shells.forEach(function (shell) { shell.style.height = height + 'px'; });
        }

        applyHeight();
        window.addEventListener('resize', applyHeight);
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(applyHeight).observe(header);
        }
    })();

    // Sticky column headings (Panel Setup): any [data-sticky-under-header]
    // element sticks just below the global sticky .page-header instead of
    // at the very top of main's scroll area, so it doesn't overlap it as
    // the page scrolls. Same measurement/resize technique as the list page
    // shell height above.
    (function setupStickyColumnHeaders() {
        var header = document.querySelector('.page-header');
        var elements = Array.prototype.slice.call(document.querySelectorAll('[data-sticky-under-header]'));
        if (!header || !elements.length) return;

        function applyOffset() {
            var headerBottom = header.getBoundingClientRect().bottom;
            // Stack same-column sticky headers one below another (cumulative
            // offset) instead of pinning them all to the same top, which
            // would make a later one overlap an earlier one once both are
            // pinned at once (e.g. Panel Details above Panel Members).
            var columns = [];
            var stacks = [];
            elements.forEach(function (el) {
                var col = el.closest('.setup-col') || el.parentElement;
                var idx = columns.indexOf(col);
                if (idx === -1) {
                    idx = columns.push(col) - 1;
                    stacks.push(0);
                }
                el.style.top = (headerBottom + stacks[idx]) + 'px';
                stacks[idx] += el.getBoundingClientRect().height;
            });
        }

        applyOffset();
        window.addEventListener('resize', applyOffset);
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(applyOffset).observe(header);
        }
    })();

    // Generic overflow tabs: any row of <button> tabs opting in via
    // [data-overflow-tabs] (or the two cases already relying on it —
    // Inclusion Panel's per-card .tab-row and any .card-switcher) collapses
    // whichever buttons don't fit into a "More" dropdown instead of wrapping.
    // Re-measures on resize and whenever a tab is clicked (so the dropdown's
    // contents and active-state stay in sync). Reusable sitewide: a page
    // with its own tab row that needs this just adds the same data attribute
    // and a non-wrapping row — see .panel-card .tab-row in panel.css for the
    // CSS half (flex-wrap: nowrap; overflow: hidden) the row itself needs.
    function setupOverflowTabs(row) {
        if (!row) return;
        var buttons = Array.prototype.slice.call(row.children).filter(function (el) {
            return el.tagName === 'BUTTON';
        });
        if (buttons.length < 2) return;

        var moreWrap = document.createElement('div');
        moreWrap.className = 'tab-row-more';
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'tab-row-more-btn';
        moreBtn.textContent = 'More ▾';
        var menu = document.createElement('div');
        menu.className = 'tab-row-more-menu hidden';
        moreWrap.appendChild(moreBtn);
        moreWrap.appendChild(menu);
        row.appendChild(moreWrap);

        moreBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
        document.addEventListener('click', function () { menu.classList.add('hidden'); });

        function measure() {
            moreWrap.style.display = 'none';
            buttons.forEach(function (b) { b.style.display = ''; });
            menu.innerHTML = '';

            var available = row.clientWidth;
            var totalWidth = buttons.reduce(function (sum, b) { return sum + b.offsetWidth; }, 0);
            if (totalWidth <= available) return;

            moreWrap.style.display = '';
            var budget = available - moreWrap.offsetWidth;
            var used = 0;
            var overflowed = [];
            buttons.forEach(function (b) {
                var w = b.offsetWidth;
                if (used + w <= budget) {
                    used += w;
                } else {
                    b.style.display = 'none';
                    overflowed.push(b);
                }
            });

            overflowed.forEach(function (b) {
                var item = document.createElement('button');
                item.type = 'button';
                item.textContent = b.textContent;
                if (b.classList.contains('active')) item.classList.add('active');
                item.addEventListener('click', function () {
                    menu.classList.add('hidden');
                    b.click();
                });
                menu.appendChild(item);
            });
        }

        row.addEventListener('click', function () { measure(); });
        measure();
        window.addEventListener('resize', measure);
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(measure).observe(row);
        }
    }

    document.querySelectorAll('.panel-card .tab-row, .card-switcher, [data-overflow-tabs]').forEach(setupOverflowTabs);

    // Page-header actions (the {% block page_extras %} buttons/links beside
    // the page title, e.g. "Add Referral") crowd the title on narrow
    // screens. Below the existing 900px sidebar-collapse breakpoint, fold
    // them into an "Actions ▾" dropdown reusing the same .tab-row-more*
    // look as setupOverflowTabs() above. The real nodes are moved (not
    // cloned) so any click handlers/data attributes on them keep working.
    (function setupPageExtrasOverflow() {
        var mq = window.matchMedia('(max-width: 900px)');

        function collectActionItems(extras) {
            var items = [];
            Array.prototype.forEach.call(extras.children, function (el) {
                if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                    items.push(el);
                } else if (el.classList.contains('key-actions')) {
                    Array.prototype.forEach.call(el.children, function (child) {
                        if (child.tagName === 'A' || child.tagName === 'BUTTON') items.push(child);
                    });
                }
            });
            return items;
        }

        document.querySelectorAll('.page-header-extras').forEach(function (extras) {
            var items = collectActionItems(extras);
            if (!items.length) return;

            items.forEach(function (item) {
                item._homeParent = item.parentElement;
                item._homeNext = item.nextSibling;
            });

            var moreWrap = document.createElement('div');
            moreWrap.className = 'tab-row-more hidden';
            var moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'tab-row-more-btn';
            moreBtn.textContent = 'Actions ▾';
            var menu = document.createElement('div');
            menu.className = 'tab-row-more-menu hidden';
            moreWrap.appendChild(moreBtn);
            moreWrap.appendChild(menu);
            extras.appendChild(moreWrap);

            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });
            document.addEventListener('click', function () { menu.classList.add('hidden'); });

            function collapse() {
                items.forEach(function (item) { menu.appendChild(item); });
                moreWrap.classList.remove('hidden');
            }
            function expand() {
                items.slice().reverse().forEach(function (item) {
                    item._homeParent.insertBefore(item, item._homeNext);
                });
                moreWrap.classList.add('hidden');
                menu.classList.add('hidden');
            }

            function sync() {
                if (mq.matches) collapse(); else expand();
            }
            sync();
            mq.addEventListener('change', sync);
        });
    })();

    // Generic card switcher: pairs a .card-switcher (row of .card-tab buttons,
    // each with data-card-target="<id>") with a group of full-size "cards"
    // elsewhere on the page sharing class .switch-card. Below the breakpoint
    // that hides a page's normal side-by-side card layout (see the
    // .switch-card-group media query in style.css), clicking a tab shows the
    // matching card and hides the others. Reusable sitewide — any page can
    // adopt this by following the same markup convention, not just Inclusion
    // Panel Home.
    document.querySelectorAll('.card-switcher').forEach(function (switcher) {
        var buttons = switcher.querySelectorAll('.card-tab');
        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                buttons.forEach(function (b) { b.classList.remove('active'); });
                button.classList.add('active');
                document.querySelectorAll('.switch-card').forEach(function (card) {
                    card.classList.toggle('active-card', card.id === button.dataset.cardTarget);
                });
                // The now-visible card's own tab row (if any) may have been
                // measured while display:none and reported zero width —
                // force a re-measure now that it's actually visible.
                window.dispatchEvent(new Event('resize'));
            });
        });
    });

    // Breadcrumbs: trail is always rooted at "LWLAT Portal" + the hub name
    // (see layout.html), which makes deep pages verbose. Default behaviour:
    // pages more than 3 crumbs deep always start collapsed to "… › <recent
    // crumbs>" — hiding the root + hub behind the toggle even if the full
    // trail would fit — and trim further from the front if even that
    // overflows. Shallow pages (root + hub + current page) just show the
    // full trail, no toggle. One "…"/"‹" button (never a separate close
    // control) flips between the default tail view and the full, wrapped
    // trail. Crumb/sep nodes are cloned once up front so any view can be
    // rebuilt from scratch without losing markup (icons, hrefs, etc).
    document.querySelectorAll('nav.breadcrumbs').forEach(function (nav) {
        var nodes = Array.prototype.slice.call(nav.childNodes).filter(function (n) {
            return !(n.nodeType === 3 && !n.textContent.trim());
        }).map(function (n) { return n.cloneNode(true); });

        function isSep(node) {
            return node.nodeType === 1 && node.classList.contains('sep');
        }

        var crumbs = nodes.filter(function (n) { return !isSep(n); });
        var seps = nodes.filter(isSep);

        function makeToggle(expanded, onClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'crumb-toggle';
            btn.setAttribute('aria-label', expanded ? 'Show fewer breadcrumbs' : 'Show earlier breadcrumbs');
            btn.textContent = expanded ? '−' : '…';
            btn.addEventListener('click', onClick);
            return btn;
        }

        function renderInline() {
            nav.innerHTML = '';
            nav.classList.remove('breadcrumbs-expanded');
            crumbs.forEach(function (c, i) {
                if (i > 0) nav.appendChild(seps[i - 1].cloneNode(true));
                nav.appendChild(c.cloneNode(true));
            });
        }

        function renderExpanded() {
            nav.innerHTML = '';
            nav.classList.add('breadcrumbs-expanded');
            nav.appendChild(makeToggle(true, renderDefault));
            crumbs.forEach(function (c, i) {
                if (i > 0) nav.appendChild(seps[i - 1].cloneNode(true));
                nav.appendChild(c.cloneNode(true));
            });
        }

        function renderTail(startIndex) {
            nav.innerHTML = '';
            nav.classList.remove('breadcrumbs-expanded');
            nav.appendChild(makeToggle(false, renderExpanded));
            nav.appendChild(seps[0].cloneNode(true));
            for (var i = startIndex; i < crumbs.length; i++) {
                if (i > startIndex) nav.appendChild(seps[i - 1].cloneNode(true));
                nav.appendChild(crumbs[i].cloneNode(true));
            }
        }

        function fitsOneLine() {
            return nav.scrollWidth <= nav.clientWidth;
        }

        function renderDefault() {
            if (crumbs.length <= 3) {
                renderInline();
                return;
            }
            var startIndex = 2;
            renderTail(startIndex);
            requestAnimationFrame(function () {
                while (!fitsOneLine() && startIndex < crumbs.length - 1) {
                    startIndex++;
                    renderTail(startIndex);
                }
            });
        }

        renderDefault();

        var resizeTimer = null;
        window.addEventListener('resize', function () {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(renderDefault, 150);
        });
    });

    // SENCo contacts carousel (SEND & Provision hub home) — plain horizontal
    // scroll-snap container, arrows just nudge scrollLeft by one card width.
    document.querySelectorAll('.senco-carousel-wrap').forEach(function (wrap) {
        var track = wrap.querySelector('.senco-carousel');
        var prevBtn = wrap.querySelector('.senco-carousel-arrow--prev');
        var nextBtn = wrap.querySelector('.senco-carousel-arrow--next');
        if (!track || !prevBtn || !nextBtn) return;

        function step() {
            var card = track.querySelector('.senco-card');
            return card ? card.offsetWidth + 12 : track.clientWidth;
        }

        prevBtn.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
        nextBtn.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });

        function updateArrows() {
            var overflowing = track.scrollWidth > track.clientWidth + 1;
            prevBtn.hidden = !overflowing;
            nextBtn.hidden = !overflowing;
        }
        updateArrows();
        window.addEventListener('resize', updateArrows);
    });

    // Auto-enhance every plain select/date/time field already in the page on
    // load (server-rendered pages). AJAX-injected modal content (e.g.
    // hubs/inclusion/static/js/panel.js) isn't in the DOM yet at this point,
    // so it calls window.enhanceFormControls(dialog) itself after injecting.
    window.enhanceFormControls(document);
});

// Custom select / date / time controls — progressive enhancement over a native
// <select>/<input type=date>/<input type=time>: the native element stays in the
// DOM (visually hidden) as the real form field and the single source of truth,
// so `required`/`value`/`form.checkValidity()`/normal POST submission all keep
// working untouched. A custom trigger button + anchored popover (styled like
// .tab-row-more-menu/.side-nav option rows, see style.css) reads/writes that
// native element's value and fires a real `change` event on it whenever the
// user picks something, which is what any existing listener on the form
// reacts to. Top-level (not wrapped in DOMContentLoaded) so these are callable
// as soon as this script has executed, including from content injected later
// by AJAX-loaded modals (e.g. hubs/inclusion/static/js/panel.js).
(function () {
    function closeAllUiPopovers(except) {
        document.querySelectorAll('.ui-popover[open]').forEach(function (el) {
            if (el !== except) el.close();
        });
    }
    document.addEventListener('click', function (e) {
        if (e.target.closest('.ui-select, .ui-date, .ui-time')) return;
        closeAllUiPopovers();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        closeAllUiPopovers();
    });

    // Each popover is a modal <dialog>, which makes every OTHER trigger on
    // the page inert while it's open — so a click meant for a different
    // trigger never reaches it; it lands on the open popover's own
    // (transparent) backdrop instead, which just closes it. Once closed, the
    // rest of the page is no longer inert, so re-resolving the same screen
    // coordinates a tick later correctly finds the trigger the user actually
    // meant to click and clicks it for them — turning what would otherwise
    // be a "click to close, click again to open the other one" into one
    // click. Restricted to known trigger classes so an incidental click on
    // empty modal padding just closes the popover, without also forwarding
    // into (and accidentally triggering) the outer dialog's own
    // backdrop-click-to-close handler.
    function forwardClickThrough(x, y, ownTrigger) {
        requestAnimationFrame(function () {
            var el = document.elementFromPoint(x, y);
            var target = el && el.closest('.ui-select-trigger, .ui-date-calendar-btn, .ui-add-group-btn');
            // Don't re-click the trigger that just closed this very popover —
            // otherwise clicking anywhere over the trigger a second time
            // (which lands on the modal dialog's own transparent backdrop,
            // since the trigger is inert while its popover is open) would
            // immediately reopen what the user just closed.
            if (target && target !== ownTrigger) target.click();
        });
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    // Positions a popover with explicit position:fixed coordinates anchored to
    // the trigger's getBoundingClientRect(), flipping above when there isn't
    // room below and clamping horizontally to the viewport. position:fixed
    // (rather than position:absolute relative to an in-flow ancestor) is
    // deliberate: these popovers live inside a scrollable <dialog>
    // (hubs/inclusion/static/css/panel.css's max-height/overflow-y on
    // dialog.modal-dialog), and an absolutely-positioned descendant of a
    // scroll-clipping ancestor can render outside the modal's visible box
    // once flipped — fixed positioning anchors purely to the viewport and
    // sidesteps that clipping ambiguity entirely. Must run after the
    // popover's content is rendered and made visible (display:none elements
    // report 0 for offsetHeight/offsetWidth), otherwise there's nothing to
    // measure.
    function positionPopover(panel, anchorEl, opts) {
        opts = opts || {};
        panel.style.position = 'fixed';
        if (opts.matchWidth) panel.style.width = anchorEl.getBoundingClientRect().width + 'px';
        var rect = anchorEl.getBoundingClientRect();
        var panelHeight = panel.offsetHeight;
        var spaceBelow = window.innerHeight - rect.bottom;
        var spaceAbove = rect.top;
        var top = (spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow)
            ? rect.top - panelHeight - 4
            : rect.bottom + 4;
        var left = opts.alignRight ? rect.right - panel.offsetWidth : rect.left;
        var maxLeft = window.innerWidth - panel.offsetWidth - 8;
        left = Math.min(Math.max(8, left), Math.max(8, maxLeft));
        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
    }

    // How much wider than the widest option's own text the trigger should
    // be (room for its left/right padding + chevron) and the hard cap beyond
    // which a long option label just gets clipped instead of stretching the
    // control further.
    var SELECT_TRIGGER_PADDING = 48;
    var SELECT_TRIGGER_MAX_WIDTH = 240;
    var selectWidthGhost = null;
    function maxOptionTextWidth(selectEl, font) {
        if (!selectWidthGhost) {
            selectWidthGhost = document.createElement('span');
            selectWidthGhost.style.position = 'absolute';
            selectWidthGhost.style.visibility = 'hidden';
            selectWidthGhost.style.left = '-9999px';
            selectWidthGhost.style.whiteSpace = 'nowrap';
            document.body.appendChild(selectWidthGhost);
        }
        selectWidthGhost.style.font = font;
        var max = 0;
        Array.prototype.forEach.call(selectEl.options, function (opt) {
            selectWidthGhost.textContent = opt.textContent;
            max = Math.max(max, selectWidthGhost.offsetWidth);
        });
        return max;
    }

    window.enhanceSelect = function (selectEl) {
        if (!selectEl || selectEl._uiSelect) return;

        var wrap = document.createElement('span');
        wrap.className = 'ui-select';
        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-select-trigger';
        trigger.disabled = selectEl.disabled;
        // A <dialog> shown via showModal(), not a plain div with the
        // popover attribute: the popover API's coexistence with an
        // already-open modal <dialog> turned out to make this element inert
        // in practice (clicks/hover passed straight through to whatever was
        // behind it) — nested modal dialogs are a far more battle-tested
        // browser pattern for "must stay on top of, and interactive
        // alongside, an open dialog."
        var panel = document.createElement('dialog');
        panel.className = 'ui-select-panel ui-popover';

        selectEl.classList.add('ui-select-native');
        selectEl.parentNode.insertBefore(wrap, selectEl);
        wrap.appendChild(selectEl);
        wrap.appendChild(trigger);
        document.body.appendChild(panel);
        panel.addEventListener('click', function (e) {
            if (e.target !== panel) return;
            var x = e.clientX, y = e.clientY;
            panel.close();
            forwardClickThrough(x, y, trigger);
        });
        // Flips the trigger's chevron to point up while its popover is open,
        // regardless of which of the several ways (re-click, outside click,
        // Escape, picking an option) closed it — a single `close` listener on
        // the <dialog> covers all of them instead of repeating this at every
        // call site that can close the panel.
        panel.addEventListener('close', function () {
            trigger.classList.remove('open');
        });

        function currentLabel() {
            var opt = selectEl.options[selectEl.selectedIndex];
            return opt ? opt.textContent : '';
        }

        function render() {
            trigger.textContent = currentLabel();
            // Mirror the wrapped select's own classes (e.g. a value-driven
            // colour class set server-side) onto the visible trigger button,
            // since the native select itself is hidden.
            var isPriority = selectEl.classList.contains('priority-select');
            trigger.className = 'ui-select-trigger ' + Array.prototype.filter.call(
                selectEl.classList, function (c) { return c !== 'ui-select-native'; }
            ).join(' ') + (isPriority ? ' priority-' + selectEl.value : '');
            // Size the closed control to the widest option rather than
            // whichever one happens to be selected, so picking a short
            // option doesn't narrow the control (and its popover list,
            // which mirrors this width) down enough to clip longer options
            // next time it's opened.
            var widest = maxOptionTextWidth(selectEl, window.getComputedStyle(trigger).font);
            trigger.style.minWidth = Math.min(widest + SELECT_TRIGGER_PADDING, SELECT_TRIGGER_MAX_WIDTH) + 'px';
            panel.innerHTML = '';
            Array.prototype.forEach.call(selectEl.options, function (opt) {
                var row = document.createElement('div');
                row.className = 'ui-option' + (opt.selected ? ' selected' : '') + (opt.dataset.muted === '1' ? ' muted' : '') + (isPriority ? ' priority-' + opt.value : '');
                row.textContent = opt.textContent;
                row.dataset.value = opt.value;
                row.addEventListener('click', function () {
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    render();
                    closeAllUiPopovers();
                });
                panel.appendChild(row);
            });
        }

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = panel.open;
            closeAllUiPopovers(panel);
            if (isOpen) {
                panel.close();
            } else {
                panel.showModal();
                trigger.classList.add('open');
                positionPopover(panel, trigger, { matchWidth: true });
            }
        });

        trigger.addEventListener('keydown', function (e) {
            // Delete/Backspace clears back to a blank/placeholder option —
            // only for selects that actually have one (optional fields like
            // Default Chair/member staff/expertise). Required fields
            // (Day/Month/Year/Hour/Minute/Panel Group) never have a blank
            // `value=""` first option, so this guard naturally excludes them
            // with no per-field configuration needed.
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectEl.options.length && selectEl.options[0].value === '' && selectEl.selectedIndex !== 0) {
                    e.preventDefault();
                    selectEl.selectedIndex = 0;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    render();
                }
                return;
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (!panel.open) {
                // Matches native <select> behavior: arrow keys on a closed,
                // focused select cycle the value directly rather than
                // opening the list; Enter/Space still open it.
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    var delta = e.key === 'ArrowDown' ? 1 : -1;
                    var nextIdx = Math.min(selectEl.options.length - 1, Math.max(0, selectEl.selectedIndex + delta));
                    if (nextIdx !== selectEl.selectedIndex) {
                        selectEl.selectedIndex = nextIdx;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        render();
                    }
                    return;
                }
                closeAllUiPopovers(panel);
                panel.showModal();
                trigger.classList.add('open');
                positionPopover(panel, trigger, { matchWidth: true });
                return;
            }
            var rows = Array.prototype.slice.call(panel.querySelectorAll('.ui-option'));
            var current = panel.querySelector('.ui-option.highlighted') || panel.querySelector('.ui-option.selected');
            var idx = rows.indexOf(current);
            if (e.key === 'ArrowDown') idx = Math.min(rows.length - 1, idx + 1);
            else if (e.key === 'ArrowUp') idx = Math.max(0, idx - 1);
            else if (current) { current.click(); return; }
            rows.forEach(function (r) { r.classList.remove('highlighted'); });
            if (rows[idx]) {
                rows[idx].classList.add('highlighted');
                rows[idx].scrollIntoView({ block: 'nearest' });
            }
        });

        selectEl._uiSelect = { refresh: render };
        render();
    };

    var CALENDAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<rect x="4" y="5.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />'
        + '<path d="M4 9.5h16M8 3.5v3M16 3.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
        + '</svg>';
    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

    window.enhanceDateInput = function (inputEl, opts) {
        if (!inputEl || inputEl._uiDate) return;
        opts = opts || {};

        var wrap = document.createElement('span');
        wrap.className = 'ui-date';
        var fields = document.createElement('span');
        fields.className = 'ui-date-fields';
        var daySelect = document.createElement('select');
        var monthSelect = document.createElement('select');
        var yearSelect = document.createElement('select');
        var calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'ui-date-calendar-btn btn btn-sm';
        calBtn.innerHTML = CALENDAR_ICON_SVG;
        // A <dialog>, not a popover-attribute div — see the matching comment
        // in enhanceSelect() for why (nested modal dialogs are the
        // reliably-interactive way to stay on top of an open dialog).
        var calPanel = document.createElement('dialog');
        calPanel.className = 'ui-calendar-popover ui-popover';

        inputEl.classList.add('ui-select-native');
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);
        fields.appendChild(daySelect);
        fields.appendChild(monthSelect);
        fields.appendChild(yearSelect);
        wrap.appendChild(fields);
        wrap.appendChild(calBtn);
        document.body.appendChild(calPanel);
        calPanel.addEventListener('click', function (e) {
            if (e.target !== calPanel) return;
            var x = e.clientX, y = e.clientY;
            calPanel.close();
            forwardClickThrough(x, y, calBtn);
        });

        var today = new Date();
        var nowYear = today.getFullYear();
        var nowMonth = today.getMonth() + 1;

        for (var y = (opts.noPast ? nowYear : nowYear - 1); y <= nowYear + (opts.noPast ? 2 : 1); y++) {
            var yOpt = document.createElement('option');
            yOpt.value = y;
            yOpt.textContent = y;
            yearSelect.appendChild(yOpt);
        }

        // Only relevant when opts.noPast: the current year's month/day lists
        // start at the current month/day instead of January/1st, so a Panel
        // meeting can never be scheduled in the past. Any other (future)
        // year/month is unrestricted.
        function rebuildMonthOptions(selectedMonth) {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var minMonth = (opts.noPast && year === nowYear) ? nowMonth : 1;
            monthSelect.innerHTML = '';
            for (var m = minMonth; m <= 12; m++) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = MONTH_NAMES[m - 1];
                monthSelect.appendChild(opt);
            }
            monthSelect.value = Math.max(minMonth, Math.min(selectedMonth || minMonth, 12));
        }

        function rebuildDayOptions(selectedDay) {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var month = parseInt(monthSelect.value, 10) || 1;
            var max = daysInMonth(year, month);
            var min = (opts.noPast && year === nowYear && month === nowMonth) ? today.getDate() : 1;
            daySelect.innerHTML = '';
            for (var d = min; d <= max; d++) {
                var opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                daySelect.appendChild(opt);
            }
            daySelect.value = Math.max(min, Math.min(selectedDay || min, max));
        }

        function syncFromValue() {
            var parts = (inputEl.value || '').split('-');
            var year = parts.length === 3 ? parseInt(parts[0], 10) : nowYear;
            var month = parts.length === 3 ? parseInt(parts[1], 10) : nowMonth;
            var day = parts.length === 3 ? parseInt(parts[2], 10) : today.getDate();
            if (opts.noPast && year < nowYear) year = nowYear;
            if (!yearSelect.querySelector('option[value="' + year + '"]')) {
                var extra = document.createElement('option');
                extra.value = year; extra.textContent = year;
                yearSelect.insertBefore(extra, yearSelect.firstChild);
            }
            yearSelect.value = year;
            rebuildMonthOptions(month);
            rebuildDayOptions(day);
            [daySelect, monthSelect, yearSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
        }

        function commit() {
            var year = parseInt(yearSelect.value, 10);
            var month = parseInt(monthSelect.value, 10);
            var day = parseInt(daySelect.value, 10);
            inputEl.value = year + '-' + pad2(month) + '-' + pad2(day);
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        [daySelect, monthSelect, yearSelect].forEach(function (select) {
            select.addEventListener('change', function () {
                if (select === yearSelect) {
                    rebuildMonthOptions(parseInt(monthSelect.value, 10));
                    if (monthSelect._uiSelect) monthSelect._uiSelect.refresh();
                }
                if (select !== daySelect) {
                    rebuildDayOptions(parseInt(daySelect.value, 10));
                    if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                }
                commit();
                renderCalendar();
            });
            window.enhanceSelect(select);
            select.parentNode.classList.add('ui-select--sm');
        });

        function renderCalendar() {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var month = (parseInt(monthSelect.value, 10) || 1) - 1;
            calPanel.innerHTML = '';
            var header = document.createElement('div');
            header.className = 'ui-calendar-header';
            var prev = document.createElement('button');
            prev.type = 'button'; prev.className = 'btn btn-sm'; prev.textContent = '‹';
            prev.disabled = !!(opts.noPast && year === nowYear && (month + 1) === nowMonth);
            var label = document.createElement('span');
            label.textContent = MONTH_NAMES[month] + ' ' + year;
            var next = document.createElement('button');
            next.type = 'button'; next.className = 'btn btn-sm'; next.textContent = '›';
            prev.addEventListener('click', function (e) {
                e.stopPropagation();
                var d = new Date(year, month - 1, 1);
                if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
                yearSelect.value = d.getFullYear();
                rebuildMonthOptions(d.getMonth() + 1);
                rebuildDayOptions(parseInt(daySelect.value, 10));
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                renderCalendar();
            });
            next.addEventListener('click', function (e) {
                e.stopPropagation();
                var d = new Date(year, month + 1, 1);
                if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
                yearSelect.value = d.getFullYear();
                rebuildMonthOptions(d.getMonth() + 1);
                rebuildDayOptions(parseInt(daySelect.value, 10));
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                renderCalendar();
            });
            header.appendChild(prev); header.appendChild(label); header.appendChild(next);
            calPanel.appendChild(header);

            var grid = document.createElement('div');
            grid.className = 'ui-calendar-grid';
            ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) {
                var h = document.createElement('div');
                h.className = 'ui-calendar-dow';
                h.textContent = d;
                grid.appendChild(h);
            });

            var startOffset = new Date(year, month, 1).getDay();
            var max = daysInMonth(year, month + 1);
            var selected = inputEl.value;
            var todayStr = nowYear + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());

            for (var i = 0; i < startOffset; i++) grid.appendChild(document.createElement('div'));
            for (var day = 1; day <= max; day++) {
                var cellDate = year + '-' + pad2(month + 1) + '-' + pad2(day);
                var cell = document.createElement('div');
                cell.className = 'ui-calendar-day';
                if (cellDate === todayStr) cell.classList.add('is-today');
                if (cellDate === selected) cell.classList.add('is-selected');
                cell.textContent = day;
                if (opts.noPast && cellDate < todayStr) {
                    cell.classList.add('is-past');
                } else {
                    cell.addEventListener('click', function (d) {
                        return function (e) {
                            e.stopPropagation();
                            daySelect.value = d;
                            if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                            commit();
                            renderCalendar();
                            closeAllUiPopovers();
                        };
                    }(day));
                }
                grid.appendChild(cell);
            }
            calPanel.appendChild(grid);
        }

        function syncYearOption(year) {
            var extra = document.createElement('option');
            extra.value = year; extra.textContent = year;
            yearSelect.insertBefore(extra, yearSelect.firstChild);
        }

        calBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = calPanel.open;
            closeAllUiPopovers(calPanel);
            if (isOpen) {
                calPanel.close();
            } else {
                renderCalendar();
                calPanel.showModal();
                positionPopover(calPanel, calBtn, { alignRight: true });
            }
        });

        inputEl._uiDate = { refresh: syncFromValue };
        syncFromValue();
    };

    window.enhanceTimeInput = function (inputEl) {
        if (!inputEl || inputEl._uiTime) return;

        var wrap = document.createElement('span');
        wrap.className = 'ui-time';
        var fields = document.createElement('span');
        fields.className = 'ui-time-fields';
        var hourSelect = document.createElement('select');
        var minuteSelect = document.createElement('select');
        var ampmSelect = document.createElement('select');
        ['AM', 'PM'].forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label; opt.textContent = label;
            ampmSelect.appendChild(opt);
        });
        for (var m = 0; m < 60; m += 5) {
            var mOpt = document.createElement('option');
            mOpt.value = pad2(m); mOpt.textContent = pad2(m);
            minuteSelect.appendChild(mOpt);
        }
        inputEl.classList.add('ui-select-native');
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);
        fields.appendChild(hourSelect);
        fields.appendChild(minuteSelect);
        fields.appendChild(ampmSelect);
        wrap.appendChild(fields);

        // Time format (12h/24h) is a global Settings preference (data-time-format
        // on <html>, see templates/layout.html), not a per-field choice.
        var is12h = document.documentElement.getAttribute('data-time-format') === '12';

        // Hours outside the typical 08:00-17:00 school day are visually
        // muted in the dropdown (see applyHourMuting) since they're rarely
        // the right choice for a panel meeting. A 12h hour maps to two
        // different 24h hours depending on AM/PM, so both are stashed on
        // the option for applyHourMuting to resolve against the current
        // ampmSelect value.
        function rebuildHourOptions() {
            hourSelect.innerHTML = '';
            var max = is12h ? 12 : 23;
            var start = is12h ? 1 : 0;
            for (var h = start; h <= max; h++) {
                var opt = document.createElement('option');
                opt.value = pad2(h); opt.textContent = pad2(h);
                if (is12h) {
                    opt.dataset.hour24Am = h === 12 ? 0 : h;
                    opt.dataset.hour24Pm = h === 12 ? 12 : h + 12;
                } else {
                    opt.dataset.hour24 = h;
                }
                hourSelect.appendChild(opt);
            }
            applyHourMuting();
        }

        function applyHourMuting() {
            Array.prototype.forEach.call(hourSelect.options, function (opt) {
                var hour24 = is12h
                    ? parseInt(ampmSelect.value === 'PM' ? opt.dataset.hour24Pm : opt.dataset.hour24Am, 10)
                    : parseInt(opt.dataset.hour24, 10);
                if (hour24 < 8 || hour24 > 17) {
                    opt.dataset.muted = '1';
                } else {
                    delete opt.dataset.muted;
                }
            });
        }

        function syncFromValue() {
            var parts = (inputEl.value || '00:00').split(':');
            var hour24 = parseInt(parts[0], 10) || 0;
            var minute = parts[1] || '00';
            rebuildHourOptions();
            if (is12h) {
                var isPM = hour24 >= 12;
                var hour12 = hour24 % 12;
                if (hour12 === 0) hour12 = 12;
                hourSelect.value = pad2(hour12);
                ampmSelect.value = isPM ? 'PM' : 'AM';
            } else {
                hourSelect.value = pad2(hour24);
            }
            minuteSelect.value = minute;
            [hourSelect, minuteSelect, ampmSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
        }

        function commit() {
            var minute = minuteSelect.value;
            var hour24;
            if (is12h) {
                var hour12 = parseInt(hourSelect.value, 10);
                var isPM = ampmSelect.value === 'PM';
                hour24 = isPM ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
            } else {
                hour24 = parseInt(hourSelect.value, 10);
            }
            inputEl.value = pad2(hour24) + ':' + minute;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        [hourSelect, minuteSelect, ampmSelect].forEach(function (select) {
            select.addEventListener('change', commit);
            window.enhanceSelect(select);
            select.parentNode.classList.add('ui-select--sm');
        });
        // AM/PM alone (without a 12h/24h toggle) changes which 24h hour each
        // option represents, so re-resolve muting and refresh the hour
        // dropdown's rendered rows whenever it changes.
        ampmSelect.addEventListener('change', function () {
            applyHourMuting();
            if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
        });
        ampmSelect.parentNode.classList.toggle('ui-hidden', !is12h);

        inputEl._uiTime = { refresh: syncFromValue };
        syncFromValue();
        if (!inputEl.value) commit();
    };

    // Single entry point for enhancing every select/date/time field under a
    // given root — called for the whole document on page load, and again by
    // AJAX-loaded modals (e.g. panel.js) on the subtree they just injected, so
    // every dropdown in the app gets the same custom-styled treatment without
    // each call site needing to know which fields exist. A date field opts
    // into "no past dates" via `data-no-past` on the <input> rather than a JS
    // option, since this helper has no per-field config of its own.
    window.enhanceFormControls = function (root) {
        (root || document).querySelectorAll('select').forEach(window.enhanceSelect);
        (root || document).querySelectorAll('input[type="date"]').forEach(function (el) {
            window.enhanceDateInput(el, { noPast: el.hasAttribute('data-no-past') });
        });
        (root || document).querySelectorAll('input[type="time"]').forEach(window.enhanceTimeInput);
    };
})();
