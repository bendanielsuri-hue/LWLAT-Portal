/* Shared by every surface that can change an Action's status (#235): Actions
   list row, Home's My Actions card, Discussion's inline row, Referral
   Details' Actions section. Marking an action Not Required is the one
   transition nobody can reconstruct later - a one-line "what happened?" box
   is offered right there, inline, before the change is saved. Optional and
   skippable, and never shown for any other transition - callers only invoke
   this when the newly-picked status is 'not_needed' and the action wasn't
   already Not Required.

   Kept as one module rather than four copies so the same Cancel/Skip/Save
   behaviour (and the "don't leave the row half-changed" guarantee) can't
   drift between surfaces that otherwise submit their status change in
   completely different ways (a real form post, a fetch-and-replace-the-row,
   a fetch-and-replace-the-whole-dialog). */

export function showNotRequiredPrompt(anchorEl, options) {
    var onResolve = options.onResolve;
    var onCancel = options.onCancel;

    var wrap = document.createElement('div');
    wrap.className = 'action-not-required-prompt';
    wrap.innerHTML =
        '<label class="ui-fused-field-label">What happened? (optional)</label>' +
        '<textarea rows="2" data-not-required-note></textarea>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn btn-sm" data-not-required-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-sm" data-not-required-skip>Skip</button>' +
        '<button type="button" class="btn btn-add btn-sm" data-not-required-save>Save</button>' +
        '</div>';
    anchorEl.insertAdjacentElement('afterend', wrap);

    var textarea = wrap.querySelector('[data-not-required-note]');
    textarea.focus();

    function cleanup() {
        wrap.remove();
    }

    wrap.querySelector('[data-not-required-cancel]').addEventListener('click', function () {
        cleanup();
        if (onCancel) onCancel();
    });
    wrap.querySelector('[data-not-required-skip]').addEventListener('click', function () {
        cleanup();
        onResolve('');
    });
    wrap.querySelector('[data-not-required-save]').addEventListener('click', function () {
        var note = textarea.value.trim();
        cleanup();
        onResolve(note);
    });

    return wrap;
}
