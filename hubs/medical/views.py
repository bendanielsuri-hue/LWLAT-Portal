from django.shortcuts import render

from core.hub_context import hub_context

# The page set the hub is being built towards, charted in
# docs/wayfinder/medical-logging/map.md. Every one of these is a placeholder
# template today - the pages exist so the shape of the hub is visible and so
# each one has a Module row to gate it, not because any of them does anything.
#
# Pages fall into three kinds, and every one of them is one of the three.
# ADR 0031 names the first two: a standing statement is what is true about a
# person now (Profiles), superseded rather than mutated; a historical event is
# what happened at a moment (Medical Log, the Accident Book), append-only. The
# third kind is this hub's own - what needs to happen next (Immunisations,
# Stock) - and naming it is what made this list derivable rather than a set of
# topics to remember. A page that would hold two kinds has picked the wrong one.
#
# Three of these look like they could collapse into another page and cannot:
#
# - The Accident Book is not the Medical Log. The log is clinical (what was
#   wrong with this person, what care they were given); the accident book is
#   the liability and RIDDOR record of what happened and where. Different
#   retention, different readers, and it covers visitors and contractors, who
#   are neither Staff nor Student and have no table in this portal at all.
# - Immunisations is an operation, not a record. The provider owns the consent
#   and hands the school a list of students who are already being immunised;
#   the school's job is getting them out of lessons and back without wrecking a
#   teaching day. The doses land in the Medical Log afterwards.
# - Stock is not a person's record. Spare inhalers, auto-injectors, the
#   defibrillator, and the plasters and ice packs that actually run out are one
#   shape - an item, a location, a quantity, an expiry, a last-checked date -
#   and the product is the alert, not the inventory. The statutory items have
#   to surface first on the page; that is a layout job, not a second page.
#
# Care plans are a section of a profile, not a page: a plan in force is a
# standing statement about a person, which is what a profile already holds.
# What made it look separate is its review cycle, and "which plans are overdue
# review" is a worklist - the third kind - alongside doses due and stock
# expiries.
#
# Consent left this hub for hubs.student. A parent consents to photographs,
# trips, internet use and biometrics in the same breath as medicines, so one
# medical-only consent page would have been a second model of one shape; and
# consent is parental, so it has nothing to say about the staff half of this
# hub. The model belongs in core (the core.SafeguardingNote move, #77-#81),
# and the medical-kind consents surface read-only on a profile, because a
# first-aider checking "may we give paracetamol" needs it at the point of care.
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
    {'name': 'Immunisations', 'url': '/medical/immunisations/', 'icon': 'medical/icons/immunisation.svg', 'module_key': 'medical_immunisations'},
    {'name': 'Stock', 'url': '/medical/stock/', 'icon': 'medical/icons/stock.svg', 'module_key': 'medical_stock'},
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


def medical_immunisations(request):
    return render(request, 'hubs/medical/immunisations.html', _hub_context(request))


def medical_stock(request):
    return render(request, 'hubs/medical/stock.html', _hub_context(request))
