"""Every view and helper the Inclusion Panel sub-app renders with.

views.py was one 4,390-line module until #220 split it. The split is by area -
one module per thing a reader is likely to be looking for - and this package
re-exports every name the single module used to expose, so `hubs/inclusion/
panel/urls.py`, `seed_referral_actions` and anything else reaching for
`panel.views.X` keep resolving unchanged.

Where the areas live:

    base.py            the sidebar menu and the context every page renders with
    shared.py          helpers more than one area needs
    search.py          the shared picker/search endpoint
    meeting_shared.py  attendance, roster and agenda-order helpers
    safeguarding.py    the Safeguarding Notes screen
    home.py            Panel Home
    students.py        the Students dashboard
    referrals.py       the Referrals dashboard and the questionnaire flow
    actions.py         the Actions dashboard and Add Action
    escalations.py     the Escalations dashboard
    meetings.py        the Panel Meetings dashboard and a meeting's lifecycle
    agenda.py          Panel Agenda Setup and the live Panel Agenda
    discussion.py      the live discussion page for one PanelReferral
    settings.py        the Admin area

Import order below follows the package's own dependency order (base and shared
first, the area modules after) so the file also reads as the dependency graph.
"""

from .base import ACTION_CATEGORY_PRESETS, PANEL_MENU, _panel_base_context

from .shared import (
    TICKED,
    visible_actions_for,
    visible_categories_for,
    visible_notes_for,
    _is_panel_staff,
    _is_referral_unassigned,
    _next_term_option,
    _ordinal,
    _paginate_for_infinite_scroll,
    _panels_for_school_key,
    _referral_escalation_pill,
    _referral_review_pill,
    _review_label,
    _safe_next,
    _student_id_filter,
    _term_choices_and_ranges,
    _token_name_filter,
)

from .search import PICKER_RESULT_LIMIT, inclusion_panel_search

from .meeting_shared import (
    _apply_attendance_action,
    _attendance_dialog_context,
    _due_followups,
    _is_group_member,
    _mat_panel_group,
    _mat_panel_running,
    _move_agenda_referral,
    _next_agenda_order,
    _panel_member_roster,
)

from .safeguarding import (
    SAFEGUARDING_FILTERS,
    inclusion_panel_safeguarding_notes,
    inclusion_panel_safeguarding_notes_mutate,
    _active_student_note,
    _note_origin_created_at,
    _reactivatable_student_note,
    _safeguarding_note_extra_context,
    _safeguarding_note_rows,
    _student_safeguarding_ready,
    _upcoming_panel_referrals_qs,
)

from .home import (
    inclusion_panel_home,
    _activity_display_time,
    _my_actions_context,
    _recent_activity,
)

from .students import STUDENT_FILTERS, inclusion_panel_students

from .referrals import (
    REFERRAL_FILTERS,
    inclusion_panel_action_status_update,
    inclusion_panel_referral_delete,
    inclusion_panel_referral_edit,
    inclusion_panel_referral_escalate,
    inclusion_panel_referral_new,
    inclusion_panel_referrals,
    _grouped_questions,
    _missing_required_answers,
    _referral_detail_context,
    _response_groups,
    _split_question_groups,
)

from .actions import (
    ACTION_FILTERS,
    inclusion_panel_action_inline_update,
    inclusion_panel_action_new,
    inclusion_panel_action_set_status,
    inclusion_panel_actions,
    _due_window,
)

from .escalations import (
    ESCALATION_FILTERS,
    inclusion_panel_escalation_quick_launch,
    inclusion_panel_escalation_resolve,
    inclusion_panel_escalations,
)

from .meetings import (
    inclusion_panel_meeting_activity_poll,
    inclusion_panel_meeting_attendance,
    inclusion_panel_meeting_delete,
    inclusion_panel_meeting_new,
    inclusion_panel_meeting_start,
    inclusion_panel_meetings,
    _effective_chair_q,
    _meeting_filters,
)

from .agenda import inclusion_panel_meeting_agenda, inclusion_panel_meeting_setup

from .discussion import (
    PERIOD_CHOICES,
    inclusion_panel_discussion,
    inclusion_panel_discussion_recording_upload,
    inclusion_panel_discussion_summary,
    _clamp_period_param,
    _discussion_summary_context,
)

from .settings import (
    inclusion_panel_action_category_settings,
    inclusion_panel_expertise_quick_add,
    inclusion_panel_expertise_settings,
    inclusion_panel_external_contact_quick_add,
    inclusion_panel_group_edit,
    inclusion_panel_group_settings,
    inclusion_panel_preset_reason_settings,
    inclusion_panel_referral_question_settings,
    _group_member_sort_key,
    _resolve_concrete_school,
)

# Re-exported only so that every name `views.X` resolved to before the split
# still resolves. Nothing in this file uses them; they were reachable as
# attributes of the single module purely because it imported them, and this
# package keeps that surface rather than asking a caller to find out which of
# its own imports were load-bearing for somebody else.
import datetime  # noqa: F401
from collections import Counter  # noqa: F401
from urllib.parse import quote  # noqa: F401
from django.core.paginator import Paginator  # noqa: F401
from django.db.models import Count, Exists, Max, OuterRef, Prefetch, Q  # noqa: F401
from django.http import HttpResponse, JsonResponse  # noqa: F401
from django.shortcuts import get_object_or_404, redirect, render  # noqa: F401
from django.template.loader import render_to_string  # noqa: F401
from django.urls import reverse  # noqa: F401
from django.utils import timezone  # noqa: F401
from django.utils.http import url_has_allowed_host_and_scheme  # noqa: F401
from core.identity import (  # noqa: F401
    current_school_key,
    current_staff as _current_staff,
    is_aggregate_school_key,
    staff_queryset_for_school_key,
    student_queryset_for_school_key,
)
from core.models import (  # noqa: F401
    AcademicYear,
    MatSettings,
    Referral as CoreReferral,
    SafeguardingNote,
    SafeguardingReadinessConfirmation,
    School,
    Staff,
    StaffGroup,
    Student,
    Term,
)
from core.dashboard_filters import Filter, FilterSet, equals, flag, tristate  # noqa: F401
from core.school_scope import SchoolScope  # noqa: F401
from core.hub_context import hub_context  # noqa: F401
from core.student_history import (  # noqa: F401
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
    positive_behaviour_summary,
    prefetch_history,
)
from core.term_dates import next_half_term, next_term, upcoming_review_terms  # noqa: F401
from portal.templatetags.avatar_extras import initials, full_name  # noqa: F401
from .. import form_actions, lifecycle, presenters, reconcile  # noqa: F401
from ..models import (  # noqa: F401
    Action,
    ActionCategory,
    ActionUpdate,
    Escalation,
    Expertise,
    ExternalContact,
    InclusionReferral,
    Panel,
    PanelGroup,
    PanelGroupMember,
    PanelMember,
    PanelReferral,
    PanelReferralNote,
    PanelReferralRecording,
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
)
