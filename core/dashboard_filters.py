"""Declaring a dashboard's filters once instead of four times.

Every list dashboard in this portal (Students, Referrals, Actions,
Escalations, Meetings, Safeguarding Notes) reads its filters from the query
string, narrows a queryset with them, counts how many are active for the
filter bar's badge, and hands the chosen values back to the template so the
controls come back set. Those are four statements of the same fact, and until
this module they were written out separately, per filter, per view: 63 reads,
67 context keys, six hand-rolled `active_filter_count` sums.

Nothing joins the four. Miss one and the page still renders:

  - miss the queryset step and the control moves but the list doesn't
  - miss the count and the badge under-reports
  - miss the context key and the control resets on every reload
  - miss it in `next_page_url` and infinite scroll drops the filter on page 2

All four are silent. None is a crash, none is a template error, and the only
way to notice is to work the control and watch.

So a dashboard declares each filter once - where it reads from, how it
narrows - and this module derives the other three. ADR 0018 did the same job
for how a filter bar *renders*; this is the read side it left alone.

## Shape

    STUDENT_FILTERS = FilterSet(
        Filter('year', equals('year_group')),
        Filter('is_pp', tristate('is_pp')),
    )

    bound = STUDENT_FILTERS.bind(request)
    students = bound.narrow(students)
    context = {**bound.context, 'active_filter_count': bound.active_count}

`narrow` is a separate call from `bind` on purpose: these views build option
lists from the school-scoped set *before* filtering (so the dropdowns don't
shrink each other), and some filter on annotations that only exist further
down. The caller keeps deciding when narrowing happens; it just stops
deciding how.
"""


# --- how a filter narrows -------------------------------------------------
#
# Each of these returns an `apply(qs, value, values)` callable. `values` is
# every bound value, for the rare filter that has to know what its neighbours
# picked (see `superseded_by`).

def equals(field):
    """Plain equality, applied when the value isn't blank."""
    def apply(qs, value, values):
        return qs.filter(**{field: value})
    return apply


def flag(field, when='1'):
    """A checkbox: narrows only when ticked, never the other way."""
    def apply(qs, value, values):
        return qs.filter(**{field: True}) if value == when else qs
    return apply


def tristate(field):
    """Yes / No / Any, where '' means Any and doesn't narrow at all.

    The idiom this replaces was five verbatim if/elif pairs in the Students
    view alone - is_pp, is_eal, is_lac, is_young_carer, is_more_able - each
    three lines long and each identical but for the field name.
    """
    def apply(qs, value, values):
        if value == '1':
            return qs.filter(**{field: True})
        if value == '0':
            return qs.filter(**{field: False})
        return qs
    return apply


def custom(fn):
    """Anything else: a token name search, a date range, an annotation test.

    `fn(qs, value, values)` may ignore `values` entirely; it's passed so a
    filter can defer to another one.
    """
    return fn


# --- the declaration ------------------------------------------------------

class Filter:
    """One filter: its query-string name, and how it narrows.

    `name` is the GET parameter and, suffixed with `_filter`, the context key
    the templates already read - the naming convention every one of these
    views already followed by hand.
    """

    def __init__(self, name, apply=None, active=None, superseded_by=None,
                 context_key=None, context_value=None, counts=None):
        self.name = name
        self._apply = apply
        # What the template gets. Defaults to the raw string, but a checkbox
        # wants a bool and an id-picker wants an int - the views were already
        # doing those conversions inline, which is precisely how the context
        # key and the narrowing drifted apart.
        self._context_value = context_value or (lambda value: value)
        # "Is this filter doing anything?" Defaults to truthiness, which is
        # what every hand-written active_filter_count sum used.
        self._active = active or (lambda value: bool(value))
        # "Does it show up in the filter bar's badge?" Almost always the same
        # question as narrowing, but not quite: Students' `student` (an exact
        # id pinned by the search picker) narrows without counting, because
        # the sum it replaced simply never listed it. Kept separate so that
        # stays a stated decision rather than a consequence of the two being
        # the same expression.
        self._counts = counts
        # Names of filters that switch this one off when they're set. The
        # Students view's `student` (an exact id from the search picker)
        # supersedes `name` (a free-text match) this way; it used to be an
        # if/elif whose ordering carried the rule invisibly.
        self.superseded_by = tuple(superseded_by or ())
        self.context_key = context_key or f'{name}_filter'

    def context_for(self, value):
        return self._context_value(value)

    def read(self, request):
        """The raw value, always a string. Blank when absent."""
        return request.GET.get(self.name) or ''

    def is_active(self, value, values):
        """Whether this filter narrows the queryset."""
        if any(values.get(other) for other in self.superseded_by):
            return False
        return bool(self._active(value))

    def is_counted(self, value, values):
        """Whether this filter shows in the filter bar's badge.

        Deliberately not is_active: the badge answers "how many controls has
        the user set", which is not the same as "how many are narrowing".
        Students' free-text `name` stays counted even while a picked
        `student` supersedes it - which is what the hand-written sum did,
        since it tested the raw value and knew nothing about supersession.
        """
        if self._counts is None:
            return bool(self._active(value))
        return bool(self._counts(value))

    def narrow(self, qs, value, values):
        if not self.is_active(value, values):
            return qs
        if self._apply is None:
            return qs
        return self._apply(qs, value, values)


class FilterSet:
    """Every filter one dashboard offers."""

    def __init__(self, *filters):
        self.filters = filters
        names = [f.name for f in filters]
        # A duplicate name would mean one filter silently shadowing another
        # in `values` and in the context - cheap to catch here, invisible
        # otherwise.
        assert len(names) == len(set(names)), f'duplicate filter names: {names}'

    def bind(self, request):
        return BoundFilters(self, request)


class BoundFilters:
    """One dashboard's filters, read off one request.

    Holds the values so the three derived views of them - the narrowing, the
    count, the context - can't disagree.
    """

    def __init__(self, filter_set, request):
        self.filter_set = filter_set
        self.values = {f.name: f.read(request) for f in filter_set.filters}

    def __getitem__(self, name):
        return self.values[name]

    def get(self, name, default=''):
        return self.values.get(name, default)

    def set_value(self, name, value):
        """Correct a value after binding, so the count and context follow it.

        For the filters that validate themselves against choices built from
        the database: Referrals drops an academic year that isn't in this
        school's list, and _term_choices_and_ranges hands back a normalised
        term. Both used to rebind a local variable, which the context dict
        and the count sum then had to remember to read instead of the
        original - exactly the kind of second reference this module exists
        to remove.
        """
        assert name in self.values, f'unknown filter: {name}'
        self.values[name] = value
        return value

    def narrow(self, qs):
        """`qs` with every active filter applied, in declaration order."""
        for f in self.filter_set.filters:
            qs = f.narrow(qs, self.values[f.name], self.values)
        return qs

    @property
    def active(self):
        """The filters actually narrowing right now."""
        return [
            f for f in self.filter_set.filters
            if f.is_active(self.values[f.name], self.values)
        ]

    @property
    def active_count(self):
        """What the filter bar's badge shows - see Filter.is_counted."""
        return sum(
            1 for f in self.filter_set.filters
            if f.is_counted(self.values[f.name], self.values)
        )

    @property
    def context(self):
        """`{'<name>_filter': value}` for every filter, so controls come back set."""
        return {
            f.context_key: f.context_for(self.values[f.name])
            for f in self.filter_set.filters
        }
