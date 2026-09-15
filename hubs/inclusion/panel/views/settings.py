"""The Admin area: referral questions, action categories, preset reasons, panel groups and expertise.

Named for the URL prefix these pages sit behind (/inclusion/panel/settings/).
Unrelated to django.conf.settings, which absolute imports keep distinct.
"""

from django.db.models import Max
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from core.identity import current_school_key, current_staff as _current_staff
from core.models import School

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import form_actions, lifecycle, reasons
from ..models import (
    ActionCategory,
    Expertise,
    ExternalContact,
    PanelGroup,
    PanelGroupMember,
    PresetReason,
    ReferralCategory,
    ReferralQuestion,
)

from .base import ACTION_CATEGORY_PRESETS, _panel_base_context
from .shared import _safe_next

def inclusion_panel_referral_question_settings(request):
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        action = request.POST.get('form_action')
        if action == form_actions.ADD_CATEGORY:
            next_order = (ReferralCategory.objects.aggregate(Max('order'))['order__max'] or 0) + 1
            ReferralCategory.objects.create(name=request.POST.get('name', ''), order=next_order)
        elif action == form_actions.ADD_QUESTION:
            category_id = request.POST.get('category') or None
            next_order = (
                ReferralQuestion.objects.filter(category_id=category_id).aggregate(Max('order'))['order__max'] or 0
            ) + 1 if category_id else (
                ReferralQuestion.objects.filter(category__isnull=True).aggregate(Max('order'))['order__max'] or 0
            ) + 1
            ReferralQuestion.objects.create(
                category_id=category_id,
                label=request.POST.get('label', ''),
                order=next_order,
            )
        elif action == form_actions.DEACTIVATE_CATEGORY:
            ReferralCategory.objects.filter(pk=request.POST.get('category_id')).update(is_active=False)
        elif action == form_actions.DEACTIVATE_QUESTION:
            ReferralQuestion.objects.filter(pk=request.POST.get('question_id')).update(is_active=False)
            if is_ajax:
                return JsonResponse({'success': True})
        return redirect('inclusion_panel_referral_question_settings')

    categories = ReferralCategory.objects.filter(is_active=True).prefetch_related('questions')
    flat_questions = ReferralQuestion.objects.filter(category__isnull=True, is_active=True).order_by('order')
    return render(request, 'hubs/inclusion/panel/referral_question_settings.html', {
        **_panel_base_context(request),
        'categories': categories,
        'flat_questions': flat_questions,
    })


def inclusion_panel_action_category_settings(request):
    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == form_actions.ADD_CATEGORY:
            next_order = (ActionCategory.objects.aggregate(Max('order'))['order__max'] or 0) + 1
            ActionCategory.objects.create(
                name=request.POST.get('name', ''),
                order=next_order,
                auto_assign_job_title=request.POST.get('auto_assign_job_title', ''),
                is_sensitive=bool(request.POST.get('is_sensitive')),
            )
        elif action == form_actions.ADD_PRESET_CATEGORY:
            name = request.POST.get('name', '')
            if name in ACTION_CATEGORY_PRESETS and not ActionCategory.objects.filter(name__iexact=name).exists():
                next_order = (ActionCategory.objects.aggregate(Max('order'))['order__max'] or 0) + 1
                ActionCategory.objects.create(name=name, order=next_order)
        elif action == form_actions.DEACTIVATE_CATEGORY:
            ActionCategory.objects.filter(pk=request.POST.get('category_id')).update(is_active=False)
        return redirect('inclusion_panel_action_category_settings')

    existing_names = set(ActionCategory.objects.values_list('name', flat=True))
    missing_presets = [name for name in ACTION_CATEGORY_PRESETS if name not in existing_names]
    return render(request, 'hubs/inclusion/panel/action_category_settings.html', {
        **_panel_base_context(request),
        'categories': ActionCategory.objects.filter(is_active=True),
        'missing_presets': missing_presets,
    })


# Where each PresetReason context's rows actually surface, shown on the
# settings page above that context's own list. The label on PresetReason
# names the context; this says which screen an admin's edit will change,
# which is the thing they can't work out from the name alone.
PRESET_REASON_BLURBS = {
    PresetReason.CONTEXT_ESCALATION:
        'Offered on the Escalate to MAT form, above its "Other" free-text box.',
    PresetReason.CONTEXT_MEMBER_DEACTIVATION:
        'Asked for when a member is taken off a Panel Group\'s roster, in the Edit Panel Group modal.',
}


def inclusion_panel_preset_reason_settings(request):
    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == form_actions.ADD_PRESET_REASON:
            context = request.POST.get('context', '')
            text = request.POST.get('text', '').strip()
            if text and context in dict(PresetReason.CONTEXT_CHOICES):
                next_order = (
                    PresetReason.objects.filter(context=context).aggregate(Max('order'))['order__max'] or 0
                ) + 1
                PresetReason.objects.create(context=context, text=text, order=next_order)
        elif action == form_actions.DEACTIVATE_PRESET_REASON:
            PresetReason.objects.filter(pk=request.POST.get('reason_id')).update(is_active=False)
        return redirect('inclusion_panel_preset_reason_settings')

    return render(request, 'hubs/inclusion/panel/preset_reason_settings.html', {
        **_panel_base_context(request),
        # One section per context rather than one flat list with a context
        # column: a preset only means anything next to the form it appears
        # on, and adding one has to pick a context anyway - per-section Add
        # forms carry it in a hidden field instead of asking again.
        'context_groups': [
            {
                'key': key,
                'label': label,
                'blurb': PRESET_REASON_BLURBS[key],
                'presets': PresetReason.objects.for_context(key),
            }
            for key, label in PresetReason.CONTEXT_CHOICES
        ],
    })


def inclusion_panel_group_settings(request):
    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == form_actions.DEACTIVATE_GROUP:
            PanelGroup.objects.filter(pk=request.POST.get('group_id')).update(is_active=False)
        return redirect('inclusion_panel_group_settings')

    groups = list(
        PanelGroup.objects.filter(is_active=True).select_related('school', 'default_chair').prefetch_related(
            'members'
        )
    )
    for group in groups:
        group.active_member_count = sum(1 for m in group.members.all() if m.is_active)

    return render(request, 'hubs/inclusion/panel/panel_group_settings.html', {
        **_panel_base_context(request),
        'groups': groups,
    })


# Every way back onto a roster clears the same three fields together - a
# member who is active again has no deactivation left to describe, and a
# half-cleared one would have the roster reading "Deactivated by nobody".
_CLEARED_DEACTIVATION = {'deactivated_at': None, 'deactivated_by': None, 'deactivation_reason': ''}


def _group_member_sort_key(member):
    if member.staff_id:
        return (member.staff.last_name, member.staff.first_name)
    return (str(member.external_contact or ''), '')


def _resolve_concrete_school(request):
    # A concrete single school - as opposed to the sidebar switcher sitting on
    # an aggregate view ('all'/'primary'/'secondary') - is the only case a
    # new Panel Group's school can be inferred silently. Aggregate views fall
    # through to showing the School field so the user picks one explicitly.
    key = current_school_key(request)
    if key in ('all', 'primary', 'secondary'):
        return None
    return School.objects.filter(pk=key, is_active=True).first()


def inclusion_panel_group_edit(request, group_id=None):
    group = get_object_or_404(PanelGroup, pk=group_id) if group_id else None
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        if group is None:
            name = request.POST.get('name', '').strip()
            school_id = request.POST.get('school') or None
            if not school_id:
                if is_ajax:
                    return JsonResponse({'success': False})
                return redirect('inclusion_panel_group_settings')
            if PanelGroup.objects.filter(is_active=True, name__iexact=name, school_id=school_id).exists():
                if is_ajax:
                    return JsonResponse({'success': False})
                return redirect('inclusion_panel_group_settings')
            group = PanelGroup.objects.create(name=name, school_id=school_id)
            if is_ajax:
                return JsonResponse({
                    'success': True,
                    'group': {
                        'id': group.id, 'name': group.name, 'school_id': group.school_id,
                        'school_name': group.school.name if group.school_id else None,
                    },
                })
            return redirect('inclusion_panel_group_settings')

        action = request.POST.get('form_action')
        if action == form_actions.UPDATE_GROUP_NAME:
            name = request.POST.get('name', '').strip()
            duplicate = not name or PanelGroup.objects.filter(
                is_active=True, name__iexact=name, school_id=group.school_id,
            ).exclude(pk=group.pk).exists()
            if duplicate:
                if is_ajax:
                    return JsonResponse({'success': False})
                return redirect(_safe_next(request, 'inclusion_panel_group_settings'))
            group.name = name
            group.save(update_fields=['name'])
        elif action == form_actions.UPDATE_GROUP_CHAIR:
            group.default_chair_id = request.POST.get('default_chair') or None
            group.save(update_fields=['default_chair'])
        elif action == form_actions.UPDATE_MEMBER_EXPERTISE:
            member = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group=group)
            member.expertise_id = request.POST.get('expertise') or None
            member.save(update_fields=['expertise'])
        elif action == form_actions.ADD_GROUP_MEMBER:
            staff_id = request.POST.get('staff') or None
            external_contact_id = request.POST.get('external_contact') or None
            expertise_id = request.POST.get('expertise') or None
            if staff_id:
                PanelGroupMember.objects.update_or_create(
                    panel_group=group, staff_id=staff_id,
                    defaults={
                        'expertise_id': expertise_id, 'external_contact_id': None,
                        'is_active': True, **_CLEARED_DEACTIVATION,
                    },
                )
            elif external_contact_id:
                PanelGroupMember.objects.update_or_create(
                    panel_group=group, external_contact_id=external_contact_id,
                    defaults={'expertise_id': expertise_id, 'is_active': True, **_CLEARED_DEACTIVATION},
                )
        elif action == form_actions.TOGGLE_GROUP_MEMBER_ACTIVE:
            member = get_object_or_404(PanelGroupMember, pk=request.POST.get('member_id'), panel_group=group)
            member.is_active = not member.is_active
            if member.is_active:
                for field, value in _CLEARED_DEACTIVATION.items():
                    setattr(member, field, value)
            else:
                member.deactivated_at = timezone.now()
                member.deactivated_by = _current_staff(request)
                # Blank only if the client somehow posted no reason - the
                # deactivate step's own dropdown is `required`, and the
                # roster reads a missing reason as an em dash rather than
                # refusing the deactivation over it.
                member.deactivation_reason = reasons.reason_from_post(request.POST)
            member.save()
            if not member.is_active and member.staff_id:
                if group.default_chair_id == member.staff_id:
                    group.default_chair = None
                    group.save()
                # A panel's roster is this same live group, so a panel can't
                # keep pointing chair at someone just deactivated from it -
                # except a completed or void panel, whose chair is a
                # historical record that shouldn't change after the fact.
                group.panels.filter(chair_id=member.staff_id).exclude(status__in=lifecycle.PANEL_ENDED_STATUSES).update(chair=None)
        if is_ajax:
            return JsonResponse({'success': True})
        return redirect(_safe_next(request, 'inclusion_panel_group_settings'))

    if group is None:
        school_id = request.GET.get('school')
        preselect_school = School.objects.filter(pk=school_id).first() if school_id else None
        if preselect_school is None:
            preselect_school = _resolve_concrete_school(request)
        return render(request, 'hubs/inclusion/panel/_panel_group_form_modal.html', {
            **_panel_base_context(request),
            'group': None,
            'schools': School.objects.filter(is_active=True),
            'preselect_school_id': preselect_school.id if preselect_school else '',
            'preselect_school_name': preselect_school.name if preselect_school else '',
            'existing_groups': list(PanelGroup.objects.filter(is_active=True).values('name', 'school_id')),
        })

    members = list(
        group.members.select_related('staff', 'external_contact', 'expertise', 'deactivated_by').all()
    )
    members.sort(key=_group_member_sort_key)
    active_members = [m for m in members if m.is_active]
    inactive_members = [m for m in members if not m.is_active]

    return render(request, 'hubs/inclusion/panel/_panel_group_form_modal.html', {
        **_panel_base_context(request),
        'group': group,
        'active_members': active_members,
        'inactive_members': inactive_members,
        'chair_choices': [m for m in active_members if m.staff_id],
        'existing_staff_ids': {m.staff_id for m in active_members if m.staff_id},
        'existing_external_ids': {m.external_contact_id for m in active_members if m.external_contact_id},
        'available_expertise': Expertise.objects.visible_for_school(group.school_id),
        'deactivation_reason_presets': PresetReason.objects.for_context(
            PresetReason.CONTEXT_MEMBER_DEACTIVATION
        ),
        'existing_groups': list(
            PanelGroup.objects.filter(is_active=True).exclude(pk=group.pk).values('name', 'school_id')
        ),
        'next': request.GET.get('next', ''),
    })


def inclusion_panel_expertise_settings(request):
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        action = request.POST.get('form_action')
        if action == form_actions.ADD_EXPERTISE:
            name = request.POST.get('name', '').strip()
            next_order = (Expertise.objects.aggregate(Max('order'))['order__max'] or 0) + 1
            expertise = Expertise.objects.create(name=name, order=next_order)
            if is_ajax:
                return JsonResponse({'success': True, 'expertise': {'id': expertise.id, 'name': expertise.name}})
        elif action == form_actions.DEACTIVATE_EXPERTISE:
            Expertise.objects.filter(pk=request.POST.get('expertise_id')).update(is_active=False)
            if is_ajax:
                return JsonResponse({'success': True})
        return redirect('inclusion_panel_expertise_settings')

    return render(request, 'hubs/inclusion/panel/expertise_settings.html', {
        **_panel_base_context(request),
        'expertise_list': Expertise.objects.filter(is_active=True).select_related('school'),
    })


def inclusion_panel_expertise_quick_add(request):
    if request.method != 'POST':
        return JsonResponse({'success': False}, status=405)
    name = request.POST.get('name', '').strip()
    school_id = request.POST.get('school_id') or None
    if not name:
        return JsonResponse({'success': False})
    next_order = (Expertise.objects.aggregate(Max('order'))['order__max'] or 0) + 1
    expertise = Expertise.objects.create(name=name, order=next_order, school_id=school_id)
    return JsonResponse({'success': True, 'expertise': {'id': expertise.id, 'name': expertise.name}})


def inclusion_panel_external_contact_quick_add(request):
    if request.method != 'POST':
        return JsonResponse({'success': False}, status=405)
    name = request.POST.get('name', '').strip()
    job_title = request.POST.get('job_title', '').strip()
    if not name:
        return JsonResponse({'success': False})
    contact = ExternalContact.objects.create(name=name, job_title=job_title)
    return JsonResponse({
        'success': True,
        'contact': {'id': contact.id, 'name': contact.name, 'job_title': contact.job_title},
    })
