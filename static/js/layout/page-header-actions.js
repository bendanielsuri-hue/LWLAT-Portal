/* Page-header actions (the {% block page_extras %} buttons/links beside the
   page title, e.g. "Add Referral") crowd the title on narrow screens. Below
   the existing 900px sidebar-collapse breakpoint, folds them into an
   "Actions ▾" dropdown reusing the same .tab-row-more* look as
   setupOverflowTabs (components/tabs.js, once that promotes). The real nodes
   are moved (not cloned) so any click handlers/data attributes on them keep
   working.

   Layout tier: one page header per page, part of layout.html's own chrome. */

// Page-header actions (the {% block page_extras %} buttons/links beside
// the page title, e.g. "Add Referral") crowd the title on narrow
// screens. Below the existing 900px sidebar-collapse breakpoint, fold
// them into an "Actions ▾" dropdown reusing the same .tab-row-more*
// look as setupOverflowTabs() above. The real nodes are moved (not
// cloned) so any click handlers/data attributes on them keep working.
export function initPageHeaderActions() {
    var mq = window.matchMedia('(max-width: 900px)');

    function collectActionItems(extras) {
        var items = [];
        Array.prototype.forEach.call(extras.children, function (el) {
            if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                items.push(el);
            } else if (el.classList.contains('key-actions')) {
                Array.prototype.forEach.call(el.children, function (child) {
                    if (child.tagName === 'A' || child.tagName === 'BUTTON') items.push(child);
                });
            }
        });
        return items;
    }

    document.querySelectorAll('.page-header-extras').forEach(function (extras) {
        var items = collectActionItems(extras);
        if (!items.length) return;

        items.forEach(function (item) {
            item._homeParent = item.parentElement;
            item._homeNext = item.nextSibling;
        });

        var moreWrap = document.createElement('div');
        moreWrap.className = 'tab-row-more hidden';
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'tab-row-more-btn';
        moreBtn.textContent = 'Actions ▾';
        var menu = document.createElement('div');
        menu.className = 'tab-row-more-menu hidden';
        moreWrap.appendChild(moreBtn);
        moreWrap.appendChild(menu);
        extras.appendChild(moreWrap);

        moreBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
        document.addEventListener('click', function () { menu.classList.add('hidden'); });

        function collapse() {
            items.forEach(function (item) { menu.appendChild(item); });
            moreWrap.classList.remove('hidden');
        }
        function expand() {
            items.slice().reverse().forEach(function (item) {
                item._homeParent.insertBefore(item, item._homeNext);
            });
            moreWrap.classList.add('hidden');
            menu.classList.add('hidden');
        }

        function sync() {
            if (mq.matches) collapse(); else expand();
        }
        sync();
        mq.addEventListener('change', sync);
    });
}
