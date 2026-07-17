from core.models import AcademicYear, Term


def _terms_for_school(school):
    # Same tiered resolution as core.portal_settings: a school's own Term
    # rows override the MAT-wide (school=None) ones, but only if it has any
    # at all — otherwise fall through to MAT-wide.
    if school and Term.objects.filter(school=school).exists():
        return Term.objects.filter(school=school)
    return Term.objects.filter(school__isnull=True)


def next_half_term(school, as_of):
    # Next upcoming half-term boundary: either the start of the next
    # half-term break within the current term, or the start of the next
    # term itself if that comes sooner — both are "half term" checkpoints
    # in the school calendar, whichever is nearer.
    candidates = []
    for term in _terms_for_school(school):
        if term.half_term_start and term.half_term_start > as_of:
            candidates.append(term.half_term_start)
        if term.start_date > as_of:
            candidates.append(term.start_date)
    return min(candidates) if candidates else None


def next_term(school, as_of):
    term = _terms_for_school(school).filter(start_date__gt=as_of).order_by('start_date').first()
    return term.start_date if term else None


def remaining_terms_in_year(school, as_of):
    # Every Term still to come within the academic year `as_of` currently
    # falls in (not just the immediate next one) — e.g. from partway through
    # Autumn this returns [Spring, Summer], not just Spring. Empty once
    # already in the final (Summer) term with nothing left to list — see
    # next_autumn_term() for what fills that gap.
    academic_year = AcademicYear.for_date(as_of)
    return list(
        _terms_for_school(school)
        .filter(academic_year=academic_year, start_date__gt=as_of)
        .order_by('start_date')
    )


def next_autumn_term(school, as_of):
    # Rolls into the next academic year's Autumn term — only meaningful once
    # remaining_terms_in_year() has come back empty (already in Summer term
    # with nothing left this year). Read-only: returns None rather than
    # creating a row if the next academic year hasn't been seeded yet.
    academic_year = AcademicYear.for_date(as_of)
    next_year = (
        AcademicYear.objects.filter(start_date__gt=academic_year.start_date)
        .order_by('start_date')
        .first()
    )
    if not next_year:
        return None
    return _terms_for_school(school).filter(
        academic_year=next_year, name=Term.TERM_AUTUMN,
    ).first()


def upcoming_review_terms(school, as_of):
    # The full set of options for a "Review in..." term picker: every term
    # still to come this academic year, or — once already in the final term
    # with none left — the single rolled-over Next Autumn Term instead of
    # leaving the picker with nothing beyond generic week/month options.
    # Returns a list of (term, is_rollover) tuples so callers can label the
    # rollover case distinctly ("Next Autumn Term") from a same-year term
    # ("Spring Term").
    terms = remaining_terms_in_year(school, as_of)
    if terms:
        return [(term, False) for term in terms]
    autumn = next_autumn_term(school, as_of)
    return [(autumn, True)] if autumn else []
