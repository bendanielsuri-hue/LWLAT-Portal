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
# Every label here has to read correctly with no hub name beside it. The "Most
# Used Apps" tray on MAT Home (portal/templates/portal/home.html) renders a
# leaf's name alone - no hub, no section, and the tooltip is the same bare
# string - so "Profiles" or "Log" would arrive there meaning nothing. That is
# the whole reason three of these four carry "Medical" and Immunisations does
# not: the test is whether the name stands by itself, not whether the hub
# prefixes by habit. Registers passes the same test without prefixing at all,
# because "Clubs" and "Library" already say what they are.
#
# Two of these look like they could collapse into another page and cannot:
#
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
# The accident book is a facet of a log entry, not a page. One occurrence -
# a child trips and is treated - was producing two records on two pages, and
# the accident half is the one nobody fills in, because it is the half nobody
# needs until two years later. So the log holds one Incident, and the accident
# facts and the treatment facts hang off it as optional detail: the shared base
# table with per-type detail tables that ADR 0001 landed for core.Referral,
# which is also what (ENG-S1) asks for here. Optional both ways, because they
# are not alternatives - a contractor who takes himself to A&E is an accident
# with no treatment, an asthma attack is a treatment with no accident, and a
# near miss is an accident with no injury at all. Two mutually exclusive event
# types would force a choice on the commonest case of all.
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
    {'name': 'Medical Profiles', 'url': '/medical/profiles/', 'icon': 'medical/icons/profile.svg', 'module_key': 'medical_profiles'},
    {'name': 'Medical Log', 'url': '/medical/log/', 'icon': 'medical/icons/log.svg', 'module_key': 'medical_log'},
    {'name': 'Immunisations', 'url': '/medical/immunisations/', 'icon': 'medical/icons/immunisation.svg', 'module_key': 'medical_immunisations'},
    {'name': 'Medical Stock', 'url': '/medical/stock/', 'icon': 'medical/icons/stock.svg', 'module_key': 'medical_stock'},
]


def _hub_context(request):
    return hub_context(request, MEDICAL_MENU, 'Medical')


def medical_hub(request):
    return render(request, 'hubs/medical/hub.html', _hub_context(request))


def medical_profiles(request):
    return render(request, 'hubs/medical/profiles.html', _hub_context(request))


def medical_log(request):
    return render(request, 'hubs/medical/log.html', _hub_context(request))


def medical_immunisations(request):
    return render(request, 'hubs/medical/immunisations.html', _hub_context(request))


def medical_stock(request):
    return render(request, 'hubs/medical/stock.html', _hub_context(request))
