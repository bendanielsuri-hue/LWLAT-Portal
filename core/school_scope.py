"""What the sidebar's school switcher selects, and how to narrow by it.

The switcher's cookie holds one of four things - nothing, 'all', 'primary'/
'secondary', or a School.id - and turning that into a filter is a four-branch
cascade. That cascade was written out five times: three times in identity.py
(staff, students, the default identity), once in core.portal_settings, and
once more in hubs.inclusion.panel.views for panels, in another app, with a
comment saying it mirrors the others. Only two things ever varied between
them: which relation reaches School, and what counts as MAT-wide.

So the branches live here once and the two variable parts are arguments.
Adding a model that needs school scoping is now a call, not a re-derivation.

## The two questions, kept apart

`selects_every_school` and `is_aggregate` look like the same test and are not.
identity.py has carried a comment warning about this since the keys were
introduced, because merging them is the obvious and wrong simplification:

  - `selects_every_school` asks "is any filtering needed at all?" Only a blank
    key or 'all' qualifies. To this question 'primary' is a real filter.
  - `is_aggregate` asks "is the switcher pointing at one concrete school?"
    Here 'primary' is an aggregate, right alongside 'all' - it is what decides
    whether a page can show school-specific chrome (a School column, a pilot
    check) or has to show the aggregate view.

Two tuples, two meanings. They are separate properties here so that a caller
has to pick one by name, rather than reaching for whichever tuple is nearest.
"""

from django.db.models import Q

# "No filtering needed" - see the module docstring. 'primary'/'secondary' are
# deliberately absent: they narrow.
EVERY_SCHOOL_KEYS = (None, '', 'all')

# The two category keys, mapped to the School.category values they select.
CATEGORY_KEYS = {'primary': 'Primary', 'secondary': 'Secondary'}

# "Not one concrete school" - see the module docstring. This one *does*
# include the category keys.
AGGREGATE_SCHOOL_KEYS = EVERY_SCHOOL_KEYS + tuple(CATEGORY_KEYS)


class SchoolScope:
    """One school-switcher selection, decoded once.

    Build it from a key (or a request) and ask it questions, rather than
    re-testing the raw string. `narrow()` applies the selection to any
    queryset that can reach School.
    """

    def __init__(self, key):
        self.key = key

    @classmethod
    def from_request(cls, request):
        # Imported here rather than at module scope: identity imports this
        # module, so a top-level import would close the loop.
        from core.identity import current_school_key
        return cls(current_school_key(request))

    def __repr__(self):
        return f'SchoolScope({self.key!r})'

    # --- the two questions ---

    @property
    def selects_every_school(self):
        """"Is any filtering needed at all?" - 'primary' is a real filter."""
        return self.key in EVERY_SCHOOL_KEYS

    @property
    def is_aggregate(self):
        """"Is this one concrete school?" - 'primary' is an aggregate."""
        return self.key in AGGREGATE_SCHOOL_KEYS

    # --- what it selects ---

    @property
    def category(self):
        """'Primary'/'Secondary' when a category is selected, else None."""
        return CATEGORY_KEYS.get(self.key)

    @property
    def school_id(self):
        """The concrete School.id, or None for any aggregate selection."""
        return None if self.is_aggregate else self.key

    # --- applying it ---

    def as_q(self, via='school', mat_wide=None):
        """The Q this selection means for a model reaching School through `via`.

        `via` is the relation path to School ('school', or
        'panel_group__school' for a model that gets there indirectly, or None
        when the queryset is of School itself).
        `mat_wide` is a Q matching rows that belong to no one school and so
        match every selection - what that means is the model's own business
        (a null FK, an is_mat_staff flag, an ungrouped panel), which is why
        it's passed in rather than guessed at.

        Only meaningful when something is actually being selected; callers
        should go through narrow(), which handles the no-op case.
        """
        if self.category:
            match = Q(**{'category' if via is None else f'{via}__category': self.category})
        else:
            match = Q(**{'pk' if via is None else f'{via}_id': self.school_id})
        if mat_wide is not None:
            match |= mat_wide
        return match

    def narrow(self, qs, via='school', mat_wide=None):
        """`qs`, limited to this selection. Unchanged when nothing is selected."""
        if self.selects_every_school:
            return qs
        return qs.filter(self.as_q(via=via, mat_wide=mat_wide))
