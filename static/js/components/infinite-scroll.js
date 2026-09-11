/* Infinite scroll for a paginated list, promoted out of panel.js (#210,
   ADR 0020).

   Took a container id and looked the element up itself; it takes the element
   now. Every caller already had it, and an id parameter is a page's own
   vocabulary reaching into a module that has none - the same seam
   LIST_ROOT_SELECTOR was.
*/

// Infinite scroll for a paginated .entity-list, generic across every page
// built on the Students pattern (Students originally, #134 follow-up - now
// also Referrals/Actions/Meetings). Server renders PAGE_SIZE rows per page;
// .list-load-sentinel (the page's own _<name>_rows.html partial) marks the
// bottom of whatever's currently rendered, carrying the next page's URL. An
// IntersectionObserver (rootMargin fires the fetch before the sentinel is
// actually on screen, so the next batch is usually already in by the time
// the user scrolls to where it was) fetches that URL the same AJAX way
// setupAjaxFilterBars does - X-Requested-With header - and splices the
// response in directly before the sentinel, then removes it; the response's
// own trailing sentinel (if that page also has a further next one) becomes
// the new observation target automatically, since it arrives as part of the
// same fetched fragment. A MutationObserver re-finds the current sentinel
// after every DOM change to this container - covers both this function's
// own splice-and-remove above AND a filter change (setupAjaxFilterBars
// replaces the whole container's innerHTML wholesale, resetting back to
// page 1's own sentinel or none at all). Each successful load also
// replaceState()s the URL's ?page= to match, so a refresh mid-scroll
// re-renders every row up to that point (see _paginate_for_infinite_scroll,
// views.py) instead of snapping back to page 1.
export function wireListInfiniteScroll(container) {
    if (!container || typeof IntersectionObserver === 'undefined') return;
    var io = null;
    var loading = false;
    function observeSentinel() {
        if (io) io.disconnect();
        var sentinel = container.querySelector('.list-load-sentinel');
        if (!sentinel) return;
        io = new IntersectionObserver(function (entries) {
            if (loading) return;
            var visible = entries.some(function (entry) { return entry.isIntersecting; });
            if (visible) loadMore(sentinel);
        }, { rootMargin: '400px' });
        io.observe(sentinel);
    }
    function loadMore(sentinel) {
        var url = sentinel.dataset.nextPageUrl;
        if (!url) return;
        loading = true;
        if (io) io.disconnect();
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) {
                if (!res.ok) throw new Error('Request failed: ' + res.status);
                return res.text();
            })
            .then(function (html) {
                sentinel.insertAdjacentHTML('beforebegin', html);
                sentinel.remove();
                loading = false;
                // Keeps the URL's ?page= in step with how far the visitor has
                // actually scrolled (same history.replaceState convention as
                // setupAjaxFilterBars in main.js), so a refresh lands the
                // matching view.py pagination branch (see
                // _paginate_for_infinite_scroll) instead of silently
                // dropping every row loaded past page 1.
                history.replaceState(null, '', url);
                observeSentinel();
            })
            .catch(function () {
                loading = false;
                observeSentinel();
            });
    }
    observeSentinel();
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(observeSentinel).observe(container, { childList: true, subtree: true });
    }
}
