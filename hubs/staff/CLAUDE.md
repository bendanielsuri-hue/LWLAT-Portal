# Staff Hub — `hubs.staff`

Mounted at `/staff/`. Pages: Hub, Dashboard, Reports, My Timetable, Directory, Absence Request, Payslips, CPD & Training, Staff Calendar, Assessment Calendar, School Map.

## Data

Uses `core.models.Staff` for the directory view (queries active staff). All other views use hardcoded dicts — no ORM yet.

## Notable patterns

- `STAFF_MENU` — hub sidebar menu entries, each with `module_key` matching a URL name.
- `_local_menu(request)` — standard `filter_by_module(STAFF_MENU, module_map(), request)` helper.
- `_hub_context(request)` — `{'local_menu': _local_menu(request), 'hub_title': 'Staff'}`, spread into every view's render context instead of retyped per view.
- No static files specific to this hub.
