"""Actions: the dashboard, Add Action, and the two status-update endpoints."""

import datetime

from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    is_aggregate_school_key,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import AcademicYear
from core.dashboard_filters import Filter, FilterSet, equals
from core.term_dates import next_half_term, next_term

from .. import form_actions
from ..models import Action, ActionUpdate, InclusionReferral, ReferralQuestion

from .base import _panel_base_context
from .shared import (
    _is_panel_staff,
    _next_term_option,
    _paginate_for_infinite_scroll,
    _referral_escalation_pill,
    _referral_review_pill,
    _safe_next,
    _term_choices_and_ranges,
    _token_name_filter,
    visible_actions_for,
    visible_categories_for,
)
from .home import _my_actions_context

# The Actions dashboard's filters. `due` is the one that isn't a field
# match: it consolidates the old separate Overdue Only / Due This Week
# toggles into one dropdown of relative date tiers (issue #13), each
# resolved against today at request time.
def _due_window(qs, value, values):
    today = timezone.localdate()
    week_start = today - datetime.timedelta(days=today.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    if value == 'overdue':
        return qs.filter(status='incomplete', due_date__lt=today)
    if value == 'today':
        return qs.filter(due_date=today)
    if value == 'this_week':
        return qs.filter(due_date__gte=week_start, due_date__lte=week_end)
    if value == 'next_week':
        return qs.filter(
            due_date__gte=week_start + datetime.timedelta(days=7),
            due_date__lte=week_end + datetime.timedelta(days=7),
        )
    if value == 'no_due_date':
        return qs.filter(due_date__isnull=True)
    return qs


ACTION_FILTERS = FilterSet(
    Filter(
        'student',
        apply=lambda qs, v, vals: qs.filter(referral__student_id=int(v)),
        active=lambda v: v.isdigit(),
        counts=lambda v: False,
        context_value=lambda v: int(v) if v.isdigit() else '',
    ),
    Filter(
        'name',
        apply=lambda qs, v, vals: qs.filter(_token_name_filter(
            v.split(), 'referral__student__first_name', 'referral__student__last_name',
            'referral__student__admission_number',
        )),
        superseded_by=('student',),
    ),
    Filter('category', equals('category_id')),
    Filter('assigned', apply=lambda qs, v, vals: (
        qs.filter(assigned_to_staff__isnull=True) if v == 'unassigned'
        else qs.filter(assigned_to_staff_id=v)
    )),
    # Who raised the referral this action belongs to - not the action's own
    # Assigned To (who is doing the task).
    Filter('referred_by', apply=lambda qs, v, vals: (
        qs.filter(referral__raised_by__isnull=True) if v == 'unassigned'
        else qs.filter(referral__raised_by_id=v)
    )),
    # Same derived (not stored) lookup as the Referrals dashboard's own
    # concern filter - see InclusionReferral.primary_concern_category.
    Filter('concern', apply=lambda qs, v, vals: qs.filter(
        referral__responses__question__label='Main Concern Category',
        referral__responses__answer=v,
    )),
    Filter('status', equals('status')),
    Filter('due', apply=_due_window),
    Filter('academic_year'),
    Filter('term'),
    # Group Info: the referred student's own cohort fields, same params and
    # choices as the Students dashboard's own Group Info group.
    Filter('year', equals('referral__student__year_group')),
    Filter('house', equals('referral__student__house')),
    Filter('reg', equals('referral__student__reg_form')),
)


def inclusion_panel_actions(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)
    is_aggregate_view = is_aggregate_school_key(school_key)
    current_staff = _current_staff(request)
    today = timezone.localdate()
    week_start = today - datetime.timedelta(days=today.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    next_week_start = week_start + datetime.timedelta(days=7)
    next_week_end = week_end + datetime.timedelta(days=7)

    filters = ACTION_FILTERS.bind(request)
    academic_year_filter = filters['academic_year']
    term_filter = filters['term']

    scoped_students = student_queryset_for_school_key(school_key)
    # Option lists computed from the school-scoped set, before the filters
    # below are applied - same convention as inclusion_panel_students' own
    # years/forms/forms_by_year/houses (views.py, above).
    years = sorted({y for y in scoped_students.values_list('year_group', flat=True) if y is not None})
    forms = sorted({f for f in scoped_students.values_list('reg_form', flat=True) if f})
    forms_by_year = {
        year: sorted({
            f for f in scoped_students.filter(year_group=year).values_list('reg_form', flat=True) if f
        })
        for year in years
    }
    houses = sorted({h for h in scoped_students.values_list('house', flat=True) if h})
    has_houses = bool(houses)

    actions_qs = Action.objects.filter(referral__student__in=scoped_students).select_related(
        'referral__student', 'referral__student__school', 'referral__raised_by',
        'assigned_to_staff', 'category', 'created_by',
    ).prefetch_related('referral__panel_referrals', 'referral__escalations', 'referral__responses__question')
    actions_qs = visible_actions_for(current_staff, actions_qs)
    categories = visible_categories_for(current_staff)

    academic_years_present = {
        ay.id: ay for ay in AcademicYear.objects.filter(actions__in=actions_qs).distinct()
    }
    academic_year_choices = [
        (ay.id, ay.label)
        for ay in sorted(academic_years_present.values(), key=lambda ay: ay.start_date, reverse=True)
    ]
    # No default academic year applied on first load - same #121 follow-up
    # call as inclusion_panel_meetings'/inclusion_panel_referrals' own
    # identical comment. current_academic_year is still exposed to the
    # template (highlighting "today's" year in the dropdown) even though it
    # no longer drives a default filter.
    current_academic_year = AcademicYear.for_date(today).id
    if academic_year_filter and not any(str(year) == academic_year_filter for year, _ in academic_year_choices):
        academic_year_filter = filters.set_value('academic_year', '')
    if academic_year_filter:
        actions_qs = actions_qs.filter(academic_year_id=academic_year_filter)

    # Term filter (#121 follow-up applied to Actions too - live feedback:
    # "add Term to Actions and referrals like meeting page") - see
    # _term_choices_and_ranges' own comment for the school-override lookup.
    school_ids_for_terms = list(scoped_students.order_by().values_list('school_id', flat=True).distinct())
    term_filter, term_choices, terms_by_academic_year, term_q = _term_choices_and_ranges(
        visible_actions_for(current_staff, Action.objects.filter(referral__student__in=scoped_students)),
        school_ids_for_terms, academic_years_present.keys(), term_filter, academic_year_filter,
        'created_at', 'referral__student__school_id',
    )
    if term_q is not None:
        actions_qs = actions_qs.filter(term_q)

    actions_qs = filters.narrow(actions_qs)
    # distinct() - concern_filter above joins across referral__responses, a
    # reverse multi-valued relation, which can otherwise fan out one Action
    # into duplicate rows the same way referrals_qs' own multi-valued joins
    # do (inclusion_panel_referrals, above).
    actions_qs = actions_qs.distinct()

    # Totals for the stats-strip - computed against the full filtered
    # queryset before pagination slices it down, same convention as
    # inclusion_panel_students'/inclusion_panel_referrals' own totals
    # (views.py, above).
    total_actions_count = actions_qs.count()
    total_students_count = actions_qs.values('referral__student_id').distinct().count()
    total_referrals_count = actions_qs.values('referral_id').distinct().count()

    # ACTIONS_PAGE_SIZE actions per page (infinite scroll, wired via
    # initListPage in actions.js - shared with Students/Referrals, above) -
    # only this page's actions go through the per-row lookups below.
    ACTIONS_PAGE_SIZE = 50
    page_obj, page_number, is_continuation = _paginate_for_infinite_scroll(
        actions_qs, request, is_ajax, ACTIONS_PAGE_SIZE
    )
    actions = list(page_obj.object_list)

    # Row-detail candidates (issue #12): title row + facts row + an
    # Overdue callout pill. concern_category (#119 follow-up, "Student >
    # Referral > Action" 3-section row) is the same per-row lookup
    # inclusion_panel_referrals' own loop already does for the Referrals
    # list (InclusionReferral.primary_concern_category) - same convention, backed by
    # actions_qs' own 'referral__responses__question' prefetch above so
    # this loop doesn't re-query per row.
    for action in actions:
        action.is_overdue = action.status == 'incomplete' and action.due_date is not None and action.due_date < today
        action.days_overdue = (today - action.due_date).days if action.is_overdue else 0
        # Title-line pill, every action now (live feedback: "have a due
        # countdown pill so its never blank" for Incomplete, then "let's see
        # the status pill as well" once Complete/Not Required actions turned
        # out to still render with nothing next to their category - a
        # completed action has no due countdown left to show, but it still
        # deserves *some* pill there). Incomplete gets the 3-tier due
        # countdown - same semantics/classes Referral.status already uses
        # for its own "how urgent is the follow-up" pill
        # (review_scheduled/awaiting_review/overdue_review, see that
        # model's docstring) rather than inventing new colours: overdue is
        # red, due within 2 days is amber, anything further out is neutral.
        # Complete/Not Required have no due date left to count down, so they
        # fall back to their own plain status pill instead (status-pill
        # complete/not_needed, already styled - pills.css) - this is
        # deliberately NOT the same thing as the dropped plain-status-pill-
        # on-every-action idea from #119 ("it duplicated the live segmented
        # status changer... same status shown twice"): that objection was
        # about Incomplete specifically, which still has the live segmented
        # control right there to compare against; Complete/Not Required
        # showing their own status here isn't a duplicate of anything else
        # on the row in the same way.
        action.title_pill_label = None
        action.title_pill_class = None
        if action.status == 'incomplete' and action.due_date is not None:
            if action.is_overdue:
                action.title_pill_label = f'Overdue {action.days_overdue}d'
                action.title_pill_class = 'overdue_review'
            else:
                days_until_due = (action.due_date - today).days
                if days_until_due <= 2:
                    action.title_pill_label = 'Due today' if days_until_due == 0 else f'Due in {days_until_due}d'
                    action.title_pill_class = 'awaiting_review'
                else:
                    action.title_pill_label = f'Due in {days_until_due}d'
                    action.title_pill_class = 'review_scheduled'
        elif action.status in ('complete', 'not_needed'):
            action.title_pill_label = action.get_status_display()
            action.title_pill_class = action.status
        # Referral's own review pill (New Referral/Nth Review/Closed) next
        # to its status pill in the facts strip's Referral/Status column
        # (live feedback: "add the other Referral status pill after
        # Status on the Actions page") - same pill Referrals' own row shows
        # (_referral_review_pill, shared with inclusion_panel_referrals).
        action.referral.review_pill_label, action.referral.review_pill_class = _referral_review_pill(action.referral)
        action.referral.escalation_pill_label, action.referral.escalation_pill_class = _referral_escalation_pill(action.referral)


    concern_question = ReferralQuestion.objects.filter(label='Main Concern Category', is_active=True).first()

    context = {
        **_panel_base_context(request),
        'actions': actions,
        'actions_list_url': reverse('inclusion_panel_actions'),
        'categories': categories,
        'staff_list': staff_queryset_for_school_key(school_key),
        'status_choices': Action.STATUS_CHOICES,
        'today': today,
        'week_start': week_start,
        'week_end': week_end,
        **filters.context,
        'concern_choices': concern_question.choice_list() if concern_question else [],
        'academic_year_choices': academic_year_choices,
        'term_choices': term_choices,
        # Raw dicts for json_script (actions.js reads them as data
        # islands, not the escapejs-in-a-string-literal convention the
        # inline <script> used before #210).
        'terms_by_academic_year': terms_by_academic_year,
        'years': years,
        'forms': forms,
        'forms_by_year': forms_by_year,
        'has_houses': has_houses,
        'houses': houses,
        'active_filter_count': filters.active_count,
        'actions_count': total_actions_count,
        'students_count': total_students_count,
        'referrals_count': total_referrals_count,
        'is_aggregate_view': is_aggregate_view,
        'page_obj': page_obj,
    }
    if page_obj.has_next():
        next_params = request.GET.copy()
        next_params['page'] = page_number + 1
        context['next_page_url'] = request.path + '?' + next_params.urlencode()
    if is_continuation:
        template = 'hubs/inclusion/panel/_actions_rows.html'
    elif is_ajax:
        template = 'hubs/inclusion/panel/_actions_filtered_content.html'
    else:
        template = 'hubs/inclusion/panel/actions.html'
    return render(request, template, context)


def _updates_with_can_edit(action, current_staff):
    updates = list(action.updates.visible().select_related('author'))
    for update in updates:
        update.can_edit = update.author_id == current_staff.id
    return updates


def inclusion_panel_action_new(request, referral_id):
    # Add Action is a 2-step modal (details, then Assign - see #98): this is
    # now the only caller of _action_form_modal.html, fetched into
    # Discussion's shared #action-form-dialog shell (see openActionFormModal
    # in panel.js), same fetch-fragment-into-a-page-level-<dialog> convention
    # as inclusion_panel_meeting_new/_panel_meeting_form_modal.html. Also
    # doubles as the edit entry point for an existing Action's Discussion row
    # (?edit=<id>) - one code path for create and edit, landing an edit
    # straight on the Assign step while Back still reaches the details step.
    # Kept as its own view/URL (rather than folded into the dialog's JS) so
    # it stays reusable from other entry points later.
    referral = get_object_or_404(InclusionReferral, pk=referral_id)
    is_panel_staff = _is_panel_staff(_current_staff(request))
    categories = visible_categories_for(_current_staff(request))
    auto_assign_by_category = {}
    for category in categories:
        suggestion = category.resolve_auto_assignee()
        if suggestion:
            auto_assign_by_category[category.id] = {'id': suggestion.id, 'name': str(suggestion)}
    edit_action_id = request.GET.get('edit') or request.POST.get('action_id') or None
    action = None
    if edit_action_id:
        action = get_object_or_404(
            Action.objects.select_related('assigned_to_staff', 'assigned_to_group', 'category'),
            pk=edit_action_id, referral=referral,
        )
        # Deep-linking an action_id directly (?edit=<id>/action_id POST)
        # bypasses the categories dropdown's own is_sensitive filtering
        # above, so a non-panel-staff viewer could otherwise still reach a
        # sensitive action's edit form by id - same guard the old standalone
        # Edit Action page used to carry.
        if not is_panel_staff and action.category_id and action.category.is_sensitive:
            return redirect(_safe_next(request, '/inclusion/panel/actions/'))
    # Only ever set when this link came from a live Discussion page (the one
    # place a panel_referral is known at the point an action is created) -
    # actions added from the standalone Actions page correctly stay
    # unattributed. See Action.origin_panel_referral for why this is
    # provenance-only rather than the action's primary relationship.
    origin_panel_referral_id = request.GET.get('panel_referral') or request.POST.get('panel_referral') or None

    if request.method == 'POST':
        # The Updates thread posts to this same view rather than a URL of
        # its own, so it inherits the sensitive-category redirect above for
        # free - an update is exactly as reachable as the action it hangs off,
        # with no sensitivity of its own (see ActionUpdate). It arrives as a
        # fetch body because the modal is already a <form> and HTML forbids a
        # nested one, and it answers with the rendered entry rather than a
        # redirect so the thread grows in place without throwing away the
        # half-filled form around it.
        if request.POST.get('form_action') == form_actions.ADD_ACTION_UPDATE:
            body = request.POST.get('body', '').strip()
            if not action or not body:
                return JsonResponse({'success': False})
            update = ActionUpdate.objects.create(
                action=action, author=_current_staff(request), body=body,
            )
            update.can_edit = True
            return JsonResponse({'success': True, 'html': render_to_string(
                'hubs/inclusion/panel/_action_update_entry.html', {'update': update}, request=request,
            )})

        # Author-only, enforced here rather than trusted from the template -
        # the edit/delete buttons only *offer* the action to whoever the
        # template thinks is the author; a forged POST from anyone else still
        # has to be rejected on this side. update_id is scoped to `action` (not
        # looked up bare) so this can't be used to edit/delete an entry on an
        # action the requester couldn't otherwise reach.
        if request.POST.get('form_action') in (form_actions.EDIT_ACTION_UPDATE, form_actions.DELETE_ACTION_UPDATE):
            if not action:
                return JsonResponse({'success': False}, status=403)
            update = get_object_or_404(
                ActionUpdate.objects.visible().select_related('author'),
                pk=request.POST.get('update_id'), action=action,
            )
            if update.author_id != _current_staff(request).id:
                return JsonResponse({'success': False}, status=403)

            if request.POST.get('form_action') == form_actions.DELETE_ACTION_UPDATE:
                update.deleted_at = timezone.now()
                update.save(update_fields=['deleted_at'])
                return JsonResponse({'success': True})

            # Edit: in place, no version history - the body changes but
            # created_at and the entry's position in the thread don't. edited_at
            # is what tells a reader "this isn't what was written on the day".
            body = request.POST.get('body', '').strip()
            if not body:
                return JsonResponse({'success': False})
            update.body = body
            update.edited_at = timezone.now()
            update.save(update_fields=['body', 'edited_at'])
            update.can_edit = True
            return JsonResponse({'success': True, 'html': render_to_string(
                'hubs/inclusion/panel/_action_update_entry.html', {'update': update}, request=request,
            )})

        category_id = request.POST.get('category') or None
        if category_id and not categories.filter(pk=category_id).exists():
            category_id = None
        assigned_to_staff_id = request.POST.get('assigned_to_staff') or None
        assigned_to_group_id = request.POST.get('assigned_to_group') or None
        if action:
            action.category_id = category_id
            action.assigned_to_staff_id = assigned_to_staff_id
            action.assigned_to_group_id = assigned_to_group_id
            action.due_date = request.POST.get('due_date') or None
            action.description = request.POST.get('description', '')
            action.save()
        else:
            Action.objects.create(
                referral=referral,
                category_id=category_id,
                assigned_to_staff_id=assigned_to_staff_id,
                assigned_to_group_id=assigned_to_group_id,
                due_date=request.POST.get('due_date') or None,
                description=request.POST.get('description', ''),
                origin_panel_referral_id=origin_panel_referral_id,
                created_by=_current_staff(request),
            )
        redirect_url = _safe_next(request, '/inclusion/panel/actions/')
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'success': True, 'redirect': redirect_url})
        return redirect(redirect_url)

    initial_assign_type = None
    initial_assign_id = None
    initial_assign_name = ''
    if action:
        if action.assigned_to_staff_id:
            initial_assign_type, initial_assign_id, initial_assign_name = 'staff', action.assigned_to_staff_id, str(action.assigned_to_staff)
        elif action.assigned_to_group_id:
            initial_assign_type, initial_assign_id, initial_assign_name = 'group', action.assigned_to_group_id, str(action.assigned_to_group)

    return render(request, 'hubs/inclusion/panel/_action_form_modal.html', {
        **_panel_base_context(request),
        'referral': referral,
        'action': action,
        'categories': categories,
        'initial_assign_type': initial_assign_type,
        'initial_assign_id': initial_assign_id,
        'initial_assign_name': initial_assign_name,
        'auto_assign_by_category': auto_assign_by_category,
        # Empty in create mode - there is no Action to hang a thread off
        # yet, which is also why the details step's Updates row only renders
        # for an edit (see _action_form_modal.html). can_edit is computed
        # here, once, rather than compared in the template - the same
        # author-check the POST handlers above enforce server-side, so the
        # template only ever hides a button the view would reject anyway.
        'updates': _updates_with_can_edit(action, _current_staff(request)) if action else [],
        'next': request.GET.get('next', ''),
        'panel_referral_id': origin_panel_referral_id,
        'next_half_term_date': next_half_term(referral.student.school, timezone.localdate()),
        'next_term_date': next_term(referral.student.school, timezone.localdate()),
        'next_term_option': _next_term_option(referral.student.school, timezone.localdate()),
    })


def inclusion_panel_action_set_status(request, action_id):
    action = get_object_or_404(Action, pk=action_id)
    if request.method == 'POST':
        status = request.POST.get('status')
        if status in dict(Action.STATUS_CHOICES):
            action.status = status
            action.completed_at = timezone.now() if status == 'complete' else None
            action.save()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        # Fired from the Home page's My Actions card (see home.html) so the
        # tab counts/rows can update in place with the count-delta pulse
        # (INT-M2) and transition (INT-M1) animations, instead of a full
        # page reload snapping them.
        current_staff = _current_staff(request)
        return render(request, 'hubs/inclusion/panel/_my_actions_card.html', _my_actions_context(current_staff))
    return redirect(_safe_next(request, '/inclusion/panel/'))


def inclusion_panel_action_inline_update(request, action_id):
    # Panel Discussion's Actions column has no Edit button for Category,
    # Description, Due Date, or Status - those stay directly inline-editable,
    # autosaving one <form data-inline-action-form> per row on change/blur
    # (see the delegated listeners in panel.js and #51's follow-up: fully
    # inline editing won over Edit-as-modal after prototyping both). Assigned
    # To is the one exception (#98): it no longer posts here at all - editing
    # it opens the full Add Action modal via inclusion_panel_action_new's
    # ?edit=<id> mode instead, since a flat merged select stopped scaling as
    # the Staff/StaffGroup lists grew. Returns just that one row's fragment
    # so the row can be swapped in place without touching any other row
    # mid-edit.
    action = get_object_or_404(
        Action.objects.select_related('category', 'assigned_to_staff', 'assigned_to_group', 'referral__student'),
        pk=action_id,
    )
    current_staff = _current_staff(request)
    categories = visible_categories_for(current_staff)

    if request.method == 'POST':
        category_id = request.POST.get('category') or None
        if category_id and not categories.filter(pk=category_id).exists():
            category_id = None
        action.category_id = category_id
        action.description = request.POST.get('description', '')
        # The interval-select/custom-date-picker split (see
        # _discussion_action_item.html) resolves client-side into one hidden
        # due_date input, so this side just parses a plain ISO date or
        # clears it - same as the original raw date field.
        due_date_value = request.POST.get('due_date', '')
        action.due_date = datetime.date.fromisoformat(due_date_value) if due_date_value else None
        new_status = request.POST.get('status', action.status)
        if new_status != action.status:
            action.completed_at = timezone.now() if new_status == 'complete' else None
        action.status = new_status
        action.save()

    return render(request, 'hubs/inclusion/panel/_discussion_action_item.html', {
        'action': action,
        'categories': categories,
        'next_half_term_date': next_half_term(action.referral.student.school, timezone.localdate()),
        'next_term_date': next_term(action.referral.student.school, timezone.localdate()),
        'next_term_option': _next_term_option(action.referral.student.school, timezone.localdate()),
    })
