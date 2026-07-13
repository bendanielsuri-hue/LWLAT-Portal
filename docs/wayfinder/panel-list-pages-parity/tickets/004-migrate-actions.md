---
label: wayfinder:task
status: open
assignee: unclaimed
map: ../map.md
blocked_by: 001-review-panel-meetings.md
---

# Migrate Actions page to the Meetings AJAX + tab-row pattern, unify identity

## Question

Convert the Actions page from client-side filtering to Panel Meetings' server-side AJAX pattern, add a status tab-row (per [map](../map.md) decision), and drop the page-local "who am I" picker (`me-select` + localStorage `inclusion-current-staff-id`) in favour of `core.identity.current_staff` for the "Assigned to Me" toggle. Existing filters to preserve: Name Search, Category, Assigned To, Status, Overdue Only, Due This Week.
