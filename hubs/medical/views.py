from django.shortcuts import render

from core.hub_context import hub_context

# The page set the hub is being built towards, charted in
# docs/wayfinder/medical-logging/map.md. Every one of these is a placeholder
# template today - the pages exist so the shape of the hub is visible and so
# each one has a Module row to gate it, not because any of them does anything.
#
# The spine of the split is ADR 0031's, drawn as navigation. Medical Profiles,
# Care Plans, Medical Consent and Immunisations hold standing statements - what
# is true about a person now, superseded rather than mutated. Medical Log and
# the Accident Book hold historical events - what happened at a moment,
# append-only. A page that would hold both has picked the wrong one.
#
# Four of these look like they could collapse into another page and cannot:
#
# - The Accident Book is not the Medical Log. The log is clinical (what was
#   wrong with this person, what care they were given); the accident book is
#   the liability and RIDDOR record of what happened and where. Different
#   retention, different readers, and it covers visitors and contractors, who
#   are neither Staff nor Student and have no table in this portal at all.
# - Emergency Equipment is not a person's record. Spare inhalers, adrenaline
#   auto-injectors and the defibrillator are assets with a location, an expiry
#   and a recurring check - the product is the expiry alert, not the list.
# - Immunisations are administered by the external school nursing team, not by
#   school staff, which is an assumption nothing else in this hub makes.
# - Medical Consent records what a parent has agreed to, so an administration
#   can be checked against it. Recording consent is not parent-facing; parent
#   facing views stay out of scope per the map.
#
# Profiles covers staff and students on one page over two tables. They stay
# separate tables, because a student's allergy is meant to reach their teachers
# and a staff member's occupational health record is not - so the page needs a
# subject filter and two visibility gates behind one search box. The duplication
# a second page would remove is template duplication; the gate is what is
# actually hard, and one page does not make it harder.
#
# There is no Medication page. A dose given is an event and lives in the log
# alongside incidents, the way hubs.registers makes its category pages filtered
# views over one generic system rather than five separate features. The thing
# this leaves homeless is the worklist - who is *due* a dose at lunchtime, which
# is not a record of what happened - and that is an open question on the map,
# not an oversight.
#
# The first aider directory is deliberately not in this list: it is on the hub
# landing page rather than a page of its own. See hub.html.
MEDICAL_MENU = [
    {'name': 'Profiles', 'url': '/medical/profiles/', 'icon': 'medical/icons/profile.svg', 'module_key': 'medical_profiles'},
    {'name': 'Medical Log', 'url': '/medical/log/', 'icon': 'medical/icons/log.svg', 'module_key': 'medical_log'},
    {'name': 'Accident Book', 'url': '/medical/accident-book/', 'icon': 'medical/icons/accident_book.svg', 'module_key': 'medical_accident_book'},
    {'name': 'Care Plans', 'url': '/medical/care-plans/', 'icon': 'medical/icons/care_plan.svg', 'module_key': 'medical_care_plans'},
    {'name': 'Consent', 'url': '/medical/consent/', 'icon': 'medical/icons/consent.svg', 'module_key': 'medical_consent'},
    {'name': 'Immunisations', 'url': '/medical/immunisations/', 'icon': 'medical/icons/immunisation.svg', 'module_key': 'medical_immunisations'},
    {'name': 'Emergency Equipment', 'url': '/medical/equipment/', 'icon': 'medical/icons/equipment.svg', 'module_key': 'medical_equipment'},
]


def _hub_context(request):
    return hub_context(request, MEDICAL_MENU, 'Medical')


def medical_hub(request):
    return render(request, 'hubs/medical/hub.html', _hub_context(request))


def medical_profiles(request):
    return render(request, 'hubs/medical/profiles.html', _hub_context(request))


def medical_log(request):
    return render(request, 'hubs/medical/log.html', _hub_context(request))


def medical_accident_book(request):
    return render(request, 'hubs/medical/accident_book.html', _hub_context(request))


def medical_care_plans(request):
    return render(request, 'hubs/medical/care_plans.html', _hub_context(request))


def medical_consent(request):
    return render(request, 'hubs/medical/consent.html', _hub_context(request))


def medical_immunisations(request):
    return render(request, 'hubs/medical/immunisations.html', _hub_context(request))


def medical_equipment(request):
    return render(request, 'hubs/medical/equipment.html', _hub_context(request))
