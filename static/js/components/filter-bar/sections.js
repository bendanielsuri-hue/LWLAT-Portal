/* Grouping a filter bar's fields under their section captions.

   Idempotent: it reuses groups built on a previous call rather than
   rebuilding them, because a rebuild would lose the fields' original DOM
   order and this runs on every mode change. */

/* Wraps each section's fields into the same .filter-group /
   .filter-group-fields pair desktop wide already builds (see
   setupFilterBarMoreFilters above), or unwraps them again.

   This is what makes a section behave as ONE unit: a group is a single
   flex item, so it packs onto a line beside its neighbours and wraps
   whole when it doesn't fit, instead of every caption forcing a full-
   width break regardless of how little sits under it (live feedback:
   "can we use all available space on a line. But if a section does not
   fit it start on new line"). Exactly the reasoning that put these
   wrappers in for narrow tablet in the first place.

   It also settles the caption's position for free. The wrappers let
   panel.css use flex-direction: column-reverse, desktop's own mechanism
   for "caption under its fields" - so the template keeps authoring the
   label first (which is the right reading order) and nothing has to move in
   the DOM. That replaces an earlier version of this function which reordered
   the elements by hand.

   Both directions are lossless: wrapping reads a label's fields as the
   siblings following it up to the next label, unwrapping puts label and
   fields back in that same flat order. So toggling repeatedly can't
   accumulate wrappers or drift the order.

   Top level, not inside the DOMContentLoaded sweep: setupFilterBarMoreFilters'
   own measure() has to re-run it after reclaiming every field, and that
   function is top level too. */
export function groupFilterSections(bar) {
    var inner = bar.querySelector('.filter-bar-collapsible-inner');
    if (!inner) return;
    // Every tier whose fields live in the tray, not two of them (#185). This
    // used to read phone-chrome-side || (mobile-mode && narrow-desktop),
    // which left true phone portrait - neither - unwrapping the groups again
    // to feed a 3-up chip grid that no longer exists. Both halves moved
    // together: panel.css's sections rules came out of @media (min-width:
    // 481px) in the same commit, since a rule that cannot match a 390px
    // viewport is what made phone portrait the odd one out in the first
    // place.
    // Still runs in both directions: at desktop width measure() reclaims
    // every field into the "View filters" panel instead, and a resize can
    // cross that boundary either way with the tray already open.
    var root = document.documentElement;
    var wantGroups = root.classList.contains('phone-chrome-side') ||
        root.classList.contains('filter-bar-mobile-mode');
    // The class panel.css keys the whole sections rule set on - "this box
    // renders the sections layout", the same statement measure() makes about
    // the panel's own track. Set on the HOST rather than per group, and
    // independently of whether any .filter-section-label actually exists:
    // Referrals/Actions/Meetings have no captions to group, but their fields
    // still need the field/label/trigger half of that rule set, exactly as
    // they get it from the panel at desktop width.
    inner.classList.toggle('filter-bar-sections', wantGroups);
    var existing = inner.querySelectorAll(':scope > .filter-group');
    if (!wantGroups) {
        Array.prototype.forEach.call(existing, function (group) {
            var label = group.querySelector(':scope > .filter-section-label');
            var fieldsBox = group.querySelector(':scope > .filter-group-fields');
            if (label) inner.insertBefore(label, group);
            if (fieldsBox) {
                while (fieldsBox.firstChild) inner.insertBefore(fieldsBox.firstChild, group);
            }
            group.remove();
        });
        return;
    }
    if (existing.length) return;
    Array.prototype.forEach.call(inner.querySelectorAll(':scope > .filter-section-label'), function (label) {
        var group = document.createElement('div');
        group.className = 'filter-group';
        var fieldsBox = document.createElement('div');
        fieldsBox.className = 'filter-group-fields';
        inner.insertBefore(group, label);
        group.appendChild(label);
        /* The FIELDS up to the next caption belong to this one - the run ends
           at anything that is not a .filter-field, not just at the next
           caption.

           It used to end only on a caption or an existing group, which meant
           the last category swallowed whatever else happened to follow the
           fields inside .filter-bar-collapsible-inner: the .filter-secondary-
           fields panel and the tray's own sticky footer are both siblings
           there. Nothing looked wrong until the next measure(), whose reclaim
           does fieldsHost.insertBefore(field, secondaryRow) - with secondaryRow
           now buried inside a .filter-group-fields box rather than being
           fieldsHost's own child, that throws NotFoundError and abandons
           measure() halfway: one line after it has hidden the "View filters"
           button, and several before the line that shows it again. Reported
           as: "if I resize desktop to small then big, the view filter button
           does not reappear".

           Read before any of it moves, since moving changes
           nextElementSibling. */
        var members = [];
        for (var el = group.nextElementSibling; el; el = el.nextElementSibling) {
            if (!el.classList.contains('filter-field')) break;
            members.push(el);
        }
        members.forEach(function (el) { fieldsBox.appendChild(el); });
        group.appendChild(fieldsBox);
    });
}
