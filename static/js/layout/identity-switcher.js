/* The sidebar's "Select School" and "current user" switchers.

   Layout tier: one of each per page, both part of layout.html's own chrome.

   NO LOGIN SYSTEM EXISTS - "who am I" and "which school am I looking at" are
   remembered per-browser in a cookie, and the server-side fallback lives in
   core.identity. Both switchers deliberately reload rather than patching the
   DOM: the choice changes what the SERVER renders (the sidebar label, the
   school-filtered staff list, the default identity), so re-rendering is both
   simpler and the only way to keep those three consistent with each other. */

/* Shared by both switchers: persist a chosen value to a cookie and reload. */
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

/* School switcher: persists the selected school so the server can filter the
   identity dropdown and pick a sensible default identity. */
export function initSchoolSwitcher() {
    var options = Array.prototype.slice.call(document.querySelectorAll('.school-nav-option[data-key]'));
    if (!options.length) return;
    setupCookieSwitcher(options, 'current_school_key', 'key', function (opt) {
        // Mirrors the selection for hubs/inclusion/templates/hubs/inclusion/panel/meeting_setup.html,
        // which still reads this localStorage key to default its own school filter.
        try { localStorage.setItem('pref-school', opt.dataset.school); } catch (e) { }
    });
}

/* Current-user identity switcher: a full overlay nav (like "Select School"),
   opened via the sidebar's user row. */
export function initIdentitySwitcher() {
    var options = Array.prototype.slice.call(document.querySelectorAll('.staff-nav-option[data-staff-id]'));
    if (!options.length) return;
    setupCookieSwitcher(options, 'current_staff_id', 'staffId');
}

/* Identity search: filters the (already server-filtered-by-school) staff list
   in the staff overlay by typed name, client-side only. */
export function initIdentitySearch() {
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
}
