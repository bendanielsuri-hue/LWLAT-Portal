"""The preset-reason mechanism, in one place instead of one copy per form.

"Pick a preset or write your own" is a single mechanism with three halves that
have to agree: the PresetReason rows offered, the pair of fields the form
posts (`reason_choice`, plus `reason_other` when the choice is the OTHER
sentinel below), and the one sentence the consumer stores. Escalate to MAT had
all three written out inline, and panel-group-member deactivation was about to
become the second copy of them (#239).

This module owns the POST half. The template half is
_preset_reason_field.html and the JS half is
panel/js/components/preset-reason-field.js, both named to match, and both
carrying their own copy of the sentinel string - the same three-language
contract form_actions.py describes, for the same reason.
"""

# What `reason_choice` holds when the user picked "Other (please specify)"
# rather than one of the presets. Deliberately not a value any preset could
# ever be: a preset's value IS its own sentence (see PresetReason), so a
# sentinel has to be something nobody would write.
OTHER = '__other__'


def reason_from_post(post):
    """The single sentence to store, from a submitted preset-reason field."""
    choice = post.get('reason_choice', '')
    if choice == OTHER:
        return post.get('reason_other', '').strip()
    return choice.strip()
