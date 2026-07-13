# Core

Shared domain models used across every hub — Staff, Student, School, and the cross-cutting data that describes a student's pastoral/academic record independent of any one hub's own workflow.

## Language

**Attendance Day**:
One student's attendance record for a single school day — an AM and a PM session mark (present / absent unauthorised / absent authorised / late), matching how UK schools actually take a register twice daily. The stored source of truth; a week's or term's attendance percentage is always a derived rollup computed from these, never stored separately, so it can't drift out of sync.
_Avoid_: Attendance week/record (this project's grain is per-day, not per-week — a "week" is a query over Attendance Days, not its own table), attendance percentage (a derived value, not a stored fact)

**Behaviour Incident**:
A single logged behaviour event for a student — date, description, category (a fixed preset set, e.g. Disruption/Aggression/Defiance/Other, mirroring `ActionCategory`'s pattern), a separate severity, and who logged it. The behaviour picture shown anywhere in the app (a summary, a trend) is always derived from the incident log, never a standalone freeform summary field.
_Avoid_: Behaviour summary/note (a derived rollup of incidents, not a thing stored on its own)

**Exclusion**:
A single logged exclusion for a student — start date, end date (blank for permanent), type (fixed-term / permanent / internal), reason. `exclusions_count` shown anywhere in the app is always a derived count of these records, never its own stored counter.
_Avoid_: Exclusion count (a derived value, not a stored fact)
