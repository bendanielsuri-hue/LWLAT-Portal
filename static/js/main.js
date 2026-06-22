document.addEventListener('DOMContentLoaded', function () {
    function closest(el, selector) {
        while (el) {
            if (el.matches && el.matches(selector)) return el;
            el = el.parentElement;
        }
        return null;
    }

    // Generic overlay nav handling: "Change Hub", "Change School" and "Settings" are all
    // fixed-position panels (.overlay-nav) that slide in from the left and sit ON TOP of
    // the regular hub sidebar (same position/width, higher z-index) rather than replacing
    // it — so opening one never reflows the page's main content.
    function openOverlay(navEl) {
        if (!navEl) return;
        document.querySelectorAll('.overlay-nav.open').forEach(function (other) {
            if (other !== navEl) closeOverlay(other);
        });
        navEl.classList.add('open');
        addBackdrop(function () { closeOverlay(navEl); });
    }
    function closeOverlay(navEl) {
        if (!navEl) return;
        navEl.classList.remove('open');
        removeBackdrop();
    }

    document.querySelectorAll('[data-overlay-target]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var navEl = document.querySelector(btn.dataset.overlayTarget);
            if (!navEl) return;
            if (navEl.classList.contains('open')) closeOverlay(navEl); else openOverlay(navEl);
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

    function addBackdrop(onClick) {
        var existing = document.querySelector('.global-backdrop');
        if (existing) { existing.classList.add('active'); return; }
        var d = document.createElement('div');
        d.className = 'global-backdrop';
        d.addEventListener('click', function () {
            if (typeof onClick === 'function') onClick();
        });
        document.body.appendChild(d);
        // allow CSS transition to animate in
        window.setTimeout(function () { d.classList.add('active'); }, 10);
    }

    function removeBackdrop() {
        var existing = document.querySelector('.global-backdrop');
        if (!existing) return;
        existing.classList.remove('active');
        // remove after fade out transition
        setTimeout(function () { if (existing.parentNode) existing.parentNode.removeChild(existing); }, 380);
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

        var colourNames = {
            purple: 'Royal Purple',
            indigo: 'Midnight Indigo',
            blue: 'Ocean Blue',
            teal: 'Deep Teal',
            green: 'Forest Green',
            yellow: 'Golden Yellow',
            orange: 'Sunset Orange',
            burnt: 'Burnt Red',
            red: 'Cherry Red',
            pink: 'Blossom Pink'
        };

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

        setupButtonGroup('pref-color', 'data-color', 'pref-color', 'purple', function (value) {
            var label = document.getElementById('pref-color-current');
            if (label) label.textContent = colourNames[value] || value;
        });

        setupButtonGroup('pref-text-size', 'data-text-size', 'pref-text-size', 'md');

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

    // School preference: presentation-only (no School model exists yet) — persists the
    // chosen school name to localStorage, same as the theme prefs, and keeps every
    // "current school" label (the sidebar trigger button) and the Change School overlay
    // list in sync wherever they appear on the page.
    (function setupSchoolPreference() {
        var options = Array.prototype.slice.call(document.querySelectorAll('.school-nav-option[data-school]'));
        if (!options.length) return;
        var labels = Array.prototype.slice.call(document.querySelectorAll('.school-current-label'));

        function applySchool(school) {
            labels.forEach(function (el) { el.textContent = school; });
            options.forEach(function (opt) {
                opt.classList.toggle('selected', opt.dataset.school === school);
            });
        }

        var current;
        try { current = localStorage.getItem('pref-school'); } catch (e) { }
        if (!current || !options.some(function (opt) { return opt.dataset.school === current; })) {
            current = options[0].dataset.school;
        }
        applySchool(current);

        options.forEach(function (opt) {
            opt.addEventListener('click', function () {
                var school = opt.dataset.school;
                try { localStorage.setItem('pref-school', school); } catch (e) { }
                applySchool(school);
                closeOverlay(closest(opt, '.overlay-nav'));
            });
        });
    })();

    // App search: client-side typeahead over every hub/page link, built from the JSON
    // embedded sitewide via {{ search_items|json_script }} in layout.html. Used both by
    // the home screen's own search box and the one inside the "Change Hub" overlay.
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
                    name.textContent = item.name;
                    row.appendChild(name);

                    var hub = document.createElement('span');
                    hub.className = 'app-search-result-hub';
                    hub.textContent = item.hub;
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
    setupAppSearch('nav-app-search-input', 'nav-app-search-results', 'app-search-data');

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
});
