"""The sidebar menu and the base context every Inclusion Panel page renders with.

Every other module in this package renders through _panel_base_context, which is
why it sits on its own at the bottom of the import graph rather than inside the
module of whichever page happened to need it first.
"""

from core.identity import current_staff as _current_staff
from core.hub_context import hub_context

PANEL_MENU = [
    {'name': 'Home', 'url': '/inclusion/panel/', 'icon': 'img/icons/portal/house.svg', 'module_key': 'inclusion_panel'},
    {'name': 'Students', 'url': '/inclusion/panel/students/', 'icon': 'student/icons/student_single.svg', 'module_key': 'inclusion_panel_students'},
    {'name': 'Referrals', 'url': '/inclusion/panel/referrals/', 'icon': 'inclusion/icons/document.svg', 'module_key': 'inclusion_panel_referrals'},
    {'name': 'Actions', 'url': '/inclusion/panel/actions/', 'icon': 'img/icons/ui/checkmark.svg', 'module_key': 'inclusion_panel_actions'},
    {'name': 'Panel Meetings', 'url': '/inclusion/panel/meetings/', 'icon': 'img/icons/ui/clock.svg', 'module_key': 'inclusion_panel_meetings'},
    {'name': 'Escalations', 'url': '/inclusion/panel/escalations/', 'icon': 'inclusion/icons/escalate_tray.svg', 'module_key': 'inclusion_panel_escalations'},
    {'name': 'Admin', 'url': '/inclusion/panel/settings/referral-questions/', 'icon': 'registers/icons/registers.svg', 'module_key': 'inclusion_panel_settings'},
]


def _panel_base_context(request):
    # Shared sidebar context for every page inside the Inclusion Panel sub-app.
    # "Safeguarding Notes" is appended here (not a PANEL_MENU entry) because
    # its visibility gate is Staff.is_dsl directly, not the Module system
    # every other entry uses via filter_by_module - a DSL may hold no Panel
    # Group seat at all, so it can't ride the usual module-key gate (see #71
    # grilling). Renamed from "Safeguarding Briefings" alongside the page
    # itself (#84) - this is a hardcoded string, not Module.name-driven, so
    # the rename was this one line; the URL path/name were renamed to match
    # separately in #85.
    context = hub_context(
        request,
        PANEL_MENU,
        'Inclusion Panel',
        back_to_hub_url='/inclusion/',
        back_to_hub_label='SEND & Provision',
    )
    local_menu = context['local_menu']
    current_staff = _current_staff(request)
    if current_staff and current_staff.is_dsl:
        # Inserted right after Students (not appended) - a DSL reaches for
        # this alongside the other student-scoped lookup, ahead of the
        # casework/workflow items (Referrals/Actions/Meetings/Escalations).
        insert_at = next(
            (i + 1 for i, item in enumerate(local_menu) if item['module_key'] == 'inclusion_panel_students'),
            len(local_menu),
        )
        local_menu = local_menu[:insert_at] + [{
            'name': 'Safeguarding Notes',
            'url': '/inclusion/panel/safeguarding-notes/',
            'icon': 'inclusion/icons/shield_check.svg',
        }] + local_menu[insert_at:]
    context['local_menu'] = local_menu
    return context


ACTION_CATEGORY_PRESETS = ['Parent Meeting', 'Intervention', 'Other']
