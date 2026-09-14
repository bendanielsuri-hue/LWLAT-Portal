"""The live discussion page for one PanelReferral, and its summary fragment."""

import datetime

from django.db.models import Prefetch
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from core.identity import current_staff as _current_staff
from core.models import SafeguardingNote
from core.student_history import (
    attendance_authorised_pct,
    attendance_percentage,
    attendance_periods,
    attendance_sessions_possible,
    attendance_unauthorised_pct,
    behaviour_periods,
    behaviour_severity_counts,
    behaviour_severity_pct,
    behaviour_summary,
    exclusion_count,
    exclusion_most_recent,
    positive_behaviour_entry_count,
    positive_behaviour_periods,
    positive_behaviour_points,
)
from core.term_dates import next_half_term, next_term, upcoming_review_terms
from portal.templatetags.avatar_extras import full_name

# Imported as modules, not as names, so a call site reads
# `lifecycle.mark_discussed(...)` / `reconcile.reconcile_on_read()` and says
# which of the two it is - these used to be underscore-private functions in
# this file, and the whole point of moving them out is that a reader can see
# where a transition lives.
from .. import form_actions, lifecycle, presenters, reconcile
from ..models import (
    Action,
    InclusionReferral,
    PanelReferral,
    PanelReferralNote,
    PanelReferralRecording,
)

from .base import _panel_base_context
from .shared import (
    _is_panel_staff,
    _next_term_option,
    visible_actions_for,
    visible_categories_for,
    visible_notes_for,
)
from .safeguarding import _student_safeguarding_ready
from .referrals import _response_groups

PERIOD_CHOICES = ('week', 'month', 'half_term', 'term', 'year')


def _clamp_period_param(request, key):
    # Shared by the Attendance/Behaviour/Positive Behaviour cards' own
    # period-grouped "View details" disclosure (#95, each on its own query
    # param so opening one doesn't affect the others) - falls back to
    # 'week' for a missing or invalid value.
    period = request.GET.get(key, 'week')
    return period if period in PERIOD_CHOICES else 'week'


def _discussion_summary_context(pr):
    # The reusable "Discussion Summary" component (#44) - everything about
    # one specific discussion (one PanelReferral), not a referral's whole
    # history (that's Referral Details' own unscoped "Panel Meetings"
    # section, built by _referral_detail_context above). Shared between
    # Panel Agenda's Discussed rows and Previous Referrals' expanded
    # disclosure (#50).
    duration_display = presenters.clock_duration(pr.duration)

    notes = list(pr.notes.select_related('author'))
    # Distinct in first-appearance order - who actually wrote this
    # discussion up, separate from Chair (who was accountable for it,
    # whether or not they personally typed anything).
    note_authors = []
    seen_author_ids = set()
    for note in notes:
        if note.author_id and note.author_id not in seen_author_ids:
            seen_author_ids.add(note.author_id)
            note_authors.append(note.author)

    actions = list(
        Action.objects.filter(origin_panel_referral=pr).select_related('category', 'assigned_to_staff')
    )
    today = timezone.localdate()
    for action in actions:
        action.is_overdue = action.status == 'incomplete' and action.due_date and action.due_date < today

    return {
        'pr': pr,
        'duration_display': duration_display,
        'notes': notes,
        'note_authors': note_authors,
        'actions': actions,
    }


def inclusion_panel_discussion_summary(request, panel_referral_id):
    pr = get_object_or_404(
        PanelReferral.objects.select_related('panel__panel_group', 'panel__chair', 'referral__student'),
        pk=panel_referral_id,
    )
    return render(request, 'hubs/inclusion/panel/_discussion_summary_modal.html', {
        'ds': _discussion_summary_context(pr),
    })


def inclusion_panel_discussion(request, panel_referral_id):
    reconcile.reconcile_on_read()
    panel_referral = get_object_or_404(
        PanelReferral.objects.select_related('referral__student', 'referral__raised_by', 'panel'),
        pk=panel_referral_id,
    )
    referral = panel_referral.referral

    current_staff = _current_staff(request)
    is_panel_staff = _is_panel_staff(current_staff)

    if request.method == 'POST':
        action = request.POST.get('form_action')
        if action == form_actions.MARK_DISCUSSED:
            lifecycle.mark_discussed(
                panel_referral,
                requires_followup=request.POST.get('requires_followup') == 'yes',
                follow_up_date=request.POST.get('follow_up_date') or None,
            )
            return redirect('inclusion_panel_meeting_agenda', panel_id=panel_referral.panel_id)
        elif action == form_actions.ADD_PANEL_NOTE:
            body = request.POST.get('body', '').strip()
            if body:
                PanelReferralNote.objects.create(
                    panel_referral=panel_referral,
                    author_id=request.POST.get('author') or None,
                    body=body,
                )
        elif action == form_actions.ADD_SAFEGUARDING_NOTE:
            # Writing is gated to is_dsl (visibility-only, like every other
            # role gate in this app - see core.models.Staff.is_dsl); reading
            # stays at the coarser is_panel_staff level everywhere else this
            # displays. No panel link (SafeguardingNote is student-scoped
            # only, see #77-#81) - readiness for *this* meeting is tracked
            # separately via the student's readiness confirmation.
            text = request.POST.get('text', '').strip()
            if text and current_staff and current_staff.is_dsl:
                SafeguardingNote.objects.create(
                    student=referral.student,
                    author=current_staff,
                    text=text,
                )
        return redirect('inclusion_panel_discussion', panel_referral_id=panel_referral.id)

    # Pure display - starting/resuming the discussion timer happens only via
    # the explicit 'start_discussion' POST action on
    # inclusion_panel_meeting_agenda (the Discuss/Resume
    # buttons on the Panel Agenda page, gated on panel.started_at). A GET
    # here (a refresh, browser back/forward, or the Referral Details modal's
    # "View Discussion Page" link) must never mutate discussion_status or
    # restart discussion_started_at.
    previous_referrals = list(
        InclusionReferral.objects.filter(student=referral.student)
        .exclude(pk=referral.pk)
        .prefetch_related(
            'responses__question__category',
            Prefetch(
                'panel_referrals',
                queryset=PanelReferral.objects.select_related('panel__panel_group', 'panel__chair'),
            ),
        )
    )
    for prev in previous_referrals:
        prev.response_groups = _response_groups(prev)
        # One-line topic for the collapsed summary (#50) - the headline
        # category the referrer picked, not a free-text summary (there
        # isn't one). Read off the already-prefetched responses instead of
        # a fresh query.
        prev.topic = next(
            (r.answer for r in prev.responses.all() if r.question.label == 'Main Concern Category'),
            None,
        )
        # Each past discussion of this referral, most recent first, using
        # the same reusable Discussion Summary component (#44) Panel
        # Agenda's Discussed rows use - "discussed N times" is this
        # caller's own count, per #44's decision that aggregation across a
        # referral's history is never the component's own job.
        prev.discussions = [
            _discussion_summary_context(pr)
            for pr in sorted(
                (pr for pr in prev.panel_referrals.all() if pr.discussion_status == 'discussed'),
                key=lambda pr: pr.created_at or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                reverse=True,
            )
        ]

    actions = referral.actions.select_related('assigned_to_staff', 'category')
    actions = visible_actions_for(current_staff, actions)

    # Safeguarding Note (#52, decoupled #77-#81) - the student's whole
    # active note list, most recent first (Meta.ordering) - no more
    # "prepared for this meeting" split, since notes carry no panel FK at
    # all now.
    safeguarding_notes = list(visible_notes_for(current_staff, referral.student))
    # The auto-pop modal (mirrors ADR 0009's pre-start attendance modal)
    # only fires on the actual start-of-discussion navigation
    # (?discussion_started=1, set by the start_discussion redirect above,
    # not derivable from discussion_started_at alone since a GET must never
    # mutate it). Old rule was "no note prepared for this specific meeting"
    # - not representable once notes have no panel FK, so this collapses to
    # the student's current, version-anchored readiness confirmation.
    show_safeguarding_modal = (
        request.GET.get('discussion_started') == '1'
        and not _student_safeguarding_ready(referral.student)
    )

    # Attendance/Behaviour/Positive Behaviour cards (#95) each have a
    # period-grouped "View details" disclosure (Week/Month/Half Term/Term/
    # Year), on their own query params so opening one doesn't affect the
    # others. Bar-list visual treatment won a live prototype comparison
    # against a calendar heatmap and a sparkline trend - see panel.css.
    attendance_period = _clamp_period_param(request, 'period')
    attendance_details_open = 'period' in request.GET

    behaviour_period = _clamp_period_param(request, 'behaviour_period')
    behaviour_details_open = 'behaviour_period' in request.GET
    positive_behaviour_period = _clamp_period_param(request, 'positive_period')
    positive_behaviour_details_open = 'positive_period' in request.GET

    context = {
        **_panel_base_context(request),
        'panel_referral': panel_referral,
        'referral': referral,
        'student': referral.student,
        'attendance_period': attendance_period,
        'attendance_details_open': attendance_details_open,
        'behaviour_period': behaviour_period,
        'behaviour_details_open': behaviour_details_open,
        'positive_behaviour_period': positive_behaviour_period,
        'positive_behaviour_details_open': positive_behaviour_details_open,
        # Derived, never stored on Student directly - see
        # docs/adr/0007-student-history-tables-not-summary-fields.md.
        # Student Details' cards (#95) show a chart/breakdown built from
        # these, not a drill-down into the raw per-record log - each card's
        # own "View details" disclosure is the one exception, showing a
        # period-grouped breakdown (not the raw per-record log itself).
        'attendance_percentage': attendance_percentage(referral.student),
        'attendance_sessions_possible': attendance_sessions_possible(referral.student),
        'attendance_authorised_pct': attendance_authorised_pct(referral.student),
        'attendance_unauthorised_pct': attendance_unauthorised_pct(referral.student),
        'attendance_periods': attendance_periods(referral.student, attendance_period),
        'behaviour_summary': behaviour_summary(referral.student),
        'behaviour_severity_counts': behaviour_severity_counts(referral.student),
        'behaviour_severity_pct': behaviour_severity_pct(referral.student),
        'behaviour_incidents': referral.student.behaviour_incidents.all(),
        'behaviour_periods': behaviour_periods(referral.student, behaviour_period),
        'exclusion_count': exclusion_count(referral.student),
        'exclusion_most_recent': exclusion_most_recent(referral.student),
        'positive_behaviour_points': positive_behaviour_points(referral.student),
        'positive_behaviour_entry_count': positive_behaviour_entry_count(referral.student),
        'positive_behaviour_periods': positive_behaviour_periods(referral.student, positive_behaviour_period),
        'is_panel_staff': is_panel_staff,
        'is_dsl': bool(current_staff and current_staff.is_dsl),
        'safeguarding_notes': safeguarding_notes,
        'show_safeguarding_modal': show_safeguarding_modal,
        'response_groups': _response_groups(referral),
        'previous_referrals': previous_referrals,
        'actions': actions,
        'categories': visible_categories_for(current_staff),
        'panel_notes': panel_referral.notes.select_related('author'),
        'recordings': panel_referral.recordings.select_related('recorded_by'),
        'next_half_term_date': next_half_term(referral.student.school, timezone.localdate()),
        'next_term_date': next_term(referral.student.school, timezone.localdate()),
        # Named (e.g. "Summer Term (...)") rather than a generic "Next Term"
        # - backs the Actions due-date picker included further down this
        # page via _discussion_action_item.html.
        'next_term_option': _next_term_option(referral.student.school, timezone.localdate()),
        # End Discussion's own "Review in..." picker (#100) - every term
        # left in the current academic year, named, plus a rolled-over Next
        # Autumn Term once none are left. Distinct from next_term_option
        # above, which is just the single immediate-next term.
        'review_term_options': upcoming_review_terms(referral.student.school, timezone.localdate()),
    }

    return render(request, 'hubs/inclusion/panel/discussion.html', context)


def inclusion_panel_discussion_recording_upload(request, panel_referral_id):
    # Separate AJAX endpoint rather than a form_actions.py dispatch entry
    # (form_actions.py's docstring) - this posts a captured audio blob via
    # FormData, not a hidden form_action field, and returns JSON for the
    # recorder widget to append a row without a full page reload, same
    # convention as inclusion_panel_action_inline_update below.
    if request.method != 'POST':
        return JsonResponse({'success': False}, status=405)

    panel_referral = get_object_or_404(PanelReferral, pk=panel_referral_id)
    audio_file = request.FILES.get('audio')
    if not audio_file:
        return JsonResponse({'success': False, 'error': 'No audio received.'}, status=400)

    current_staff = _current_staff(request)
    duration_raw = request.POST.get('duration_seconds')
    recording = PanelReferralRecording.objects.create(
        panel_referral=panel_referral,
        recorded_by=current_staff,
        audio=audio_file,
        duration_seconds=int(duration_raw) if duration_raw and duration_raw.isdigit() else None,
    )
    return JsonResponse({
        'success': True,
        'id': recording.id,
        'url': recording.audio.url,
        'created_at': timezone.localtime(recording.created_at).strftime('%d/%m/%Y %H:%M'),
        'recorded_by': full_name(current_staff) if current_staff else 'Unknown',
    })
