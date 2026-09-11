/* Single entry point for enhancing every select/date/time field under a
   given root - called for the whole document on page load, and again by
   AJAX-loaded modals (e.g. panel.js) on the subtree they just injected, so
   every dropdown in the app gets the same custom-styled treatment without
   each call site needing to know which fields exist. A date field opts into
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
