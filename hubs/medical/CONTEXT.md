# Medical

Django app (`hubs.medical`, mounted at `/medical/`) for medical and welfare logging about **both students and staff** — first aid, medication, care plans, and the standing medical facts a first-aider or SENDCo needs at a glance. The hub owns pages and templates only; the models live in `core`, because a medical record is about a `core.Staff` or a `core.Student` and has consumers in at least three hubs.

Nothing below is built yet; this glossary was written alongside the design (see [#275](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/275) and [docs/wayfinder/medical-logging/map.md](../../docs/wayfinder/medical-logging/map.md)) so the models arrive with settled names. The standing-statement / historical-event split below is [ADR 0031](../../docs/adr/0031-three-kinds-of-note-and-one-thread-entry-base.md)'s taxonomy applied to this domain.

Terms below are the domain names. Several sidebar labels are deliberately shorter than the term — "Profiles", "Consent" — because the hub name is already rendered beside every one of them: in the sidebar header, on the MAT Home card, and in each global search result, which carries the hub's name and icon. A label that repeats "Medical" repeats it three times. Registers does the same thing (`register_clubs` keyed, "Clubs" displayed); Staff and Student do not, and are the odd ones out.

## Language

**Medical Profile**:
Everything currently true about one person's health — conditions, allergies, current medication, and the care plans in force. A **standing statement** in ADR 0031's sense: editing never mutates a row, a new row supersedes the old one, and the question it answers is "what is true now". Covers staff and students on one page over two tables.
_Avoid_: Medical record (ADR 0031 already uses "record attribute" for something else), Medical register (`Register` is a defined term in `hubs.registers` and means a different thing), Health profile

**Medical Log**:
The stream of things that have happened to a person medically — a first aid incident, a dose administered. A **historical event**: append-only, never stops being true, and never edited into a different account of the past. One stream with a kind per entry rather than one page per kind, the same shape `hubs.registers` chose for its category pages.
_Avoid_: First aid log (doses are in it too and are not first aid), Incident log (an administered dose is not an incident), Medical history (that reads as the profile)

**First aid incident**:
One episode of care — the trip at breaktime, the ice pack, the observation period. Carries the clinical narrative, and hangs a `core.ThreadEntry` thread for what was done about it afterwards ("phoned mum, no answer"), so the narrative never becomes a `notes` TextField.

**Medication administration**:
One dose given, at a moment, to a person. Its own record rather than a field on a first aid incident or an entry in that incident's thread: the child who takes daily medication at lunchtime generates a dose with **no incident at all**, so a dose cannot depend on an incident existing.
_Avoid_: MAR (fine in UI copy; the term is opaque to anyone outside a medical room)

**Care plan**:
A standing document describing how a named condition is to be managed — asthma, epilepsy, anaphylaxis, diabetes — with a review date. A standing statement, superseded rather than edited, and portal-owned: a care plan will never exist in SIMS.

**Accident Book**:
The liability and reporting record of what happened and where — a trip on a wet corridor, a fall in PE. Deliberately **not** the Medical Log: the log is clinical (what was wrong with a person and what care they were given), the accident book is the circumstance, and the two have different readers and different retention. The record that forces the visitor problem below, since it covers anyone on site.
_Avoid_: Incident report (the Medical Log holds incidents too), H&S log

**Subject**:
The person a record is *about*, as opposed to the staff member who wrote it. This portal has only ever used `core.Staff` as an actor — `author`, `logged_by`, `raised_by` — and medical records are the first thing to make a person the subject. Students and staff are separate tables because their visibility gates genuinely differ. **Visitors and contractors are a third subject with no table anywhere in this portal**, and the Accident Book needs them; unresolved on the map.
_Avoid_: Owner, Patient (nobody in a school says patient)

**First aider directory**:
Who on site is a qualified first aider, where they are, and what they are qualified for — an emergency lookup, so it lives on the hub landing page rather than behind a click. Owns nothing: the qualifications and their expiry dates are staff training records belonging in `hubs.staff` next to CPD & Training, and this reads them. The only content in this hub that is not special category data.
_Avoid_: First aid team, First aider register (`Register` is Registers' term)

**Emergency equipment**:
The spare inhalers, adrenaline auto-injectors and defibrillator held for use on anyone, not prescribed to one person. An asset with a location, an expiry date and a recurring check — so the product is the expiry and check alert, not the inventory list. Distinct from a person's own supply, which is a standing statement on their profile.
_Avoid_: Stock, Supplies (those are a person's own), Assets (too general; Resources owns that word)

**Immunisation session**:
A visit by the external school nursing team to administer a programme — HPV, DTP, flu — to a cohort. The administering party is not school staff, which is an assumption nothing else in this hub makes: the school holds the consent and the record, and did not give the dose.
_Avoid_: Vaccination clinic, Jab day

**Medical consent**:
What a parent has agreed the school may do — administer a named medicine, give paracetamol, treat in an emergency. A standing statement, checked against before an administration. Recording it is not parent-facing; parent-facing views stay out of scope.
_Avoid_: Permission slip (that's trips), Authorisation

**Medical room attendance**:
Who was in the medical room and for how long. **Not part of this hub** — it is attendance at a named thing, so it is a `RegisterCategory` in `hubs.registers` and follows that hub's vocabulary. It reads from the medical tables; the two are never merged. One head-bump therefore produces three rows in two hubs: an attendance, an incident, and (if a dose was given) an administration.
_Avoid_: Medical register, Medical room log (the log is this hub's; the attendance is Registers')

**Mirrored fact**:
A standing fact whose source of truth is the SIMS extract, not the portal — the coarse flags SIMS already holds (allergy, dietary, condition markers). Displayed read-only and marked visibly as such, so nobody edits a copy that the next sync will overwrite. The portal owns everything else on the profile.
_Avoid_: Synced field, Imported flag
