# Student Hub — `hubs.student`

Mounted at `/student/`. Pages: Hub, Dashboard, Profile, Progress Tracker, Standards & Equipment, Pastoral Tracker, Feedback Dashboard.

## Data

Uses `core.models.Student` for the profile view (selects the first active student as a placeholder — no login/session to identify the viewer yet). All other views use hardcoded dicts.

## Notable patterns

- `STUDENT_MENU` — hub sidebar menu entries with `module_key` per entry.
- `_local_menu(request)` — standard `filter_by_module` helper.
- `_hub_context(request)` — `{'local_menu': _local_menu(request), 'hub_title': 'Student'}`, spread into every view's render context.
- No static files specific to this hub.
