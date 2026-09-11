/* Filter-bar active state: the count badge and the per-field highlight. */

// Client-side filter bars don't submit or reload - they filter .entity-rows
// in place - but should still get the same .filter-bar-count badge and
// .filter-field--active highlight as the server-side flavour (DES-L1, filter
// bar branch). Wired once here rather than duplicated into each page's inline
// <script>: pass the .filter-bar element, get back a refresh() to call on
// every relevant field's own `change` (each page's own call sites name it
// refreshFilterBarState - see hubs/inclusion/panel/CLAUDE.md).
//
// A field counts as "active" when its control differs from its default (a
// non-empty select, a non-empty text input, or an "on" toggle-pill) - unless
// marked [data-not-a-filter], for fields that feed another filter rather than
// constrain the list themselves (an identity picker that only matters once an
// "Assigned to Me" toggle is on).
export function wireFilterBarActiveState(filterBar) {
    if (!filterBar) return function () { };
    var badge = filterBar.querySelector('.filter-bar-count');
    var fields = Array.prototype.slice.call(filterBar.querySelectorAll('.filter-field')).filter(function (field) {
        return !field.hasAttribute('data-not-a-filter') && !field.querySelector('.filter-bar-clear');
    });

    function isActive(field) {
        var select = field.querySelector('select');
        if (select) return select.value !== '';
        var input = field.querySelector('input[type=text], input[type=search]');
        if (input) return input.value.trim() !== '';
        var toggle = field.querySelector('.toggle-pill');
        if (toggle) return toggle.classList.contains('on');
        return false;
    }

    function refresh() {
        var count = 0;
        fields.forEach(function (field) {
            var active = isActive(field);
            field.classList.toggle('filter-field--active', active);
            if (active) count++;
        });
        if (badge) {
            badge.textContent = count;
            badge.classList.toggle('filter-bar-count--empty', count === 0);
        }
    }

    refresh();
    return refresh;
}
