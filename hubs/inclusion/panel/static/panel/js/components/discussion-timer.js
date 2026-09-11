/* Ticks every live discussion/meeting elapsed-time display on the page
   (#212). Domain-named selector (.discussion-timer is Panel vocabulary,
   components/discussion.css) is why this lives in panel/js/components rather
   than a portal-generic one - the two call sites (meeting-agenda.js's
   #panel-timer, discussion.js's #discussion-timer) used to carry their own
   near-identical copy of this loop each. */
export function initDiscussionTimers() {
    document.querySelectorAll('.discussion-timer[data-started-at]').forEach(function (timerEl) {
        var startedAt = new Date(timerEl.dataset.startedAt).getTime();
        function pad(n) { return String(n).padStart(2, '0'); }
        function tick() {
            var elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            var h = Math.floor(elapsed / 3600);
            var m = Math.floor((elapsed % 3600) / 60);
            var s = elapsed % 60;
            timerEl.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
        }
        tick();
        setInterval(tick, 1000);
    });
}
