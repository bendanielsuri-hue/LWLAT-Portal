/* Generic footer status slot + shared JS API (#128, #212 - moved out of
   layout.html's inline <script>, ADR 0021). Any page's JS can call
   window.AppStatus.show('Saving…')/success('Saved')/error('Failed to save')
   to surface transient async state, rather than each feature building its
   own one-off indicator - kept on window (not a real export) because
   callers across hub-owned, non-module code (and modules alike) reach it by
   that global name. */
export function initAppStatus() {
    var statusEl = document.getElementById('footer-status');
    if (!statusEl) return;
    var statusTimer = null;
    function showStatus(text, kind) {
        clearTimeout(statusTimer);
        statusEl.textContent = text;
        statusEl.hidden = false;
        statusEl.className = 'footer-item footer-status' + (kind ? ' footer-status--' + kind : '');
        if (kind === 'success' || kind === 'error') {
            statusTimer = setTimeout(function () { statusEl.hidden = true; }, 4000);
        }
    }
    window.AppStatus = {
        show: function (text) { showStatus(text, 'pending'); },
        success: function (text) { showStatus(text || 'Saved', 'success'); },
        error: function (text) { showStatus(text || 'Something went wrong', 'error'); },
        clear: function () { clearTimeout(statusTimer); statusEl.hidden = true; },
    };
}
