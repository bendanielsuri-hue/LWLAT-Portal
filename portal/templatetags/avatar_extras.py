from django import template

register = template.Library()

# The 5 real schools each own one of these 8 (seed_schools.py's
# SCHOOL_ACCENT_COLOURS) - reserved for anyone with no school of their own
# (MAT-wide staff) or whose school hasn't set an accent yet, so that
# fallback never happens to collide with a real school's own colour and
# read as "this MAT-wide person belongs to Babington".
_UNRESERVED_FALLBACK = 'pink'


@register.filter
def avatar_color_class(person):
    """Fallback-avatar background class - the person's own school accent
    colour when they have one (School.accent_colour, the same 8-colour
    picker used for the sidebar/portal accent), so avatars read as "which
    school" at a glance rather than an arbitrary colour. Falls back to one
    fixed reserved colour (not any real school's own) for MAT-wide staff
    with no school, or a school that hasn't set an accent."""
    school = getattr(person, 'school', None)
    accent = getattr(school, 'accent_colour', '') if school else ''
    return f'avatar-{accent or _UNRESERVED_FALLBACK}'
