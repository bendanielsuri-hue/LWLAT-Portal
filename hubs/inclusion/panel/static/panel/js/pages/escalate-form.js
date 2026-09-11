/* Escalate to MAT's own page behavior (#212 - moved out of escalate_form.html's
   inline <script>, ADR 0021). Toggles the freeform "Other" reason field. */
document.addEventListener('DOMContentLoaded', function () {
    var choiceField = document.getElementById('reason_choice');
    if (!choiceField) return; // already_escalated: the form isn't rendered at all
    var otherGroup = document.getElementById('reason-other-group');
    var otherField = document.getElementById('reason_other');
    function syncOtherVisibility() {
        var isOther = choiceField.value === '__other__';
        otherGroup.hidden = !isOther;
        otherField.required = isOther;
    }
    choiceField.addEventListener('change', syncOtherVisibility);
    syncOtherVisibility();
});
