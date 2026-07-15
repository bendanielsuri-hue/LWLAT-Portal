# Inclusion Panel App — `hubs.inclusion.panel`

Nested Django app at `hubs/inclusion/panel/`. Mounted via `hubs/inclusion/urls.py` at `/inclusion/panel/`. App label: `panel`.

See [CONTEXT.md](CONTEXT.md) for the domain glossary (Referral vs PanelReferral, Panel vs PanelGroup, discussion stages, etc.), [DesignLanguage.md](DesignLanguage.md) for Panel-specific visual patterns (status pill modifiers, meeting-card anatomy), and [InteractionLanguage.md](InteractionLanguage.md) for Panel-specific motion/JS implementation — portal-wide design/interaction rules live at the repo root.

All DB tables keep their original `inclusion_*` names (set via `Meta.db_table` on every model) so no data migration was needed when the app was extracted.

## Models (`models.py`)

**Referral lifecycle:**
- `ReferralCategory` / `ReferralQuestion` / `ReferralResponse` — questionnaire structure and answers
- `Referral` — one referral per student (`status`: open / assigned / discussing / review_scheduled / awaiting_review / overdue_review / closed, aggregated by `_sync_referral_status`. `assigned`/`discussing` = genuinely on a panel's live agenda right now (same words as `_panel_referral_stage`'s stage_key). The other three cover "discussed before, follow-up due, not on any current agenda" tiered by days until the follow-up's due date: `review_scheduled` (>7 days away), `awaiting_review` (within 7 days either side), `overdue_review` (>7 days past))
- `Action` / `ActionCategory` — tasks arising from referrals; `ActionCategory.is_sensitive` controls visibility for non-panel staff
- `StudentNote` — add/edit-only notes on students, written in panel discussion

**Panel meeting structure:**
- `PanelGroup` — staff group scoped to a `School` (nullable); holds `default_chair`
- `PanelGroupMember` — membership in a group (either `staff` or `external_contact`, plus optional `expertise`)
- `Expertise` — skill tags (shared or school-specific via nullable `school` FK); custom manager `ExpertiseQuerySet.visible_for_school(school_id)`
- `ExternalContact` — guest speakers / external professionals who aren't `Staff`
- `Panel` — a meeting session (`date`, `time`, `chair`, `status`, `panel_group`, `started_at`)
- `PanelMember` — per-meeting *attendance* only (`checked_in_at`/`left_at` against a `PanelGroupMember`), not a roster — see `_panel_member_roster()` below and [docs/adr/0005-merge-panel-membership-into-panelgroupmember.md](../../../docs/adr/0005-merge-panel-membership-into-panelgroupmember.md)
- `PanelReferral` — links a `Referral` to a `Panel`; tracks `discussion_status`, timing, follow-up
- `PanelReferralNote` — add-only thread notes during discussion (never edited)
- `Escalation` — escalated referral with resolution tracking

## Key helpers (`views.py`)

- `_is_panel_staff(staff)` — lightweight role check: `PanelGroupMember.objects.filter(staff=staff).exists()`. Controls sensitive `ActionCategory` visibility and `StudentNote` write access. No real auth yet.
- `visible_categories_for(staff, categories=None)` / `visible_actions_for(staff, actions)` — single owner for "hide `is_sensitive` categories/actions from non-panel staff". Every view touching `ActionCategory`/`Action` querysets for display should filter through these instead of re-deriving `_is_panel_staff(...)` and excluding inline.
- `_sync_referral_status(referral)` — recalculates `Referral.status` from active `PanelReferral` states. Call after any PanelReferral add/remove/discuss.
- `_due_followups(panel, as_of)` — scoped to the referral's student's current school (any active Panel Group there, not just the one that originally discussed it — see [#70](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/70)), matching `unassigned_referrals`' own school-level scoping; a MAT-wide group or an ungrouped panel sees nothing due. Pulling follow-ups onto the agenda is only done from Panel Agenda Setup (`inclusion_panel_meeting_setup`'s "Reviews Due" tab, `add_followup_to_agenda` action) — the live Panel Agenda page has no agenda-composition UI of its own, it's for running a meeting whose agenda was already decided.
- `_panel_referral_stage(pr)` — returns `(stage_key, label)` for a single PanelReferral: `discussing` / `assigned` / `requires_follow_up` / `complete`.
- `_panel_member_roster(panel)` — "who's on this panel," used by both Panel Agenda Setup and the live Panel Agenda page. Reads the live `PanelGroupMember` roster for any non-`complete` panel; for a `complete` panel, reads only members with a `PanelMember` row (i.e. who actually checked in) instead, so a finished meeting's attendance record doesn't change if the group's membership changes later.

## Constants

- `PANEL_MENU` — 7-item sidebar for panel pages, each entry carries a `module_key` (children of `inclusion_panel` in `seed_modules`, seeded live)
- `_local_menu(request)` — standard `filter_by_module(PANEL_MENU, module_map(), request)` helper, same convention as every other hub (see `hubs/CLAUDE.md`)
- `_panel_base_context(request)` — dict spread into every panel render: `local_menu` (via `_local_menu`), `hub_title`, `back_to_hub_url`, `back_to_hub_label`
- `ACTION_CATEGORY_PRESETS` — `['Parent Meeting', 'Intervention', 'Other']`

## Seed commands (all in `management/commands/`)

Run after `seed_dummy_data` and `seed_schools`:

```
manage.py seed_referral_questions   # ReferralCategory + ReferralQuestion rows
manage.py seed_panel_groups         # Expertise tags + one PanelGroup per active School
manage.py seed_demo_referrals       # 5 unassigned Referrals with placeholder responses
manage.py seed_panel_meetings       # Past (complete) + upcoming Panel rows per group
manage.py seed_referral_actions     # Tops up 2-3 Actions on every discussed (Complete/Needs Review) referral
```

`seed_benjamin_admin` (also here) sets `is_mat_staff=True`, `is_developer=True`, `school=None` on Benjamin Suri. Depends only on `seed_dummy_data`.
