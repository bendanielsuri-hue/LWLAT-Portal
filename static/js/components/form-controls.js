/* Single entry point for enhancing every select/date/time field under a
   given root - called for the whole document once at boot (main.js), and
   again by every AJAX-loaded dialog (e.g. hubs/inclusion/panel/static/
   panel/js/dialogs/*.js) on the subtree it just injected, since that
   content isn't in the DOM yet when the boot-time sweep runs. So every
   dropdown in the app gets the same custom-styled treatment without each
   call site needing to know which fields exist. A date field opts into
   "no past dates" via data-no-past on the <input> rather than a JS option,
   since this helper has no per-field config of its own. */

import { enhanceSelect } from './select.js';
import { enhanceDateInput } from './date-input.js';
import { enhanceTimeInput } from './time-input.js';
import { initFusedFieldStacking } from './fused-field.js';

export const enhanceFormControls = function (root) {
    (root || document).querySelectorAll('select').forEach(enhanceSelect);
    (root || document).querySelectorAll('input[type="date"]').forEach(function (el) {
        enhanceDateInput(el, { noPast: el.hasAttribute('data-no-past') });
    });
    (root || document).querySelectorAll('input[type="time"]').forEach(enhanceTimeInput);
    initFusedFieldStacking(root);
};
