# Medical

Django app (`hubs.medical`, mounted at `/medical/`) for medical and welfare logging about **both students and staff** — first aid, medication, care plans, and the standing medical facts a first-aider or SENDCo needs at a glance. The hub owns pages and templates only; the models live in `core`, because a medical record is about a `core.Staff` or a `core.Student` and has consumers in at least three hubs.

Every page is one of **three kinds**, and the kinds are what make the page list derivable rather than a set of topics to remember. ADR 0031 names the first two — a **standing statement** is what is true about a person now (Profiles), a **historical event** is what happened at a moment (Medical Log, Accident Book). The third is this hub's own: **what needs to happen next** (Immunisations, Stock, and the doses-due / reviews-due / expiries worklist still unbuilt). A page holding two kinds has picked the wrong one, and a thing that keeps failing to find a page usually needs the third kind rather than a fourth page.

Nothing below is built yet; this glossary was written alongside the design (see [#275](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/275) and [docs/wayfinder/medical-logging/map.md](../../docs/wayfinder/medical-logging/map.md)) so the models arrive with settled names. The standing-statement / historical-event split below is [ADR 0031](../../docs/adr/0031-three-kinds-of-note-and-one-thread-entry-base.md)'s taxonomy applied to this domain.

Terms below are the domain names; sidebar labels mostly match them. Labels carry "Medical" where they would otherwise be ambiguous alone — the "Most Used Apps" tray renders a leaf's name with no hub beside it, so "Profiles", "Log" and "Stock" would arrive there meaning nothing, while "Immunisations" is unambiguous and takes no prefix. That test, not a per-hub habit, is why Registers prefixes nothing and Staff prefixes most things. See the page-adding checklist in the root `CLAUDE.md`.

## Language

**Medical Profile**:
Everything currently true about one person's health — conditions, allergies, current medication, and the care plans in force. A **standing statement** in ADR 0031's sense: editing never mutates a row, a new row supersedes the old one, and the question it answers is "what is true now". Covers staff and students on one page over two tables.
_Avoid_: Medical record (ADR 0031 already uses "record attribute" for something else), Medical register (`Register` is a defined term in `hubs.registers` and means a different thing), Health profile

**Medical Log**:
The stream of things that have happened to a person medically — an incident with its accident and treatment facets, a dose administered. A **historical event**: append-only, never stops being true, and never edited into a different account of the past. One stream rather than one page per kind, the same shape `hubs.registers` chose for its category pages.
_Avoid_: First aid log (doses are in it too and are not first aid), Incidents (an administered dose is not an incident, so it cannot be the page's name even though Incident is the row's), Medical Room (most of what is in here did not happen there — a car park accident, an asthma attack on the field, a dose given in a classroom — and `hubs.registers` separately owns a Medical Room register), Medical history (that reads as the profile)

**First aid incident**:
One episode of care — the trip at breaktime, the ice pack, the observation period. Carries the clinical narrative, and hangs a `core.ThreadEntry` thread for what was done about it afterwards ("phoned mum, no answer"), so the narrative never becomes a `notes` TextField.

**Medication administration**:
One dose given, at a moment, to a person. Its own record rather than a field on a first aid incident or an entry in that incident's thread: the child who takes daily medication at lunchtime generates a dose with **no incident at all**, so a dose cannot depend on an incident existing.
_Avoid_: MAR (fine in UI copy; the term is opaque to anyone outside a medical room)

**Care plan**:
A standing document describing how a named condition is to be managed — asthma, epilepsy, anaphylaxis, diabetes — with a review date. A standing statement, superseded rather than edited, and portal-owned: a care plan will never exist in SIMS. **A section of a Medical Profile, not a page of its own** — a plan in force is part of what is true about a person now, which is what the profile already holds. Its review cycle is what made it look separate, and "which plans are overdue review" is a worklist, not a page.
_Avoid_: Individual Healthcare Plan / IHP (the statutory term in the DfE's *Supporting pupils at school with medical conditions*, and the better name if the trust's schools actually say it — unresolved on the map), Care package (social care)

**Incident**:
One thing that happened to one person at one moment, and the single row the Medical Log is made of. Carries only what every occurrence has — subject, `occurred_at`, `recorded_at`, who recorded it, where — with the specifics in optional facets below. The shared-base-plus-detail shape of `core.Referral` ([ADR 0001](../../docs/adr/0001-shared-referral-base-table.md)), for the same reason.

**Accident facts**:
The liability and reporting side of an incident — the circumstance, the location, whether it is RIDDOR reportable, any witness. A facet of an Incident, not a record of its own: a child who trips and is treated is *one* occurrence, and two pages asking for it twice means the accident half goes unfilled, because it is the half nobody needs until two years later. The facet that forces the visitor problem below, since it covers anyone on site.
_Avoid_: Accident Book (the statutory artefact this feeds, and it was a page here until the double-entry problem was noticed), H&S log

**Treatment facts**:
The clinical side of an incident — what care was given, by whom, what the outcome was. The other facet, and independent of the accident one: an asthma attack is treatment with no accident, a contractor who takes himself to A&E is an accident with no treatment, and a near miss is an accident with no injury at all. Which is why these are optional facets rather than two mutually exclusive event types — a type would force a choice on the commonest case of all.

**Subject**:
The person a record is *about*, as opposed to the staff member who wrote it. This portal has only ever used `core.Staff` as an actor — `author`, `logged_by`, `raised_by` — and medical records are the first thing to make a person the subject. Students and staff are separate tables because their visibility gates genuinely differ. **Visitors and contractors are a third subject with no table anywhere in this portal**, and the Accident Book needs them; unresolved on the map.
_Avoid_: Owner, Patient (nobody in a school says patient)

**First aider directory**:
Who on site is a qualified first aider, where they are, and what they are qualified for — an emergency lookup, so it lives on the hub landing page rather than behind a click. Owns nothing: the qualifications and their expiry dates are staff training records belonging in `hubs.staff` next to CPD & Training, and this reads them. The only content in this hub that is not special category data.
_Avoid_: First aid team, First aider register (`Register` is Registers' term)

**Stock**:
Everything the school holds for use on whoever needs it, rather than prescribed to one person: the statutory emergency items (spare inhalers, adrenaline auto-injectors, the defibrillator) and the consumables that actually run out (plasters, gloves, ice packs, paracetamol). One shape — an item, a location, a quantity, an expiry, a last-checked date — because a defibrillator is simply quantity one, and its pads and battery expire exactly as an inhaler does. The product is the alert, not the inventory.

Named "Emergency equipment" until it was noticed that the narrow name gave the weekly problem (running out of plasters) nowhere to live while reserving a page for the once-a-decade one. The statutory items still have to surface first on the page — that duty is what the old name was carrying, and it is a layout job, not a second page.
_Avoid_: Stocks (reads as shares; stock is uncountable here), Supplies (a person's own supply is a standing statement on their profile), Assets (too general; Resources owns that word), Equipment (excludes the consumables)

**Immunisation session**:
A visit by the external school nursing team to administer a programme — HPV, DTP, flu — to a cohort. The provider collects the consent and hands the school a list of students who *are* being immunised; the school neither owns that consent nor gives the dose. What the school owns is the logistics — getting those students out of lessons and back again — which is why Immunisations is an operation rather than a record. The doses land in the Medical Log afterwards, with the provider as administrator.
_Avoid_: Vaccination clinic, Jab day, Immunisation register (`Register` is Registers' term), Session unqualified (`RegisterSession` is one sitting of a register; this spans a day — unresolved collision, on the map)

**Consent**:
What a parent has agreed the school may do. **Not this hub's** — it lives in `hubs.student`, because a parent agrees to medicines, photographs, trips, internet use and biometrics in one breath, and a medical-only consent page would be a second model of one shape. It is also parental, so it has nothing to say about the staff half of this hub. The model belongs in `core` (the `core.SafeguardingNote` move, #77-#81); the medical-kind consents surface read-only on a Medical Profile, because a first-aider checking "may we give paracetamol" needs it at the point of care.
_Avoid_: Medical consent (implies this hub owns a kind of its own), Permission slip (that's trips), Authorisation

**Medical room attendance**:
Who was in the medical room and for how long. **Not part of this hub** — it is attendance at a named thing, so it is a `RegisterCategory` in `hubs.registers` and follows that hub's vocabulary. It reads from the medical tables; the two are never merged. One head-bump therefore produces three rows in two hubs: an attendance, an incident, and (if a dose was given) an administration.
_Avoid_: Medical register, Medical room log (the log is this hub's; the attendance is Registers')

**Mirrored fact**:
A standing fact whose source of truth is the SIMS extract, not the portal — the coarse flags SIMS already holds (allergy, dietary, condition markers). Displayed read-only and marked visibly as such, so nobody edits a copy that the next sync will overwrite. The portal owns everything else on the profile.
_Avoid_: Synced field, Imported flag
