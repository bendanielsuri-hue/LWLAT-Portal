# Inclusion Panel App — `hubs.inclusion.panel`

Nested Django app at `hubs/inclusion/panel/`. Mounted via `hubs/inclusion/urls.py` at `/inclusion/panel/`. App label: `panel`.

All DB tables keep their original `inclusion_*` names (set via `Meta.db_table` on every model) so no data migration was needed when the app was extracted.

## Models (`models.py`)

**Referral lifecycle:**
- `ReferralCategory` / `ReferralQuestion` / `ReferralResponse` — questionnaire structure and answers
- `Referral` — one referral per student (`status`: open/in_panel/closed, aggregated by `_sync_referral_status`)
- `Action` / `ActionCategory` — tasks arising from referrals; `ActionCategory.is_sensitive` controls visibility for non-panel staff
- `StudentNote` — add/edit-only notes on students, written in panel discussion

**Panel meeting structure:**
- `PanelGroup` — staff group scoped to a `School` (nullable); holds `default_chair`
- `PanelGroupMember` — membership in a group (either `staff` or `external_contact`, plus optional `expertise`)
- `Expertise` — skill tags (shared or school-specific via nullable `school` FK); custom manager `ExpertiseQuerySet.visible_for_school(school_id)`
- `ExternalContact` — guest speakers / external professionals who aren't `Staff`
- `Panel` — a meeting session (`date`, `time`, `chair`, `status`, `panel_group`, `started_at`)
- `PanelMember` — per-meeting attendance roster (distinct from `PanelGroupMember`)
- `PanelReferral` — links a `Referral` to a `Panel`; tracks `discussion_status`, timing, follow-up
- `PanelReferralNote` — add-only thread notes during discussion (never edited)
- `Escalation` — escalated referral with resolution tracking

## Key helpers (`views.py`)

- `_is_panel_staff(staff)` — lightweight role check: `PanelGroupMember.objects.filter(staff=staff).exists()`. Controls sensitive `ActionCategory` visibility and `StudentNote` write access. No real auth yet.
- `_sync_referral_status(referral)` — recalculates `Referral.status` from active `PanelReferral` states. Call after any PanelReferral add/remove/discuss.
- `_due_followups(panel, as_of)` — scoped strictly to `panel.panel_group`; ungrouped panels see nothing. Pulling follow-ups onto the agenda is explicit (`pull_in_followups` action), never automatic.
- `_panel_referral_stage(pr)` — returns `(stage_key, label)` for a single PanelReferral: `discussing` / `assigned` / `requires_follow_up` / `complete`.

## Constants

- `PANEL_MENU` — 7-item sidebar for panel pages
- `PANEL_BASE_CONTEXT` — dict spread into every panel render: `local_menu`, `hub_title`, `back_to_hub_url`, `back_to_hub_label`
- `ACTION_CATEGORY_PRESETS` — `['Parent Meeting', 'Intervention', 'Other']`

## Seed commands (all in `management/commands/`)

Run after `seed_dummy_data` and `seed_schools`:

```
manage.py seed_referral_questions   # ReferralCategory + ReferralQuestion rows
manage.py seed_panel_groups         # Expertise tags + one PanelGroup per active School
manage.py seed_demo_referrals       # 5 unassigned Referrals with placeholder responses
manage.py seed_panel_meetings       # Past (complete) + upcoming Panel rows per group
manage.py seed_referral_actions     # Tops up 2-3 Actions on every discussed (Complete/Requires Follow-up) referral
```

`seed_benjamin_admin` (also here) sets `is_mat_staff=True`, `is_developer=True`, `school=None` on Benjamin Suri. Depends only on `seed_dummy_data`.
