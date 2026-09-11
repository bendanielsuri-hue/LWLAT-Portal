/* Promoted out of panel.js (#211, ADR 0020) - generic status-filter-tab
   entering/leaving and count-delta pulsing, no SEND vocabulary in it.

   Still also set on `window`, same reason as components/modal.js: panel.js's
   own dialogs are classic-script code and call these by that name from
   inside event handlers, so the window assignment keeps them working until
   those dialogs are migrated to import this directly. */

// A tab at count 0 stays in the DOM (collapsed to zero width via panel.css's
// .tab-collapsed), rather than being added/removed outright, so this can
// transition it instead of it snapping in/out. `collapsed` is the target
// state; a no-op if the button's already there.
export function setTabCollapsed(btn, collapsed) {
    if (!btn) return;
    var isCollapsed = btn.classList.contains('tab-collapsed');
    if (isCollapsed === collapsed) return;
    btn.classList.add('tab-visibility-animating');
    if (collapsed) {
        btn.classList.add('tab-collapsed');
        btn.setAttribute('tabindex', '-1');
    } else {
        btn.classList.remove('tab-collapsed');
        btn.removeAttribute('tabindex');
    }
    setTimeout(function () {
        btn.classList.remove('tab-visibility-animating');
    }, 280);
}

// `direction` is 'up' or 'down'. Restarts the animation even if it's already
// mid-flight (e.g. two quick status changes) by removing both classes and
// forcing a reflow before re-adding one. `el` can be a tab's own .count span
// or a card/section heading's count element - the animation itself doesn't
// care which.
export function pulseCount(el, direction) {
    if (!el) return;
    el.classList.remove('count-pulse-up', 'count-pulse-down');
    void el.offsetWidth;
    el.classList.add(direction === 'up' ? 'count-pulse-up' : 'count-pulse-down');
}

// Recomputes a set of tab-row button counts (and, optionally, a card
// heading's total) purely from currently-rendered DOM rows - no server
// round-trip. Right for a plain client-side change like a row being deleted
// (the remaining rows' own data attributes are already correct, nothing
// server-derived needs recomputing) - contrast with a status change whose
// derived fields (e.g. an action's is_overdue) genuinely need the server's
// answer, which goes through a fragment refresh instead (see home.html's
// refreshMyActionsCard for that shape).
//
// `matchers` is a { tabKey: function(row) { return bool; } } map, same shape
// as each page's own actionMatchers/referralMatchers. `keyAttr` is the
// dataset property holding each button's tab key (e.g. 'referralTab').
export function recountTabsFromRows(tabRowEl, rows, matchers, keyAttr, headingCountEl) {
    var rowList = Array.prototype.slice.call(rows);
    if (tabRowEl) {
        tabRowEl.querySelectorAll('[data-count]').forEach(function (btn) {
            var key = btn.dataset[keyAttr];
            var matcher = matchers[key];
            if (!matcher) return;
            var newCount = rowList.filter(matcher).length;
            var oldCount = parseInt(btn.dataset.count, 10) || 0;
            if (newCount === oldCount) return;
            btn.dataset.count = String(newCount);
            var countEl = btn.querySelector('.count');
            if (countEl) {
                countEl.textContent = '(' + newCount + ')';
                if (!btn.classList.contains('tab-collapsed')) pulseCount(countEl, newCount > oldCount ? 'up' : 'down');
            }
            setTabCollapsed(btn, newCount === 0);
        });
    }
    if (headingCountEl) {
        var total = rowList.length;
        var oldTotal = parseInt(headingCountEl.dataset.count, 10) || total;
        if (total !== oldTotal) {
            headingCountEl.dataset.count = String(total);
            headingCountEl.textContent = '(' + total + ')';
            pulseCount(headingCountEl, total > oldTotal ? 'up' : 'down');
        }
    }
}

window.setTabCollapsed = setTabCollapsed;
window.pulseCount = pulseCount;
window.recountTabsFromRows = recountTabsFromRows;
