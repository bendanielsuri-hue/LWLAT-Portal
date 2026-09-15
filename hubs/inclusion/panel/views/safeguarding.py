"""The Safeguarding Notes screen and its row builder.

The row builder is also read by Panel Home and by the live discussion page's
readiness check, which is why it lives below them in the import graph.
"""

from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from core.identity import (
    current_school_key,
    current_staff as _current_staff,
    student_queryset_for_school_key,
)
from core.models import SafeguardingNote, SafeguardingReadinessConfirmation, Student
from core.dashboard_filters import Filter, FilterSet

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import form_actions, reconcile
from ..models import PanelReferral

from .base import _panel_base_context
from .shared import TICKED, _token_name_filter

def _note_origin_created_at(note, notes_by_id):
    # An edit (supersede()) creates a new row with a fresh created_at, which
    # would otherwise jump an edited note to the top of the Active list
    # (Meta.ordering is -created_at) - reads as the note "duplicating and
    # moving" rather than being edited in place (#84). Walking the
    # supersedes chain back to its origin keeps an edited note anchored to
    # where its first version was created instead.
    while note.supersedes_id and note.supersedes_id in notes_by_id:
        note = notes_by_id[note.supersedes_id]
    return note.created_at


def _upcoming_panel_referrals_qs(school_key):
    # "Upcoming" is status alone (anything short of 'complete'), not a date
    # filter - panel.date is the *original* scheduled date and never moves
    # forward when a panel goes 'delayed' (see reconcile.reconcile_delayed_panels), so a
    # panel__date__gte=today clause would exclude a delayed panel from the
    # moment it's more than a day overdue, the exact case this screen most
    # needs to surface (#86 bug report).
    scoped_students = student_queryset_for_school_key(school_key)
    return PanelReferral.objects.filter(
        panel__status__in=['draft', 'ready', 'running', 'delayed'],
        removed_at__isnull=True,
        referral__student__in=scoped_students,
    ).select_related('referral__student__school', 'panel__panel_group')


def _safeguarding_note_rows(
    request, *, name_filter='', group_filter='', year_filter='', house_filter='',
    reg_filter='', sen_filter='', gender_filter='', ethnicity_filter='', pp_filter='',
    not_ready_filter=False,
):
    # Shared by inclusion_panel_safeguarding_notes and inclusion_panel_safeguarding_notes_mutate
    # (the latter needs it to re-render the right-pane card after a mutation,
    # unfiltered - it never passes any of the filter kwargs above). One row
    # per student+upcoming-panel pair (unchanged); 'notes' is now the
    # student's whole active SafeguardingNote list (no panel FK to filter by
    # any more, see #77-#81) — every row for the same student shows the same
    # notes. 'history' is that student's retired notes, most-recently-retired
    # first, replacing the old per-panel 'other_briefings' split.
    #
    # reconcile.reconcile_on_read() is called here rather than assumed fresh from
    # another page's load, same as inclusion_panel_meetings.
    reconcile.reconcile_on_read()
    school_key = current_school_key(request)
    qs = _upcoming_panel_referrals_qs(school_key)
    if name_filter:
        qs = qs.filter(_token_name_filter(
            name_filter.split(), 'referral__student__first_name', 'referral__student__last_name',
        ))
    if group_filter:
        qs = qs.filter(panel__panel_group__name=group_filter)
    if year_filter:
        qs = qs.filter(referral__student__year_group=year_filter)
    if house_filter:
        qs = qs.filter(referral__student__house=house_filter)
    if reg_filter:
        qs = qs.filter(referral__student__reg_form=reg_filter)
    if sen_filter:
        qs = qs.filter(referral__student__sen_status=sen_filter)
    if gender_filter:
        qs = qs.filter(referral__student__gender=gender_filter)
    if ethnicity_filter:
        qs = qs.filter(referral__student__ethnicity=ethnicity_filter)
    if pp_filter == '1':
        qs = qs.filter(referral__student__is_pp=True)
    elif pp_filter == '0':
        qs = qs.filter(referral__student__is_pp=False)
    panel_referrals = list(qs.order_by('panel__date', 'panel__time'))

    student_notes_cache = {}
    rows = []
    for pr in panel_referrals:
        student = pr.referral.student
        if student.id not in student_notes_cache:
            all_notes = list(student.safeguarding_notes.select_related('author', 'retired_by'))
            notes_by_id = {n.id: n for n in all_notes}
            # History is Delete only - a superseded (i.e. edited-away) note's
            # prior text never shows on screen anywhere, per #83.
            retired_visible = [
                n for n in all_notes
                if n.retired_at is not None and n.retirement_reason != SafeguardingNote.RETIREMENT_REASON_SUPERSEDED
            ]
            active_notes = sorted(
                (n for n in all_notes if n.retired_at is None),
                key=lambda n: _note_origin_created_at(n, notes_by_id), reverse=True,
            )
            student_notes_cache[student.id] = (
                active_notes,
                sorted(retired_visible, key=lambda n: n.retired_at, reverse=True),
            )
        notes, history = student_notes_cache[student.id]
        is_ready = _student_safeguarding_ready(student)
        if not_ready_filter and is_ready:
            continue
        rows.append({
            'panel_referral': pr,
            'panel': pr.panel,
            'student': student,
            'notes': notes,
            'has_briefing': bool(notes),
            'is_ready': is_ready,
            'history': history,
        })
    return rows


def _student_safeguarding_ready(student):
    confirmation = SafeguardingReadinessConfirmation.objects.filter(
        student=student,
    ).order_by('-confirmed_at', '-id').first()
    return bool(
        confirmation and confirmation.notes_version == student.safeguarding_notes_version
    )


def _safeguarding_note_extra_context(request):
    # Shared by the full-page render and the AJAX card-fragment re-render
    # below, so both stay in lockstep on who can write.
    current_staff = _current_staff(request)
    is_dsl = bool(current_staff and current_staff.is_dsl)
    return {
        'is_dsl': is_dsl,
        # Notes are never gated on the panel's own status any more (#78 - no
        # hard delete, no "still drafting" exception left to hang that on).
        'can_edit_briefing': is_dsl,
    }


# The Safeguarding Notes screen's filters.
#
# Partial adoption, deliberately: the reading, the badge count and the
# context keys come from here, but the narrowing stays inside
# _safeguarding_note_rows, which builds rows per (student, upcoming panel)
# pair rather than filtering one queryset. Three of the four restatements
# go; the fourth is a different shape of problem and is left alone.
#
# Three context keys don't follow the `<param>_filter` convention the other
# dashboards use - panel_group/sen_status/is_pp render as group_filter/
# sen_filter/pp_filter - so they say so explicitly rather than being
# renamed, which would mean touching the templates.
SAFEGUARDING_FILTERS = FilterSet(
    Filter('name'),
    Filter('panel_group', context_key='group_filter'),
    Filter('year'),
    Filter('house'),
    Filter('reg'),
    Filter('sen_status', context_key='sen_filter'),
    Filter('gender'),
    Filter('ethnicity'),
    Filter('is_pp', context_key='pp_filter'),
    Filter('not_ready', active=TICKED, context_value=TICKED),
)


def inclusion_panel_safeguarding_notes(request):
    # DSL-only screen (LWLAT-Portal#71/#74): students on upcoming panels,
    # left column, MAT-wide/school-switcher scoped; selected student's
    # briefing notes thread inline on the right - no modal. Reachable by URL
    # regardless of role (matches "no URL-level enforcement" elsewhere in
    # this app) - the DSL-only-ness is a visibility gate on the sidebar entry
    # (_panel_base_context) and on the write/edit/delete actions themselves,
    # not a hard page redirect.
    #
    # Filter bar brought up to the same filter-bar-tray + AJAX pattern as
    # Students/Referrals/Meetings (was still the pre-migration plain
    # client-side-JS bar - #133 grilling flagged the drift). Search added on
    # top, same as Students/Referrals - unlike Meetings/the SEND hub,
    # which pin nothing, a DSL reaching for one specific student here is
    # exactly the case a search box is for.
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    school_key = current_school_key(request)

    filters = SAFEGUARDING_FILTERS.bind(request)
    name_filter = filters['name']
    group_filter = filters['panel_group']
    year_filter = filters['year']
    house_filter = filters['house']
    reg_filter = filters['reg']
    sen_filter = filters['sen_status']
    gender_filter = filters['gender']
    ethnicity_filter = filters['ethnicity']
    pp_filter = filters['is_pp']
    not_ready_filter = filters['not_ready'] == '1'

    rows = _safeguarding_note_rows(
        request,
        name_filter=name_filter, group_filter=group_filter, year_filter=year_filter,
        house_filter=house_filter, reg_filter=reg_filter, sen_filter=sen_filter,
        gender_filter=gender_filter, ethnicity_filter=ethnicity_filter, pp_filter=pp_filter,
        not_ready_filter=not_ready_filter,
    )
    needs_briefing_count = sum(1 for r in rows if not r['is_ready'])
    ready_count = len(rows) - needs_briefing_count
    # rows is one per (student, panel) pair, not one per student - a student
    # on two upcoming panels would otherwise be double-counted here the way
    # it isn't in needs_briefing_count/ready_count (those are meant per-pair).
    students_count = len({r['student'].id for r in rows})

    # Choice lists computed from the unfiltered, school-scoped queryset
    # directly (not from the filtered `rows` above) - same convention as
    # inclusion_panel_students' years/forms/houses, so picking one filter
    # doesn't shrink every other dropdown's own options.
    base_qs = _upcoming_panel_referrals_qs(school_key)
    panel_group_choices = sorted({
        name for name in base_qs.values_list('panel__panel_group__name', flat=True) if name
    })
    year_group_choices = sorted({
        y for y in base_qs.values_list('referral__student__year_group', flat=True) if y is not None
    })
    house_choices = sorted({
        h for h in base_qs.values_list('referral__student__house', flat=True) if h
    })
    reg_choices = sorted({
        r for r in base_qs.values_list('referral__student__reg_form', flat=True) if r
    })
    # Fixed choice sets, not derived from the queryset - same convention as
    # students.html's gender_choices/sen_status_choices/ethnicity_choices.
    gender_choices = Student.GENDER_FILTER_CHOICES
    sen_status_choices = Student.SEN_STATUS_CHOICES
    ethnicity_choices = Student.ETHNICITY_CHOICES
    # Reg narrows to the selected Year Group, same dependent-filter convention
    # as students.html's forms_by_year.
    reg_by_year = {
        year: sorted({
            r for r in base_qs.filter(referral__student__year_group=year)
            .values_list('referral__student__reg_form', flat=True) if r
        })
        for year in year_group_choices
    }

    selected_id = request.GET.get('panel_referral')
    selected_row = next((r for r in rows if str(r['panel_referral'].id) == selected_id), None) if selected_id else None

    # Every row link below is a plain `?panel_referral=<id>` href, not an
    # AJAX-enhanced one (the detail column has its own fetch-based mutation
    # flow, but not a fetch-based *selection* flow - see the template's own
    # comment) - a bare href like that replaces the URL's whole query string
    # on click, silently dropping whatever filters were active (#137 bug
    # report: "if I click on a student... the filter [state] reopens" - the
    # real mechanism was every currently-applied filter getting wiped by the
    # navigation, landing back on the unfiltered default). Same
    # request.GET.copy()/urlencode() convention as this file's own
    # next_page_url (pagination), minus 'panel_referral' itself so each row's
    # own id doesn't collide with whichever one was selected before this
    # click.
    preserved_params = request.GET.copy()
    preserved_params.pop('panel_referral', None)
    filter_qs = preserved_params.urlencode()


    context = {
        **_panel_base_context(request),
        **_safeguarding_note_extra_context(request),
        'rows': rows,
        'needs_briefing_count': needs_briefing_count,
        'ready_count': ready_count,
        'students_count': students_count,
        'panel_group_choices': panel_group_choices,
        'year_group_choices': year_group_choices,
        'house_choices': house_choices,
        'reg_choices': reg_choices,
        'reg_by_year': reg_by_year,
        'gender_choices': gender_choices,
        'sen_status_choices': sen_status_choices,
        'ethnicity_choices': ethnicity_choices,
        'selected_row': selected_row,
        'filter_qs': filter_qs,
        **filters.context,
        'active_filter_count': filters.active_count,
    }
    # Selecting a student (below, safeguarding_notes.html's own script) now
    # fetches instead of following the row's href as a real navigation - the
    # whole reason being *not* a full page reload, so a full page's worth of
    # server work + the tray/list DOM getting torn down and rebuilt is
    # exactly what this branch exists to skip. Its own request always
    # carries panel_referral; a filter-change AJAX request never does (its
    # query string is built purely from the filter form's own fields,
    # loadCurrent() in main.js) - reliable enough to key off without a
    # dedicated header/param of its own.
    is_select_ajax = is_ajax and bool(selected_id)
    if is_select_ajax:
        template = 'hubs/inclusion/panel/_safeguarding_note_detail_content.html'
    elif is_ajax:
        template = 'hubs/inclusion/panel/_safeguarding_notes_filtered_content.html'
    else:
        template = 'hubs/inclusion/panel/safeguarding_notes.html'
    return render(request, template, context)


def _active_student_note(student, note_id):
    return SafeguardingNote.objects.filter(pk=note_id, student=student, retired_at__isnull=True).first()


def _reactivatable_student_note(student, note_id):
    # Only a manually-deleted note can be reactivated - a superseded one
    # already has a live successor and never shows an Inactive-list button
    # for this in the first place (see SafeguardingNote.reactivate()).
    return SafeguardingNote.objects.filter(
        pk=note_id, student=student, retired_at__isnull=False,
    ).exclude(retirement_reason=SafeguardingNote.RETIREMENT_REASON_SUPERSEDED).first()


def inclusion_panel_safeguarding_notes_mutate(request, panel_referral_id):
    # Add/edit(=supersede)/delete(=retire)/reactivate a note in this
    # student's SafeguardingNote list, and toggle this (student, panel)
    # student's readiness confirmation. Gated on is_dsl only - see
    # SafeguardingNote's docstring/#78 for why the old "still drafting,
    # panel not complete" exception no longer applies. "Delete" in the UI
    # is still the model's existing soft retire() (#78's no-hard-delete
    # guarantee is unchanged by #83) - only the label, and what History/
    # Inactive shows, changed.
    panel_referral = get_object_or_404(PanelReferral.objects.select_related('referral__student', 'panel'), pk=panel_referral_id)
    current_staff = _current_staff(request)
    if request.method == 'POST' and current_staff and current_staff.is_dsl:
        student = panel_referral.referral.student
        form_action = request.POST.get('form_action')
        if form_action == form_actions.ADD:
            text = request.POST.get('text', '').strip()
            if text:
                SafeguardingNote.objects.create(student=student, author=current_staff, text=text)
        elif form_action == form_actions.EDIT:
            note = _active_student_note(student, request.POST.get('note_id'))
            text = request.POST.get('text', '').strip()
            if note and text:
                note.supersede(current_staff, text)
        elif form_action == form_actions.DELETE:
            note = _active_student_note(student, request.POST.get('note_id'))
            reason = request.POST.get('retirement_reason')
            valid_reasons = dict(SafeguardingNote.manual_retirement_choices())
            if note and reason in valid_reasons:
                note.retire(current_staff, reason, request.POST.get('retirement_note', '').strip())
        elif form_action == form_actions.REACTIVATE:
            note = _reactivatable_student_note(student, request.POST.get('note_id'))
            if note:
                note.reactivate(current_staff)
        elif form_action == form_actions.CONFIRM_SAFEGUARDING_READINESS:
            SafeguardingReadinessConfirmation.objects.create(
                student=student,
                confirmed_by=current_staff,
                notes_version=student.safeguarding_notes_version,
            )

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        rows = _safeguarding_note_rows(request)
        row = next((r for r in rows if r['panel_referral'].id == panel_referral.id), None)
        return render(request, 'hubs/inclusion/panel/_safeguarding_note_card.html', {
            **_safeguarding_note_extra_context(request),
            'row': row,
        })
    return redirect(f"{reverse('inclusion_panel_safeguarding_notes')}?panel_referral={panel_referral.id}")
