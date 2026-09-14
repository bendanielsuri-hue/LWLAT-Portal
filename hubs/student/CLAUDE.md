# Student Hub — `hubs.student`

Mounted at `/student/`. Pages: Hub, Dashboard, Profile, Progress Tracker, Standards & Equipment, Pastoral Tracker, Feedback Dashboard.

## Data

Uses `core.models.Student` for the profile view (selects the first active student as a placeholder — no login/session to identify the viewer yet). All other views use hardcoded dicts.

## Notable patterns

- `STUDENT_MENU` — hub sidebar menu entries with `module_key` per entry.
- `_hub_context(request)` — one-line wrapper over `core.hub_context.hub_context`, returning the module-gated `local_menu` (from `STUDENT_MENU`) plus `hub_title` (`'Student'`). Spread into every view's render context instead of retyped per view.
- No static files specific to this hub.
