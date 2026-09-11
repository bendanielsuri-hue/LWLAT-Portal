/* Promoted out of panel.js (#211, ADR 0020) - the one domain helper among
   panel.js's original shared-helper region (Panel Group is SEND vocabulary;
   every other helper in that region was generic and moved to
   static/js/components/ instead).

   Still also set on `window`, same reason as components/modal.js
   (static/js/): panel.js's own dialogs call this by that name from inside
   event handlers, so the window assignment keeps them working until those
   dialogs are migrated to import this directly. */

// Resolves which school's Panel Groups should be shown, without a page-local
// School dropdown: the sidebar's School switcher (localStorage 'pref-school',
// a school name — set by main.js) is the source of truth once it has run.
// "All Schools"/"All Primary"/"All Secondary" explicitly mean "no filter" —
// only a genuinely-unset pref-school (shouldn't normally happen) falls back
// to the current identity's own school.
export function resolvePanelSchoolFilter(groupOptions, currentStaffSchoolId) {
    var prefSchool;
    try { prefSchool = localStorage.getItem('pref-school'); } catch (e) { }
    if (!prefSchool) return currentStaffSchoolId || '';
    if (prefSchool.indexOf('All ') === 0) return '';
    var match = groupOptions.filter(function (opt) { return opt.dataset.schoolName === prefSchool; })[0];
    return match ? match.dataset.school : (currentStaffSchoolId || '');
}

window.resolvePanelSchoolFilter = resolvePanelSchoolFilter;
