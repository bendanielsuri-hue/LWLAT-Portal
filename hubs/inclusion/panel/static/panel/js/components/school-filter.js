/* Promoted out of panel.js (#211, ADR 0020) - the one domain helper among
   panel.js's original shared-helper region (Panel Group is SEND vocabulary;
   every other helper in that region was generic and moved to
   static/js/components/ instead).

   No longer installed on `window`: the one dialog that called it by that name
   imports it (dialogs/panel-group.js), and nothing else ever did. */

import { currentSchoolKey, isAggregateSchoolKey } from '../../../js/layout/school-key.js';

// Resolves which school's Panel Groups should be shown, without a page-local
// School dropdown: the sidebar's School switcher is the source of truth, read
// from the cookie the server itself reads (#196) - so the id this returns and
// the scoping the server applied to the rows on the page are the same
// selection, not two representations of it that can drift.
//
// "All Schools"/"All Primary"/"All Secondary" explicitly mean "no filter".
// Only a browser that has never used the switcher at all falls back to the
// current identity's own school; that is a preselect for a create form, and
// the server treats the same state as "all", so nothing on the page contradicts
// it.
export function resolvePanelSchoolFilter(currentStaffSchoolId) {
    var key = currentSchoolKey();
    if (!key) return currentStaffSchoolId || '';
    return isAggregateSchoolKey(key) ? '' : key;
}
