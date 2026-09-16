"""Helpers more than one Inclusion Panel area needs.

The bar for living here rather than in an area module is being reached for from
two or more areas: the sensitive-category visibility gate, the infinite-scroll
paginator, the term/date-range builder behind three dashboards, the review and
escalation pills, and the free-text token matcher every FilterSet uses. A helper
only one page calls stays with that page.
"""

from django.core.paginator import Paginator
from django.db.models import Count, Max, Q
from django.utils.http import url_has_allowed_host_and_scheme

from core.models import SafeguardingNote, Term
from core.school_scope import SchoolScope
from core.term_dates import upcoming_review_terms

from ..models import ActionCategory, PanelGroupMember

def _next_term_option(school, as_of):
    # The single immediate-next term for a "Due in..." preset (Add Action's
    # own Due Date field and the Discussion row's inline equivalent) - same
    # (term, is_rollover) shape as End Discussion's own review_term_options
    # (#100), just the first entry, so the option reads "Summer Term (...)"
    # instead of a generic "Next Term (...)" that doesn't say which term.
    options = upcoming_review_terms(school, as_of)
    return options[0] if options else None


def _safe_next(request, default_url):
    next_url = request.POST.get('next') or request.GET.get('next')
    if next_url and url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
        return next_url
    return default_url


def _paginate_for_infinite_scroll(queryset, request, is_ajax, page_size):
    # Shared by Students/Referrals/Actions/Meetings/Escalations' own
    # initListPage-driven infinite scroll (#210, components/infinite-
    # scroll.js). `page` in the URL only ever means "how far this visitor
    # has scrolled" - wireListInfiniteScroll replaceState()s it in as each
    # batch loads, never typed by hand. An AJAX continuation fetch
    # (is_ajax and page>1) gets just that one page's slice, spliced onto rows
    # already in the DOM. A full render (fresh visit, or a refresh mid-scroll
    # now that the URL carries that page number) has no existing DOM to
    # splice onto, so it renders every row up to that point in one page -
    # Paginator(qs, page_size * page_number).get_page(1) - rather than only
    # the last page's rows, which would silently drop everything loaded
    # before it on refresh.
    try:
        page_number = int(request.GET.get('page') or 1)
    except ValueError:
        page_number = 1
    is_continuation = is_ajax and page_number > 1
    if is_continuation:
        page_obj = Paginator(queryset, page_size).get_page(page_number)
    else:
        page_obj = Paginator(queryset, page_size * page_number).get_page(1)
    return page_obj, page_number, is_continuation


def _is_panel_staff(staff):
    # Lightweight, non-secure role check: anyone in a PanelGroup is treated as
    # DSL/panel staff. No real auth exists yet, see CLAUDE.md.
    if staff is None:
        return False
    return PanelGroupMember.objects.filter(staff=staff, is_active=True).exists()


def visible_categories_for(staff, categories=None):
    # ActionCategory.is_sensitive hides a category from anyone who isn't panel
    # staff (see hubs/inclusion/panel/CLAUDE.md). Single owner for that rule so
    # it can't be applied inconsistently across views.
    if categories is None:
        categories = ActionCategory.objects.filter(is_active=True)
    if _is_panel_staff(staff):
        return categories
    return categories.exclude(is_sensitive=True)


def visible_actions_for(staff, actions):
    if _is_panel_staff(staff):
        return actions
    return actions.exclude(category__is_sensitive=True)


def annotate_action_update_info(actions_qs):
    # "Has anyone actually tried?" (#234) - update_count/last_update_at,
    # annotated onto the queryset itself so every list page's row gets this
    # without a per-row query. deleted_at__isnull=True on both aggregates
    # so a soft-deleted ActionUpdate (ThreadEntryQuerySet.visible(), core/
    # models.py) counts toward neither the number nor the date - filter=,
    # not .filter() before the join, since that would also drop actions
    # with zero (or zero *visible*) updates from the queryset entirely.
    # distinct=True on Count guards against a caller's own prior join
    # (e.g. Actions list's concern-category filter) fanning out the
    # `updates` join into duplicate rows and inflating the count.
    return actions_qs.annotate(
        update_count=Count('updates', filter=Q(updates__deleted_at__isnull=True), distinct=True),
        last_update_at=Max('updates__created_at', filter=Q(updates__deleted_at__isnull=True)),
    )


def visible_notes_for(staff, student):
    # SafeguardingNote is safeguarding-sensitive (#52) - single owner for
    # "who can see a student's briefings," same reasoning as
    # visible_actions_for/visible_categories_for above, so Referral Details'
    # modal and Panel Discussion can't drift apart on this gate. Active
    # notes only (retired_at is null) - retired history isn't shown outside
    # the DSL Briefings screen itself.
    if not _is_panel_staff(staff):
        return SafeguardingNote.objects.none()
    return student.safeguarding_notes.filter(retired_at__isnull=True).select_related('author')


def _is_referral_unassigned(referral):
    return not any(pr.removed_at is None for pr in referral.panel_referrals.all())


def _panels_for_school_key(panels_qs, key):
    # A panel reaches School only through its group, and is MAT-wide if it has
    # no group or the group has no school. Those two facts are the whole
    # difference from the Staff/Student scoping in core.identity - the four
    # branches themselves are SchoolScope's, not restated here.
    return SchoolScope(key).narrow(
        panels_qs,
        via='panel_group__school',
        mat_wide=Q(panel_group__isnull=True) | Q(panel_group__school__isnull=True),
    )


def _term_choices_and_ranges(base_qs, school_ids, academic_years_present, term_filter, academic_year_filter, date_field, school_field):
    # Shared by Referrals/Actions' own Term filter (mirrors Panel Meetings'
    # #121 Term filter, views.py inclusion_panel_meetings - "please use
    # Referrals page as a template" cuts both ways: Meetings got Term
    # first, Referrals/Actions were the ones missing it). Term rows are a
    # tiered school-override/MAT-wide lookup (core.models.Term.school,
    # same tiered pattern as core.portal_settings.resolve_portal_settings),
    # so which date range "Autumn" means for a given school can differ -
    # this resolves that per school rather than assuming one shared
    # calendar, same reasoning as inclusion_panel_meetings' own
    # _resolve_term. Unlike Meetings (which resolves one Term per panel in
    # Python, including a holiday-gap "most recently ended" fallback -
    # sensible for "which term is this meeting following up on"), Referrals/
    # Actions are filtered by their own created_at falling inside a term's
    # exact date range at the DB level - no fallback for a date that lands
    # in a genuine holiday gap, which just yields no match for any term
    # (reasonable: a referral/action has no equivalent "which term is this
    # following up on" question the way a scheduled meeting does).
    # base_qs is the school-scoped queryset (no term/academic_year filter
    # applied yet) used to check whether a term actually HAS anything in it
    # - live feedback: "if I select 2026/27, I should only see Autumn term
    # as Spring and Summer is in the future!" - every Term row on the
    # calendar (including ones nothing's been created in yet) used to be
    # offered as a choice; this restricts choices to terms an .exists()
    # check confirms have at least one matching row, same "don't offer an
    # option that yields nothing" principle academic_year_choices/
    # panel_group choices etc already follow elsewhere on this page.
    # Returns (term_filter, term_choices, terms_by_academic_year_json_source,
    # term_q or None) - term_q is a Q object to .filter() by when
    # term_filter is set, or Q(pk__in=[]) if the selected term doesn't
    # exist for any relevant school/year (nothing should match), or None
    # when term_filter is empty.
    terms_qs = Term.objects.filter(Q(school_id__in=school_ids) | Q(school_id__isnull=True))
    if academic_years_present:
        terms_qs = terms_qs.filter(academic_year_id__in=academic_years_present)
    by_school = {}
    mat_wide = []
    for term in terms_qs:
        if term.school_id:
            by_school.setdefault(term.school_id, []).append(term)
        else:
            mat_wide.append(term)

    term_names_present = set()
    terms_by_academic_year_ids = {}
    for sid in school_ids:
        for term in (by_school.get(sid) or mat_wide):
            exists = base_qs.filter(**{
                school_field: sid,
                f'{date_field}__date__gte': term.start_date,
                f'{date_field}__date__lte': term.end_date,
            }).exists()
            if exists:
                term_names_present.add(term.name)
                terms_by_academic_year_ids.setdefault(str(term.academic_year_id), set()).add(term.name)

    term_choices = [(name, display) for name, display in Term.TERM_CHOICES if name in term_names_present]
    if term_filter and not any(term_filter == value for value, _ in term_choices):
        term_filter = ''
    terms_by_academic_year = {
        ay_id: [[name, display] for name, display in Term.TERM_CHOICES if name in names]
        for ay_id, names in terms_by_academic_year_ids.items()
    }

    term_q = None
    if term_filter:
        for_this_term = terms_qs.filter(name=term_filter)
        if academic_year_filter:
            for_this_term = for_this_term.filter(academic_year_id=academic_year_filter)
        by_school_for_term = {}
        mat_wide_for_term = []
        for term in for_this_term:
            if term.school_id:
                by_school_for_term.setdefault(term.school_id, []).append(term)
            else:
                mat_wide_for_term.append(term)
        matched_any = False
        for sid in school_ids:
            for term in (by_school_for_term.get(sid) or mat_wide_for_term):
                clause = Q(**{
                    school_field: sid,
                    f'{date_field}__date__gte': term.start_date,
                    f'{date_field}__date__lte': term.end_date,
                })
                term_q = clause if not matched_any else term_q | clause
                matched_any = True
        if not matched_any:
            term_q = Q(pk__in=[])
    return term_filter, term_choices, terms_by_academic_year, term_q


def _ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _review_label(prior_discussion_count):
    # prior_discussion_count is how many times a referral was already
    # discussed before the panel appearance being labeled - 0 is its
    # first-ever appearance ("Initial Discussion"), 1 is the first time
    # it's back after that ("1st Review"), 2 the second ("2nd Review"), etc.
    if prior_discussion_count <= 0:
        return 'Initial Discussion'
    return _ordinal(prior_discussion_count) + ' Review'


def _referral_review_pill(referral):
    # (label, css_class) for a referral's "New Referral"/"1st Review"/
    # "Closed" pill - New Referral vs Nth Review classification/labels/pill
    # classes (type-new/type-followup) match Panel Agenda Setup's referral
    # selection row (_referral_selection_row.html). Extracted from
    # inclusion_panel_referrals' own per-row loop (below) so
    # inclusion_panel_actions can show the same pill on action.referral
    # (live feedback: "add the other Referral status pill after Status on
    # the Actions page") without duplicating the classification logic.
    # Requires referral.panel_referrals prefetched by the caller, same as
    # every other call site already relies on for this relation.
    # (None, None) once closed - live feedback: "globally, if its closed we
    # do not need review pill" - the Status pill right next to this one
    # already reads "Closed", so a second "Closed" review pill was pure
    # redundancy (R1), not new information.
    if referral.status == 'closed':
        return None, None
    discussed_count = sum(1 for pr in referral.panel_referrals.all() if pr.discussion_status == 'discussed')
    if discussed_count == 0:
        return 'New Referral', 'type-new'
    return _review_label(discussed_count), 'type-followup'


def _referral_escalation_pill(referral):
    # Independent of both the status pill and review pill above - a referral
    # can be assigned/discussing at a school panel AND carry an open
    # Escalation at the same time (see CONTEXT.md's Escalation entry), so this
    # can never be folded into either. Requires referral.escalations
    # prefetched, same convention as review pill's panel_referrals.
    if any(e.status == 'open' for e in referral.escalations.all()):
        return 'Escalated', 'type-escalated'
    return None, None


def _student_id_filter(request):
    # Row-click links (Students/Referrals -> Actions, and the Student/
    # Referrals/Actions links in search results) pass this alongside the
    # display-only `name` param so two students sharing a name resolve to
    # an exact row instead of both matching a text search - see issue #13
    # follow-up. Cleared client-side (main.js) the moment the user edits
    # the name-search box by hand, so it never pins a stale student once
    # they start typing a new search.
    raw = request.GET.get('student') or ''
    return int(raw) if raw.isdigit() else None


def _token_name_filter(tokens, *fields):
    # Every whitespace-separated token must match somewhere across the given
    # fields (AND across tokens, OR across fields per token) - "Be S" finds
    # "Ben Suri" (token "Be" matches first_name, "S" matches last_name), the
    # shared matching rule for every search surface (INT-P4).
    q = Q()
    for token in tokens:
        token_q = Q()
        for field in fields:
            token_q |= Q(**{f'{field}__icontains': token})
        q &= token_q
    return q


# A checkbox is on only for the literal '1'. Used as both the "is it
# narrowing" test and the value handed to the template, so the badge count
# and the rendered control can't disagree about what ticked means.
def TICKED(value):
    return value == '1'
