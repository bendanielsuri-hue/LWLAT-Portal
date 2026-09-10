/* Filter-bar active state: the count badge and the per-field highlight.

   Promoted out of panel.js (#208, ADR 0020). It carries no domain vocabulary
   and never did - hubs/inclusion/hub.html was linking a 5,345-line SEND script
   for this one symbol.

   Still a window.* global rather than an ES module export, because its callers
   are inline <script> blocks in six templates. Those move to modules in #212,
   and this becomes a real export at that point; promoting the file and
   changing how it is called in the same step would mean six templates changing
   for two reasons at once.
*/

// Client-side filter bars (Students/Referrals/Actions) don't submit/reload —
// they filter .entity-rows in place — but should still get the same
// .filter-bar-label/.filter-bar-count active-count badge and
// .filter-field--active highlight as the server-side dashboard flavour
// (DES-L1, filter bar branch). Rather than duplicate that bookkeeping in
// each page's own inline <script>, wire it once here: pass the .filter-bar
// element, get back a refresh() to call from the page's own
// applyFilters()/clearFilters() whenever a control changes.
//
// A field counts as "active" when its control differs from its default
// (non-empty select, non-empty text input, or an "on" toggle-pill) — unless
// the field is marked [data-not-a-filter], for fields that merely feed
// another filter rather than constrain the list themselves (e.g. Actions'
// "Staff Assigned" identity picker, which only matters once "Assigned to Me"
// is toggled on).
window.wireFilterBarActiveState = function (filterBar) {
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
};
