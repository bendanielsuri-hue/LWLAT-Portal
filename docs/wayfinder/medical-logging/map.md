---
label: wayfinder:map
status: open
---

# Map: Medical Logging

Tracker home: [#275](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/275).

## Destination

A medical logging app covering **both students and staff** — first aid incidents, medication administered, care plans, and the standing medical facts a first-aider or SENDCo needs at a glance. Reached when a first-aider can record what happened to a person, and anyone with the right to see it can read that person's history back.

The `hubs.medical` hub is scaffolded (skeleton page only, `medical_hub` seeded `hidden`). Nothing else is built.

## Notes

- Hub: `hubs/medical/` — see [hubs/medical/CLAUDE.md](../../../hubs/medical/CLAUDE.md). Mounted at `/medical/`, one placeholder page.
- Nearest existing models to read first: `core.SafeguardingNote` (supersede-don't-mutate, DSL-gated) and `core.ThreadEntry` (abstract base, one table per thread) in [core/models.py](../../../core/models.py).
- Relevant ADRs: [0004](../../adr/0004-hubs-as-url-convention-not-db-model.md) (hub is URL/template only, no DB), [0025](../../adr/0025-registers-own-spine-not-statutory-attendance.md) (why a new domain keeps its own spine and is read, not written into, by others), [0026](../../adr/0026-register-attendance-is-an-append-only-event-log.md) (append-only event log), [0031](../../adr/0031-three-kinds-of-note-and-one-thread-entry-base.md) (standing statement vs historical event vs record attribute; why the generic-FK table was rejected).
- Registers' glossary ([hubs/registers/CONTEXT.md](../../../hubs/registers/CONTEXT.md)) already settles vocabulary this will want — `occurred_at` vs `recorded_at`, retraction vs correction, `source` vs `recorded_via`. Reuse the terms rather than inventing parallel ones.

## Decisions so far

- **Models live in `core`, not in `hubs.medical`.** The hub owns pages and templates only. `core.SafeguardingNote` was born inside `hubs.inclusion.panel` and had to be relocated to `core` the moment a second consumer appeared (#77-#81); a medical record has at least three consumers on day one (medical room / first aid, SENDCo for care plans, HR for staff occupational health). Also forced by ADR 0004 — a hub has no DB of its own — and by both `Staff` and `Student` living in `core`.
- **Separate tables for the staff subject and the student subject, over one table with two nullable FKs.** This is the first thing in the portal to make a `Staff` row the *subject* of a record rather than its author — every `Staff` FK in `core/models.py` today is an actor (`author`, `logged_by`, `recorded_by`, `retired_by`). The deciding argument is ADR 0031's: one table holding differently-gated parents means the visibility rule can no longer be expressed as a join to a single parent model and needs a second implementation. The gates here are genuinely different — a student's allergy is deliberately visible to their teachers for safety, a staff member's occupational-health record is not. Shared behaviour goes in an abstract base in `core`, the `core.ThreadEntry` pattern.
- **Standing statements and historical events are two models, not one.** Per ADR 0031's taxonomy: conditions, allergies, current medication and care plans are *standing statements* (supersede, never mutate — "what is true now"); a dose given at 11:04 or a head bump at breaktime is a *historical event* (append-only, never stops being true). Collapsing them is the `Action.description` mistake ([#229](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/229)) on a far more sensitive model.
- **A Medical Room register is a separate thing in `hubs.registers`, not part of this.** "Who was in the medical room" is attendance at a named thing and fits `RegisterCategory` (categories are data, not a choices list). It reads from the medical tables; the two are never merged. Same split ADR 0025 lands on for statutory attendance.
- **Not folded into `hubs.registers` or `hubs.staff`.** Registers is attendance at a sitting — sessions, schedules, runs, expectation strategies — and a first aid incident has none of those; forcing it in means every register query starts filtering, the exact failure ADR 0025 rejects. `hubs.staff` is a member of staff's own self-service (my timetable, my payslips), and this is records about other people.
- **`medical_hub` seeded `hidden`** and stays hidden until there is both something to show and an access-control story.

## Not yet specified

- **Access control.** The portal enforces no auth at all (root CLAUDE.md). Medical data is GDPR Article 9 special category. Every other hub can ship ahead of permissions; this one cannot. Open question whether this hub is the forcing function for real auth, or whether it waits for auth to land first.
- **Where student standing medical facts come from.** Real student data is a read-only SIMS extract in Azure SQL, and SIMS already holds medical/dietary flags. Unsettled whether student standing facts sync from SIMS (portal read-only, like other SIMS-sourced fields) while only the event log is portal-owned — or whether the portal owns both.
- The staff side's relationship to `staff_absence_request` — whether a sickness absence and an occupational-health record touch each other at all.
- Who may write: the `Staff.is_dsl` pattern has an obvious analogue (a first-aid/medical-lead flag), unconfirmed.
- Retraction/correction semantics — whether to reuse Registers' `kind` vocabulary verbatim.

## Out of scope

- Anything that writes into `core.AttendanceDay`, `BehaviourIncident`, `Exclusion` or `PositiveBehaviourIncident`. Reads out are welcome; writes in are the ADR 0025 failure.
- Parent/guardian-facing views.
