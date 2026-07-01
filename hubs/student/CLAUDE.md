# Student Hub — `hubs.student`

Mounted at `/student/`. Pages: Hub, Dashboard, Profile, Progress Tracker, Standards & Equipment, Pastoral Tracker, Feedback Dashboard.

## Data

Uses `core.models.Student` for the profile view (selects the first active student as a placeholder — no login/session to identify the viewer yet). All other views use hardcoded dicts.

## Notable patterns

- `STUDENT_MENU` — hub sidebar menu entries with `module_key` per entry.
- `_local_menu(request)` — standard `filter_by_module` helper.
- No static files specific to this hub.
