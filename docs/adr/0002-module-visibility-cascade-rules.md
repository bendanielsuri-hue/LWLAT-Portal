# Module visibility: hidden cascades to children, pilot never applies to aggregate views

The `Module` rollout table gates hub/page visibility across nav, home cards, search, and hub sidebars, with three states (`hidden`/`pilot`/`live`) and a `pilot_schools` M2M. Two rules govern resolution, both deliberate rather than obvious: (1) a `hidden` parent hides all its children regardless of the children's own status — a `live` leaf under a `hidden` hub still doesn't show, because releasing a hub happens one flip of the parent, not a sweep of every child; (2) `pilot` is visible only when the sidebar's school switcher is set to one of the module's specific `pilot_schools` — never for the `'all'`/`'primary'`/`'secondary'` aggregate views, because a pilot is deliberately scoped to named schools and an aggregate view would leak it to schools not in the pilot.

## Considered options

- **Independent status per module, no cascade**: rejected — would require flipping every child's status individually when un-releasing a hub, and risks a child accidentally left `live` under a hidden parent.
- **Pilot visible in aggregate views if any pilot school is in scope**: rejected — `'all'`/`'primary'`/`'secondary'` views are shared across schools not in the pilot; showing a pilot feature there would expose it beyond its intended audience, defeating the point of scoping `pilot_schools` at all.
