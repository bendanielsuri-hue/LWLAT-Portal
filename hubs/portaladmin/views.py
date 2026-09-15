from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from core.hub_context import hub_context
from core.identity import current_staff
from core.models import CategorySettings, MatSettings, Module, School
from core.portal_settings import FIELDS

PORTALADMIN_MENU = [
    {'name': 'Dashboard', 'url': '/portal-admin/', 'icon': 'student/icons/dashboard.svg'},
    {'name': 'Themes', 'url': '/portal-admin/themes/', 'icon': 'img/icons/portal/cog.svg'},
]


def _hub_context(request):
    # Neither entry above carries a module_key, so nothing here is
    # module-gated - this hub's gate is the is_developer check each view does
    # for itself. Going through the shared helper anyway keeps the shape
    # identical to every other hub and makes a gated entry a one-key change.
    return hub_context(request, PORTALADMIN_MENU, 'Portal Admin')


def _apply_fields(instance, post):
    for field in FIELDS:
        setattr(instance, field, post.get(field, ''))


def portaladmin_home(request):
    # Lightweight, non-secure role check — same pattern as
    # hubs.inclusion.views._is_panel_staff. Not real security (no auth exists
    # per CLAUDE.md), but stops this rollout-mutating page rendering for anyone
    # who isn't the seeded developer.
    staff = current_staff(request)
    if not (staff and staff.is_developer):
        return redirect('homepage')

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == 'update_module':
            module = get_object_or_404(Module, pk=request.POST.get('module_id'))
            module.name = request.POST.get('name', module.name)
            module.status = request.POST.get('status', module.status)
            module.save()
            module.pilot_schools.set(request.POST.getlist('pilot_schools'))
        elif action == 'update_mat_settings':
            mat, _ = MatSettings.objects.get_or_create(pk=1)
            _apply_fields(mat, request.POST)
            mat.save()
        elif action == 'update_category_settings':
            category = request.POST.get('category')
            category_row, _ = CategorySettings.objects.get_or_create(category=category)
            _apply_fields(category_row, request.POST)
            category_row.save()
        elif action == 'update_school_settings':
            school = get_object_or_404(School, pk=request.POST.get('school_id'))
            _apply_fields(school, request.POST)
            school.save()
        # AJAX proof-of-concept for the footer's generic status indicator
        # (#128) - same X-Requested-With convention main.js's dashboard
        # filter fetch() already uses. Plain form posts (no JS/old browser)
        # still work via the redirect fallback.
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'status': 'ok'})
        return redirect('portaladmin_home')

    mat_settings, _ = MatSettings.objects.get_or_create(pk=1)
    category_settings = {row.category: row for row in CategorySettings.objects.all()}
    return render(request, 'hubs/portaladmin/home.html', {
        **_hub_context(request),
        'modules': Module.objects.select_related('parent').prefetch_related('pilot_schools'),
        'schools': School.objects.filter(is_active=True),
        'mat_settings': mat_settings,
        'primary_settings': category_settings.get('Primary'),
        'secondary_settings': category_settings.get('Secondary'),
        'status_choices': Module.STATUS_CHOICES,
        'accent_choices': School._meta.get_field('accent_colour').choices,
    })


def portaladmin_themes(request):
    # Same lightweight, non-secure role check as portaladmin_home.
    staff = current_staff(request)
    if not (staff and staff.is_developer):
        return redirect('homepage')

    return render(request, 'hubs/portaladmin/themes.html', {
        **_hub_context(request),
    })
