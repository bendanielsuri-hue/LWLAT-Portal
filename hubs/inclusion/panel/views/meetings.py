"""Panel Meetings: the dashboard and a meeting's own lifecycle.

Create/edit details, start, delete, the attendance dialog and the activity poll.
What happens *inside* a running meeting is split off into agenda.py and
discussion.py - this module is about the meeting as a scheduled object.
"""

import datetime
from collections import Counter

from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    is_aggregate_school_key,
)
from core.models import AcademicYear, MatSettings, School, Term
from core.dashboard_filters import Filter, FilterSet, equals
from core.school_scope import SchoolScope

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import form_actions, presenters, reconcile
from ..models import Panel, PanelGroup, PanelGroupMember, PanelReferral

from .base import _panel_base_context
from .shared import _paginate_for_infinite_scroll, _panels_for_school_key
from .meeting_shared import (
    _apply_attendance_action,
    _attendance_dialog_context,
    _mat_panel_running,
)

def _effective_chair_q(staff_id):
    # Mirrors Panel.effective_chair_id as a queryset filter: chair_id when
    # not following the group default, panel_group.default_chair_id when it is.
    return Q(chair_follows_default=False, chair_id=staff_id) | Q(
        chair_follows_default=True, panel_group__default_chair_id=staff_id,
    )


# The Panel Meetings dashboard's filters.
#
# `term` declares itself here for the badge and the context but narrows in
# Python further down, not here: which Term row is "this panel's term"
# depends on a per-panel school resolution, so there is no one date range
# every panel can be filtered against at the DB level (#121).
#
# `my_meetings` needs the viewer, which a FilterSet doesn't carry, so its
# `apply` is built per request by _meeting_filters() below.
def _meeting_filters(current_staff, my_group_ids):
    """Meetings' filters, closed over who is asking.

    Chair and My Meetings both resolve against the current identity, so the
    set is built per request rather than at import. Everything else is a
    plain field match and reads the same as the other dashboards.
    """
    return FilterSet(
        Filter('panel_group', equals('panel_group_id')),
        Filter('chair', apply=lambda qs, v, vals: qs.filter(_effective_chair_q(v))),
        Filter('academic_year', equals('academic_year_id')),
        Filter('term'),
        Filter('status', equals('status')),
        Filter(
            'my_meetings',
            apply=lambda qs, v, vals: qs.filter(
                _effective_chair_q(current_staff.id) | Q(panel_group_id__in=my_group_ids)
            ),
            # Only meaningful with an identity to be - the old expression
            # folded that `and current_staff is not None` into the value
            # itself, which is why the context key was a bool.
            active=lambda v: v == '1' and current_staff is not None,
            context_value=lambda v: v == '1' and current_staff is not None,
        ),
    )


def inclusion_panel_meetings(request):
    reconcile.reconcile_on_read()
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    today = timezone.localdate()
    school_key = current_school_key(request)
    is_aggregate_view = is_aggregate_school_key(school_key)
    current_staff = _current_staff(request)

    # Computed once, reused both by the My Meetings filter and by each
    # card's can_manage flag - same "must be an active member of *this*
    # panel's own group" gate the live Agenda page's Start Meeting uses.
    my_group_ids = set(
        PanelGroupMember.objects.filter(staff=current_staff, is_active=True).values_list('panel_group_id', flat=True)
    ) if current_staff else set()

    filters = _meeting_filters(current_staff, my_group_ids).bind(request)
    academic_year_filter = filters['academic_year']
    term_filter = filters['term']

    # Option lists computed from the school-scoped set, before the filters
    # below are applied, same convention as inclusion_hub's year_group_choices -
    # so Panel Group/Chair/Academic Year don't shrink each other's dropdowns.
    base_panels = _panels_for_school_key(
        Panel.objects.exclude(status='void').select_related(
            'chair', 'panel_group__school', 'panel_group__default_chair', 'academic_year'
        ),
        school_key,
    )
    # #121: School Term data col/filter - a term's actual dates can be a
    # school-specific override (core.models.Term.school) rather than the
    # same MAT-wide dates for every panel, so "which term is this panel in"
    # has to be resolved per panel (the panel's own school, falling back to
    # MAT-wide) rather than one shared calendar. No academic_year_id filter
    # here (unlike an earlier pass) - the "most recently ended" fallback
    # below (live feedback: "we should be able to get term based on
    # scheduled date"/"most recently ended term", for a meeting scheduled in
    # a holiday gap no Term row actually covers) can need to look into a
    # DIFFERENT academic year's terms than the panel's own (e.g. a date just
    # after one year's Summer term ends but before the next year's own
    # AcademicYear.start_date has technically rolled over). Term is a small,
    # rarely-changing table - fetching every row for the relevant schools
    # once, rather than year-scoping the query too, is simpler and still
    # cheap. Batched once here rather than one query per panel/card.
    school_ids_for_terms = {
        p.panel_group.school_id for p in base_panels if p.panel_group_id and p.panel_group.school_id
    }
    terms_by_school = {}
    for term in Term.objects.filter(Q(school_id__in=school_ids_for_terms) | Q(school_id__isnull=True)):
        terms_by_school.setdefault(term.school_id, []).append(term)

    def _resolve_term(panel):
        school_id = panel.panel_group.school_id if panel.panel_group_id else None
        school_terms = terms_by_school.get(school_id, []) if school_id else []
        mat_terms = terms_by_school.get(None, [])
        for candidates in (school_terms, mat_terms):
            exact = next((t for t in candidates if t.start_date <= panel.date <= t.end_date), None)
            if exact:
                return exact
        # No term actually covers this date (a holiday gap) - fall back to
        # whichever term most recently ended, so a meeting scheduled during
        # a break still shows the term it's following up on rather than a
        # blank. Own school's calendar still takes priority over MAT-wide,
        # same as the exact-match check above.
        for candidates in (school_terms, mat_terms):
            ended = [t for t in candidates if t.end_date <= panel.date]
            if ended:
                return max(ended, key=lambda t: t.end_date)
        return None

    chairs_by_id = {}
    academic_years_present = {}
    # Term names ("autumn"/"spring"/"summer") actually present, keyed on name
    # alone - not (academic_year, name) - live feedback: "can we have it show
    # summer without year, we have a dropdown for Ac year" - Term and
    # Academic Year are two independent filters that combine (own comment,
    # term_filter application below), not one combined "Summer 2025/26"
    # option per year.
    term_names_present = set()
    # Per-year version of the same resolution, for the cascade map below -
    # keyed on the PANEL's own academic_year_id (not whichever year the
    # resolved Term row happens to belong to - the holiday-gap fallback in
    # _resolve_term can cross into a different year's Term).
    term_names_by_year_seen = {}
    for panel in base_panels:
        chair = panel.effective_chair
        if chair:
            chairs_by_id[chair.id] = chair
        if panel.academic_year_id:
            academic_years_present[panel.academic_year_id] = panel.academic_year
        term = _resolve_term(panel)
        if term:
            term_names_present.add(term.name)
            if panel.academic_year_id:
                term_names_by_year_seen.setdefault(panel.academic_year_id, set()).add(term.name)
    chair_choices = sorted(chairs_by_id.values(), key=lambda s: (s.last_name, s.first_name))
    academic_year_choices = [
        (ay.id, ay.label)
        for ay in sorted(academic_years_present.values(), key=lambda ay: ay.start_date, reverse=True)
    ]
    # Term.TERM_CHOICES order (Autumn/Spring/Summer), not alphabetical or
    # discovery order - a fixed chronological order reads better in a
    # dropdown than whatever order base_panels happened to iterate in.
    term_choices = [
        (name, display)
        for name, display in Term.TERM_CHOICES if name in term_names_present
    ]
    # #121 follow-up: cascading Term options, scoped to whichever Academic
    # Year is selected - live feedback: "if I select academic year, can term
    # filter be filtered to available terms... can this be a standard link
    # throughout ecosystem" - same {parent_value: [child_options]} JSON map
    # + rebuild-on-change convention Students' own Year->Reg Group cascade
    # already uses (forms_by_year_json, above/hubs/CLAUDE.md), not a new
    # mechanism. Queried directly off Term's own academic_year FK (not
    # _resolve_term's panel-by-panel resolution, which can cross into a
    # DIFFERENT year via its holiday-gap fallback) - this map is about which
    # terms genuinely BELONG to a year, not which term a given date lands
    # nearest to. UPDATE: that "genuinely belong to a year" reading turned
    # out too loose in practice - a Term ROW existing for 2026/27's Summer
    # is true of every academic year on the calendar, regardless of whether
    # any panel has actually been scheduled in it yet (live feedback: "Panel
    # meetings filter is showing summer option with 2026/27 selected" - only
    # Autumn had real panels that year, Summer's Term row just happened to
    # exist because summer 2025/26 DID have real panels, adding "summer" to
    # the global term_names_present set above). Switched to
    # term_names_by_year_seen (built alongside term_names_present, above) -
    # actual per-panel resolved terms grouped by that panel's own academic
    # year, same "don't offer an option that yields nothing" principle now
    # applied to Referrals/Actions' own Term filter too.
    terms_by_academic_year = {
        str(ay_id): [[name, display] for name, display in Term.TERM_CHOICES if name in names]
        for ay_id, names in term_names_by_year_seen.items()
    }
    # #121 follow-up: no default academic year applied on first load - live
    # feedback: "Panel meetings should not have any default filters applied,
    # academic year seem to be added" - was previously defaulted to
    # AcademicYear.for_date(today) whenever the param was omitted entirely
    # (the old academic_year_param/academic_year_filter split existed only
    # to distinguish that from an explicit "All Years" selection - gone now
    # that nothing defaults). current_academic_year is still exposed to the
    # template (highlighting "today's" year in the dropdown, say) even
    # though it no longer drives a default filter.
    current_academic_year = AcademicYear.for_date(today).id
    if academic_year_filter and not any(str(year) == academic_year_filter for year, _ in academic_year_choices):
        academic_year_filter = filters.set_value('academic_year', '')
    if term_filter and not any(term_filter == value for value, _ in term_choices):
        term_filter = filters.set_value('term', '')

    panels = _panels_for_school_key(
        Panel.objects.exclude(status='void').select_related(
            'chair', 'panel_group__school', 'panel_group__default_chair', 'academic_year'
        ).prefetch_related(
            'panel_referrals__referral', 'members',
        ).order_by('date'),
        school_key,
    )
    panels = filters.narrow(panels)

    # Batched once for every referral appearing on any panel in this list
    # (rather than one query per panel/card) - same "has this referral been
    # discussed on some other panel before" check inclusion_panel_meeting_setup
    # uses to distinguish New vs Review agenda items (last_discussed_panel).
    all_referral_ids = {
        pr.referral_id for panel in panels for pr in panel.panel_referrals.all() if pr.removed_at is None
    }
    discussed_panels_by_referral = {}
    for referral_id, panel_id in PanelReferral.objects.filter(
        discussion_status='discussed', referral_id__in=all_referral_ids,
    ).values_list('referral_id', 'panel_id'):
        discussed_panels_by_referral.setdefault(referral_id, set()).add(panel_id)

    meetings = []
    upcoming_meetings = []
    past_meetings = []
    next_marked = False
    for panel in panels:
        # #121: Term filter is applied here, in Python, rather than as a
        # queryset .filter() - which specific Term row is "this panel's
        # term" depends on a per-panel school resolution (_resolve_term,
        # above), not a single shared date range every panel can be
        # filtered against at the DB level.
        term = _resolve_term(panel)
        if term_filter and (not term or term.name != term_filter):
            continue
        term_label = term.get_name_display() if term else None

        active_referrals = [pr for pr in panel.panel_referrals.all() if pr.removed_at is None]
        referral_count = len(active_referrals)
        is_next = panel.status not in ('complete', 'delayed') and panel.date >= today and not next_marked
        if is_next:
            next_marked = True

        if panel.status == 'complete':
            discussed = [pr for pr in active_referrals if pr.discussion_status == 'discussed']
            new_count = sum(
                1 for pr in discussed
                if not (discussed_panels_by_referral.get(pr.referral_id, set()) - {panel.id})
            )
            review_count = len(discussed) - new_count
            duration_display = presenters.short_duration(
                presenters.sum_durations(pr.duration for pr in discussed)
            )
            # #121 follow-up: Closed/Future Review counts - live feedback:
            # "can we have a data col for referrals closed/referrals for
            # future review" - follow_up_status == 'incomplete' is a
            # discussed referral flagged for a future review that hasn't
            # happened yet (_ensure_followup_minimum/the real Panel Agenda
            # follow-up flow); blank or 'complete' both mean nothing's still
            # outstanding from this meeting - blank because it was never
            # flagged (closed outright), 'complete' because whatever review
            # it was flagged for has itself since happened.
            closed_count = sum(1 for pr in discussed if pr.follow_up_status != 'incomplete')
            future_review_count = len(discussed) - closed_count
            priority_counts = None
        else:
            new_count = sum(
                1 for pr in active_referrals
                if not (discussed_panels_by_referral.get(pr.referral_id, set()) - {panel.id})
            )
            review_count = referral_count - new_count
            priority_counts = Counter(pr.referral.priority or 'untriaged' for pr in active_referrals)
            duration_display = None
            closed_count = None
            future_review_count = None

        # #121: Attendance only means anything once a meeting has actually
        # started - a draft/ready/delayed-before-starting panel has no
        # PanelMember rows yet at all. checked_in_count reads panel.members
        # (prefetched, above) rather than querying - free once prefetched.
        checked_in_count = sum(1 for pm in panel.members.all() if pm.checked_in_at) if panel.started_at else None
        # #121: Discussion progress only means anything for a meeting that's
        # actually live right now (running, or delayed - still started, just
        # past its typical duration without ending) - complete/upcoming
        # panels already show the same information via New/Review, above.
        discussed_so_far = (
            sum(1 for pr in active_referrals if pr.discussion_status == 'discussed')
            if panel.status in ('running', 'delayed') else None
        )

        entry = {
            'panel': panel,
            'is_next': is_next,
            'referral_count': referral_count,
            'new_count': new_count,
            'review_count': review_count,
            'priority_counts': priority_counts,
            'duration_display': duration_display,
            'closed_count': closed_count,
            'future_review_count': future_review_count,
            'checked_in_count': checked_in_count,
            'discussed_so_far': discussed_so_far,
            'term_label': term_label,
            # Start/Continue Meeting, Edit Agenda, Delete are all only for
            # this panel's own group members - matches the live Agenda
            # page's can_start_meeting gate. Everyone else gets View Agenda.
            'can_manage': panel.panel_group_id is not None and panel.panel_group_id in my_group_ids,
            # Only one MAT Panel Meeting may run at a time - see CONTEXT.md.
            'mat_start_blocked': (
                bool(panel.panel_group_id and panel.panel_group.is_mat_wide)
                and panel.status not in ('running', 'complete', 'void')
                and _mat_panel_running(exclude=panel) is not None
            ),
        }
        meetings.append(entry)
        (past_meetings if panel.status == 'complete' else upcoming_meetings).append(entry)
    past_meetings.reverse()
    meetings = upcoming_meetings + past_meetings
    # Captured before pagination reassigns `meetings` to just the current
    # page below - same "totals against the full filtered set, not the page
    # slice" convention as Students/Referrals/Actions' own stats-strip counts.
    total_meetings_count = len(meetings)
    upcoming_meetings_count = len(upcoming_meetings)
    past_meetings_count = len(past_meetings)

    # MEETINGS_PAGE_SIZE meetings per page (infinite scroll, wired via
    # initListPage in meetings.js - shared with Students/Referrals/Actions,
    # above). Paginated as a plain Python list (Paginator
    # works on either), not a queryset slice before the per-panel loop above
    # the way the other pages do it - is_next/discussed_panels_by_referral
    # and the upcoming-then-past reordering all genuinely need the full
    # filtered set first, so this only trims what gets rendered/sent, not
    # what gets computed. Fine at today's meeting volumes (nowhere near
    # Students' ~4000-row scale); revisit if that changes.
    MEETINGS_PAGE_SIZE = 50
    page_obj, page_number, is_continuation = _paginate_for_infinite_scroll(
        meetings, request, is_ajax, MEETINGS_PAGE_SIZE
    )
    meetings = list(page_obj.object_list)

    panel_groups = PanelGroup.objects.filter(is_active=True).select_related('school').order_by('name')
    if not is_aggregate_view:
        panel_groups = panel_groups.filter(Q(school_id=school_key) | Q(school__isnull=True))

    active_filter_count = filters.active_count

    context = {
        **_panel_base_context(request),
        'meetings': meetings,
        'today': today,
        'is_aggregate_view': is_aggregate_view,
        **filters.context,
        'panel_groups': panel_groups,
        'chair_choices': chair_choices,
        'academic_year_choices': academic_year_choices,
        'current_academic_year': current_academic_year,
        'term_choices': term_choices,
        # Raw dict for json_script (meetings.js reads it as a data island,
        # not the escapejs-in-a-string-literal convention the inline
        # <script> used before #210).
        'terms_by_academic_year': terms_by_academic_year,
        'status_choices': Panel.STATUS_CHOICES,
        'active_filter_count': active_filter_count,
        # New Panel Meeting is hidden entirely (not disabled) for staff in
        # zero active Panel Groups - same omission convention as
        # Start/Continue/Edit/Delete's can_manage above (#69).
        'can_create_meeting': bool(my_group_ids),
        'meetings_count': total_meetings_count,
        'upcoming_meetings_count': upcoming_meetings_count,
        'past_meetings_count': past_meetings_count,
        'page_obj': page_obj,
        # MAT Panel Meetings (panel_group.school is null) show the MAT-wide
        # logo instead of the generic placeholder - no single school to crest.
        'mat_logo_url': getattr(MatSettings.objects.first(), 'logo_url', ''),
    }
    if page_obj.has_next():
        next_params = request.GET.copy()
        next_params['page'] = page_number + 1
        context['next_page_url'] = request.path + '?' + next_params.urlencode()
    if is_continuation:
        template = 'hubs/inclusion/panel/_meetings_rows.html'
    elif is_ajax:
        template = 'hubs/inclusion/panel/_meetings_filtered_content.html'
    else:
        template = 'hubs/inclusion/panel/meetings.html'
    return render(request, template, context)


def inclusion_panel_meeting_new(request, panel_id=None):
    # One dialog/template (_panel_meeting_form_modal.html) serves both
    # "Create Panel Meeting" (panel_id is None) and "Edit Panel Settings"
    # (panel_id set) - they share the same School/Panel Group/Date/Time
    # fields and the same explicit-Save submit model, so a single view
    # branching on whether `panel` exists is more honest than two near-
    # duplicate ones. Chair is deliberately not part of this form in
    # either mode - it stays directly editable from the Panel Settings
    # summary itself (see inclusion_panel_meeting_setup's `update_chair`
    # action), independent of this dialog.
    panel = get_object_or_404(Panel, pk=panel_id) if panel_id else None
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        date = request.POST.get('date')

        if panel is None:
            parsed_date = datetime.date.fromisoformat(date) if date else timezone.localdate()
            if parsed_date < timezone.localdate():
                parsed_date = timezone.localdate()
            panel = Panel.objects.create(
                date=parsed_date,
                time=request.POST.get('time') or None,
                panel_group_id=request.POST.get('panel_group') or None,
                chair_follows_default=True,
            )
        else:
            panel.update_details(
                date=datetime.date.fromisoformat(date) if date else None,
                time=request.POST.get('time') or None,
                chair_id=panel.chair_id,
                panel_group_id=request.POST.get('panel_group') or None,
            )

        setup_url = reverse('inclusion_panel_meeting_setup', args=[panel.id])
        if is_ajax:
            return JsonResponse({'success': True, 'redirect': setup_url})
        return redirect(setup_url)

    # School is only ever a field on this form in create mode - an
    # existing Panel has no school of its own (only via panel.panel_group.
    # school, itself nullable), so editing one never shows or sets it
    # directly, same as before the two dialogs were merged.
    current_staff = _current_staff(request)
    panel_groups = PanelGroup.objects.filter(is_active=True).select_related('school')
    schools = selected_school_id = school_locked = None
    if panel is None:
        # Create mode is gated to the user's own groups (#69) - the trigger
        # that opens this form is already hidden for anyone with none (see
        # inclusion_panel_meetings' can_create_meeting), but the form itself
        # only ever offers groups/schools this user could plausibly need,
        # rather than every active group in the system.
        panel_groups = list(panel_groups.filter(
            members__staff=current_staff, members__is_active=True,
        ).distinct()) if current_staff else []
        my_school_ids = {g.school_id for g in panel_groups if g.school_id}
        has_mat_wide_group = any(g.school_id is None for g in panel_groups)

        # via=None: this queryset is of School itself, so the selection
        # applies to its own columns rather than through a relation.
        sidebar_schools = SchoolScope(current_school_key(request)).narrow(
            School.objects.filter(is_active=True, pk__in=my_school_ids), via=None,
        )

        # A MAT-wide group (no school of its own) isn't "from a different
        # school" the way another school's group is, so it's never excluded
        # by the sidebar's current school-switcher scope - only real schools
        # narrow against it. Rendered as a synthetic 'none'-valued option
        # alongside the real ones so School->Panel Group filtering
        # (applyGroupFilter in panel.js) has something to match against.
        school_options = [{'id': s.id, 'name': s.name} for s in sidebar_schools.order_by('name')]
        if has_mat_wide_group:
            school_options.append({'id': 'none', 'name': 'MAT-wide'})
        schools = school_options

        selected_school = schools[0] if len(schools) == 1 else None
        selected_school_id = selected_school['id'] if selected_school else ''
        school_locked = selected_school is not None

    return render(request, 'hubs/inclusion/panel/_panel_meeting_form_modal.html', {
        **_panel_base_context(request),
        'panel': panel,
        'panel_groups': panel_groups,
        'today': timezone.localdate(),
        'current_staff': current_staff,
        'schools': schools,
        'selected_school_id': selected_school_id,
        'school_locked': school_locked,
    })


def inclusion_panel_meeting_start(request, panel_id):
    # Attendance is step one of actually starting a meeting (checked via the
    # start_meeting action on inclusion_panel_meeting_agenda) - this view no
    # longer flips the panel to running itself. The Meetings list's Start/
    # Continue button and Home's Next Panel preview both just land here to
    # load the Panel Agenda page, where the real (attendance-gated) Start
    # Meeting control lives.
    panel = get_object_or_404(Panel, pk=panel_id)
    return redirect('inclusion_panel_meeting_agenda', panel_id=panel.id)


def inclusion_panel_meeting_attendance(request, panel_id):
    # AJAX-only counterpart of the Attendance dialog embedded in
    # inclusion_panel_meeting_agenda, opened instead from the Panel Meetings
    # list's Start Meeting button so reschedule/check-in happens in place
    # without leaving that page. The browser only navigates to the Panel
    # Agenda page once 'started' comes back true (the meeting has actually
    # been started) - Cancel just closes the dialog client-side.
    panel = get_object_or_404(Panel, pk=panel_id)
    if request.method == 'POST':
        _apply_attendance_action(request, panel, request.POST.get('form_action'))
    html = render_to_string(
        'hubs/inclusion/panel/_meeting_attendance_dialog.html',
        _attendance_dialog_context(panel),
        request=request,
    )
    if request.method == 'POST':
        return JsonResponse({'html': html, 'started': panel.status == 'running'})
    return HttpResponse(html)


def inclusion_panel_meeting_activity_poll(request, panel_id):
    # Live counterpart to the lazy reconcile.reconcile_stale_running_panels backstop -
    # polled every ~60s from the Panel Agenda page (initInactivityWarning,
    # panel.js) while a panel is running, so reconcile.STALE_PANEL_TIMEOUT can actually
    # fire the instant it's reached instead of waiting for someone to load
    # some other page first. GET just checks/reports; POST (form_action=ping)
    # is the inactivity-warning dialog's "Still here" response, which bumps
    # Panel.last_confirmed_at - a genuine reconcile.panel_last_activity_at signal, not
    # a separate side channel - before reporting back.
    panel = get_object_or_404(Panel, pk=panel_id)
    if panel.status != 'running':
        # Already ended (by this exact race, or a manual End Panel Meeting
        # while this tab's poll loop was mid-flight) - nothing left to ping
        # or check, just report the terminal state.
        return JsonResponse({'closed': True, 'seconds_remaining': 0})

    now = timezone.now()
    if request.method == 'POST' and request.POST.get('form_action') == form_actions.PING:
        panel.last_confirmed_at = now
        panel.save(update_fields=['last_confirmed_at'])

    elapsed = now - reconcile.panel_last_activity_at(panel)
    if elapsed > reconcile.STALE_PANEL_TIMEOUT:
        reconcile.close_stale_panel(panel, now)
        return JsonResponse({'closed': True, 'seconds_remaining': 0})

    seconds_remaining = int((reconcile.STALE_PANEL_TIMEOUT - elapsed).total_seconds())
    return JsonResponse({'closed': False, 'seconds_remaining': seconds_remaining})


def inclusion_panel_meeting_delete(request, panel_id):
    panel = get_object_or_404(Panel, pk=panel_id)
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        can_delete = panel.started_at is None and panel.date >= timezone.localdate()
        if can_delete:
            panel.delete()
        if is_ajax:
            return JsonResponse({'success': can_delete})
    return redirect('inclusion_panel_meetings')
