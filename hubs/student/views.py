from django.shortcuts import render

from core.models import Student

STUDENT_MENU = [
    {'name': 'Student Dashboard', 'url': '/student/dashboard/', 'icon': 'icons/dashboard_svg.html'},
    {'name': 'Student Profile', 'url': '/student/profile/', 'icon': 'icons/dashboard_svg.html'},
    {'name': 'Progress Tracker', 'url': '/student/progress-tracker/', 'icon': 'icons/reports_svg.html'},
    {'name': 'Standards & Equipment', 'url': '/student/standards-equipment/', 'icon': 'icons/registers_svg.html'},
    {'name': 'Pastoral Tracker', 'url': '/student/pastoral-tracker/', 'icon': 'icons/reports_svg.html'},
]


def student_hub(request):
    return render(request, 'hubs/student/hub.html', {'local_menu': STUDENT_MENU, 'hub_title': 'Student'})


def student_dashboard(request):
    return render(request, 'hubs/student/dashboard.html', {'local_menu': STUDENT_MENU, 'hub_title': 'Student'})


def student_profile(request):
    # No auth/session yet, so there's no "current student" - show the first
    # active record as a stand-in until login is wired up.
    return render(request, 'hubs/student/profile.html', {
        'local_menu': STUDENT_MENU,
        'hub_title': 'Student',
        'student': Student.objects.filter(is_active=True).select_related('form_tutor').first(),
    })


def student_progress_tracker(request):
    return render(request, 'hubs/student/progress_tracker.html', {'local_menu': STUDENT_MENU, 'hub_title': 'Student'})


def student_feedback_dashboard(request):
    return render(request, 'hubs/student/feedback_dashboard.html', {'local_menu': STUDENT_MENU, 'hub_title': 'Student'})


def student_standards_equipment(request):
    return render(request, 'hubs/student/standards_equipment.html', {'local_menu': STUDENT_MENU, 'hub_title': 'Student'})


def student_pastoral_tracker(request):
    return render(request, 'hubs/student/pastoral_tracker.html', {'local_menu': STUDENT_MENU, 'hub_title': 'Student'})
