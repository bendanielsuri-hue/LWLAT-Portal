# Staff Hub — `hubs.staff`

Mounted at `/staff/`. Pages: Hub, Dashboard, Reports, My Timetable, Directory, Absence Request, Payslips, CPD & Training, Staff Calendar, Assessment Calendar, School Map.

## Data

Uses `core.models.Staff` for the directory view (queries active staff). All other views use hardcoded dicts — no ORM yet.

## Notable patterns

- `STAFF_MENU` — hub sidebar menu entries, each with `module_key` matching a URL name.
- `_hub_context(request)` — one-line wrapper over `core.hub_context.hub_context`, returning the module-gated `local_menu` (from `STAFF_MENU`) plus `hub_title` (`'Staff'`). Spread into every view's render context instead of retyped per view.
- No static files specific to this hub.
