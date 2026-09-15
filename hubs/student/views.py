from django.shortcuts import render

from core.hub_context import hub_context
from core.models import Student

STUDENT_MENU = [
    {'name': 'Student Dashboard', 'url': '/student/dashboard/', 'icon': 'student/icons/dashboard_gauge.svg', 'module_key': 'student_dashboard'},
    {'name': 'Student Profile', 'url': '/student/profile/', 'icon': 'student/icons/student_id.svg', 'module_key': 'student_profile'},
    {'name': 'Progress Tracker', 'url': '/student/progress-tracker/', 'icon': 'student/icons/progress_trend.svg', 'module_key': 'student_progress_tracker'},
    {'name': 'Standards & Equipment', 'url': '/student/standards-equipment/', 'icon': 'resources/icons/equipment.svg', 'module_key': 'student_standards_equipment'},
    {'name': 'Pastoral Tracker', 'url': '/student/pastoral-tracker/', 'icon': 'student/icons/pastoral.svg', 'module_key': 'student_pastoral_tracker'},
    # Consent covers everything a parent agrees to about a student - medicines,
    # photographs, trips, internet use, biometrics - which is why it sits here
    # rather than in the hub that happened to need it first. It started as a
    # page in hubs.medical, and a medical-only consent page would have been a
    # second model of a shape the student record already needed; it also has
    # nothing to say about the staff half of that hub, since consent here is
    # parental. The model belongs in core, not in this app, for the reason
    # core.SafeguardingNote ended up there (#77-#81): more than one hub reads
    # it, and the Medical hub surfaces the medical-kind consents on a profile
    # so a first-aider can check one at the point of care.
    {'name': 'Consent', 'url': '/student/consent/', 'icon': 'student/icons/consent.svg', 'module_key': 'student_consent'},
]


def _hub_context(request):
    return hub_context(request, STUDENT_MENU, 'Student')


def student_hub(request):
    return render(request, 'hubs/student/hub.html', _hub_context(request))


def student_dashboard(request):
    return render(request, 'hubs/student/dashboard.html', _hub_context(request))


def student_profile(request):
    # No auth/session yet, so there's no "current student" - show the first
    # active record as a stand-in until login is wired up.
    return render(request, 'hubs/student/profile.html', {
        **_hub_context(request),
        'student': Student.objects.filter(is_active=True).select_related('form_tutor').first(),
    })


def student_progress_tracker(request):
    return render(request, 'hubs/student/progress_tracker.html', _hub_context(request))


def student_feedback_dashboard(request):
    return render(request, 'hubs/student/feedback_dashboard.html', _hub_context(request))


def student_standards_equipment(request):
    return render(request, 'hubs/student/standards_equipment.html', _hub_context(request))


def student_pastoral_tracker(request):
    return render(request, 'hubs/student/pastoral_tracker.html', _hub_context(request))


def student_consent(request):
    return render(request, 'hubs/student/consent.html', _hub_context(request))
