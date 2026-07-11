# Shared `Referral` base table with per-type detail tables

Multiple hubs need "raise a referral for a student" (SEND, behaviour, attendance, and future inclusion sub-types), and each type wants its own richer status/workflow — Inclusion Panel's referral already has a 7-state lifecycle. Rather than one `Referral` table with an ever-growing set of type-specific nullable columns, or a fully separate table per hub, `core.Referral` holds only the minimal fields common to every type (`referral_type`, `student`, `raised_by`, `date_referred`, a two-state `open`/`closed` status for cross-hub reporting/search) and each type owns a detail table (`hubs.inclusion.panel.InclusionReferral` today, via a `OneToOneField`) for its own fields and status. `core.Referral.status` is explicitly documented as reporting-only, not a state machine — the detail table's richer status is source of truth and is responsible for keeping the base row in sync (see `_sync_referral_status()`).

## Considered options

- **Single wide table**: one `Referral` with nullable columns for every hub's needs. Rejected — the SEND detail alone needs 7 status states plus priority; a behaviour or attendance referral would carry dozens of always-null SEND-specific columns, and adding a 5th referral type means another column batch on a table every hub touches.
- **Fully separate tables per hub, no shared base**: rejected — loses cross-hub reporting/search (e.g. "all open referrals for this student across every hub") without a join key, and duplicates `student`/`raised_by`/`date_referred` in every hub's own table.
