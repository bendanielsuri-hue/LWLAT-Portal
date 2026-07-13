---
label: wayfinder:task
status: open
assignee: unclaimed
map: ../map.md
blocked_by: 001-review-panel-meetings.md
---

# Migrate Students page to the Meetings AJAX pattern

## Question

Convert the Students page from render-everything + client-side `display:none` filtering to Panel Meetings' server-side AJAX pattern (GET + `data-ajax-target` partial swap, `active_filter_count` computed server-side). No status field, so no tab-row (per [map](../map.md) decision) — dropdown/toggle filters only: Name Search, Year, Reg, Has Referrals, Overdue Actions.
