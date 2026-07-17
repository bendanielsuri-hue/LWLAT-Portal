# Inclusion Panel

Nested Django app (`hubs.inclusion.panel`) for running SEND panel meetings: raising referrals for students, discussing them at panels, and tracking follow-up actions. This is a leaf context inside the wider Inclusion hub — shared-across-hubs vocabulary (Staff, Student, School) lives in `core`, not here.

## Language

**Referral**:
A request for a student to be considered by the panel, tied one-to-one to a `core.Referral` base row (the cross-hub shared record) via `inclusion_detail`. Carries its own lifecycle status independent of whether it's currently on a panel's agenda.
_Avoid_: Case, concern (a "concern" is the free-text reason on a Referral, not the Referral itself)

**Referral status**:
Seven states, in two groups. *On a live agenda*: `assigned` (added to an upcoming panel's agenda, not yet discussed) → `discussing` (currently being discussed, mid-meeting). *Not on any current agenda*: `open` (newly raised, not yet assigned anywhere), `closed` (resolved, no follow-up needed), and a three-tier follow-up queue — `review_scheduled` (follow-up due date is more than a week away), `awaiting_review` (due within a week either side), `overdue_review` (due date has passed by more than a week). Recalculated by `_sync_referral_status()` from the Referral's active `PanelReferral` rows — never set directly.
_Avoid_: "In progress" (ambiguous between `assigned` and `discussing`)

**Panel**:
One scheduled meeting session — a specific date/time with a chair and a status (`draft` → `ready` → `running`/`delayed` → `complete`). Distinct from "the Panel" as a general concept (the whole feature area) and from `PanelGroup` (see below).
_Avoid_: Meeting (used interchangeably in UI copy, but "Panel" is the model name — prefer Panel in code/docs)

**PanelGroup**:
The standing group of staff/experts scoped to one `School` who sit on panels together — think "the Woodstock SEND panel" as an institution, independent of any single meeting date. Holds a `default_chair`. A `Panel` (meeting) belongs to one `PanelGroup`, or none (ungrouped).
_Avoid_: Panel (too easily confused with the meeting-instance model)

**PanelGroupMember**:
Standing membership in a `PanelGroup` — staff or an `ExternalContact`, optionally tagged with an `Expertise`. Distinct from `PanelMember`, which is per-meeting attendance.
_Avoid_: Member (ambiguous with PanelMember)

**PanelMember**:
Per-meeting *attendance* only, not a roster — a `checked_in_at`/`left_at` record linking a `Panel` to one of that panel's `PanelGroupMember`s. "Who's on this panel" always reads `PanelGroupMember` directly (see `_panel_member_roster()`); a `PanelMember` row only exists once someone has actually checked in during a live/completed meeting. See [docs/adr/0005-merge-panel-membership-into-panelgroupmember.md](../../../docs/adr/0005-merge-panel-membership-into-panelgroupmember.md).
_Avoid_: Attendee, participant, Member (this is an attendance fact, not a person)

**PanelReferral**:
The link between a `Referral` and a `Panel` — "this referral is on this panel's agenda." Carries the per-meeting discussion state (`discussion_status`: pending/discussed), agenda position, timing, and follow-up scheduling. A Referral's overall status is derived from its PanelReferral rows, not stored independently of them once it's been on an agenda.
_Avoid_: Agenda item (used in UI copy; PanelReferral is the model name)

**Discussion stage**:
The four-way simplified view of a single PanelReferral's state, returned by `_panel_referral_stage()`: `discussing` (live now), `assigned` (queued, not yet reached), `requires_follow_up` (discussed, follow-up still open), `complete` (discussed, no follow-up needed). Distinct from Referral status — this is scoped to one PanelReferral, not the Referral's overall lifecycle.

**Discussion Summary**:
The reusable component (`_discussion_summary_context()`/`_discussion_summary_content.html`, [#44](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/44)) summarising one specific discussion — one PanelReferral — in full: Panel Group, duration, Chair, distinct `PanelReferralNote` authors, the actions raised during it (`Action.origin_panel_referral`), and its full note thread. Never aggregates across a referral's whole discussion history — a caller wanting "discussed N times" computes that separately and passes it alongside. Distinct from **Panel Meetings** (the unscoped list of *every* past discussion shown inside the Referral Details modal, `_referral_detail_context()`) — Panel Meetings is a history index with counts and a "View Discussion Page" link per row; Discussion Summary is the full, single-discussion detail reachable without leaving the page it's opened from.
_Avoid_: Panel History (older name for the Panel Meetings section above; don't conflate the two components)

**Action**:
A task arising from a discussed referral, with its own status (`incomplete`/`complete`, default `incomplete`) and category. `ActionCategory.is_sensitive` hides an action from staff who aren't panel members (`_is_panel_staff`).
_Avoid_: Task, follow-up (follow-up is a Referral/PanelReferral scheduling concept, not an Action)

**Escalation**:
A referral flagged for attention beyond the normal panel process, with its own open/resolved status and resolution tracking — separate from the Referral's own status field.

**Safeguarding Note** (`core.models.SafeguardingNote`):
A Designated Safeguarding Lead's atomic, one-line safeguarding statement about a student ([#52](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/52), decoupled to `core` and made student-only in [#77-#81](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/77)) — no link to any `Panel`/`Referral` at all, since a student's safeguarding context spans whatever's on today's agenda and the model is meant to be readable by hubs beyond Panel. "Editing" a note never mutates it — it creates a new active row with `supersedes` pointing at the note it replaces, auto-retiring the predecessor; the superseded note never shows on screen again, not even in History. The one in-place mutation is manual retirement, UI-labelled **Delete** (no successor): sets `retired_at`/`retired_by`/`retirement_reason`/optional `retirement_note` — History only ever shows a deleted note, never an edited-away one ([#83](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/83)). No hard delete, ever. Read of the note text itself is gated to `Staff.is_dsl` on the Safeguarding Notes screen (tightened from the earlier `_is_panel_staff` read gate - a non-DSL visitor sees the row list/Briefed status but not note content); writing (add/edit/delete) stays gated to `Staff.is_dsl` as well, same as before. Meeting-readiness stays a separate fact — see `PanelReferral` above, deliberately *not* decoupled alongside the note itself (#79). The screen/menu name is now **Safeguarding Notes** (renamed from Safeguarding Briefings, [#84](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/84)) — the DSL homepage card (`hubs/inclusion/panel/home.html`) is the one place still saying "Briefings", left as-is (out of scope for #84). Replaces `hubs.inclusion.panel.SafeguardingBriefing`, which replaced the old DSL Notes/`StudentNote` (edit-in-place, no meeting link).
_Avoid_: Safeguarding Briefing (the pre-#77 model/screen name), Retire (UI now says Delete), DSL Notes, Notes

**Chair**:
The staff member leading a specific `Panel` meeting. Set explicitly, or falls back to the `PanelGroup`'s `default_chair` when a group is assigned with no chair specified. Vacated automatically if that staff member is deactivated from the `PanelGroup` while any of the group's panels (other than completed ones) point to them as chair.

## Panel-staff role check

`_is_panel_staff(staff)` — whether a staff member is on *any* `PanelGroup` (`PanelGroupMember` exists for them). Not a formal auth role, just a lightweight visibility gate for sensitive Actions/Safeguarding Notes. See `hubs/inclusion/panel/CLAUDE.md` for the technical implementation.
