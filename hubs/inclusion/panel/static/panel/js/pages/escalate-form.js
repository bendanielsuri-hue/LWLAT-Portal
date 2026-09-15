/* Escalate to MAT's own page behavior (#212 - moved out of escalate_form.html's
   inline <script>, ADR 0021). The reason field's "Other" toggle used to live
   here in full; it is now the shared preset-reason component (#239), since the
   Panel Group modal's deactivate-member step asks the same question the same
   way. Nothing else on this page needs wiring, so this entry is just the call. */

import { initPresetReasonFields } from '../components/preset-reason-field.js';

document.addEventListener('DOMContentLoaded', function () {
    initPresetReasonFields(document);
});
