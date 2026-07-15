from core.models import Term


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
