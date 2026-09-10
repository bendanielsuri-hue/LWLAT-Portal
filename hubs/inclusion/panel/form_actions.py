"""The panel's POST vocabulary.

Every mutating form in this app posts a `form_action` field, and the view
dispatches on its value. That name is the contract between three languages:
Python reads it in an if/elif chain, sixteen templates write it as a hidden
input's `value`, and panel.js sends it in a fetch body. Nothing joined them but
the string itself - rename one and you are grepping three languages with no
compiler, no type and no test to catch a miss.

This module is the one place the vocabulary is written down. The constants are
used by the views; templates and JS still write the literal (putting a Django
variable in every hidden input would make sixteen templates harder to read for
no extra safety). The safety comes from tests/test_form_actions.py instead,
which reads the literals back out of the templates and the JS and fails if
either drifts from this list.

Adding an action: add it here, then use it. A literal that isn't here fails the
test, and a constant nothing uses fails it too - so this list can't rot into a
graveyard of names the app stopped posting.
"""

# --- Agenda composition (Panel Agenda Setup + the live Panel Agenda) ---
ADD = 'add'
# The two ways a referral reaches an agenda: picked from the unassigned pool,
# or pulled in from Reviews Due. One handler serves both, which is why they
# were the pair that stayed raw literals in the dispatch longest.
ADD_REFERRAL = 'add_referral'
ADD_FOLLOWUP_TO_AGENDA = 'add_followup_to_agenda'
MOVE_AGENDA_REFERRAL = 'move_agenda_referral'
REMOVE_REFERRAL_FROM_AGENDA = 'remove_referral_from_agenda'
UNASSIGN_REFERRAL = 'unassign_referral'
REORDER_AGENDA = 'reorder_agenda'
UPDATE_PRIORITY = 'update_priority'

# --- Running a meeting ---
START_MEETING = 'start_meeting'
END_PANEL_MEETING = 'end_panel_meeting'
TOGGLE_READY = 'toggle_ready'
RESCHEDULE_TO_NOW = 'reschedule_to_now'
UPDATE_CHAIR = 'update_chair'
CHECK_IN = 'check_in'
MARK_LEFT = 'mark_left'
# The inactivity-warning dialog's "still here" keepalive - see
# reconcile.STALE_PANEL_TIMEOUT for what it holds off.
PING = 'ping'

# --- Discussion ---
START_DISCUSSION = 'start_discussion'
MARK_DISCUSSED = 'mark_discussed'
ADD_PANEL_NOTE = 'add_panel_note'
UPDATE_REVIEW_DATE = 'update_review_date'
CANCEL_FOLLOWUP = 'cancel_followup'

# --- Generic row verbs (settings screens) ---
EDIT = 'edit'
DELETE = 'delete'
REACTIVATE = 'reactivate'

# --- Panel groups and membership ---
ADD_GROUP_MEMBER = 'add_group_member'
DEACTIVATE_GROUP = 'deactivate_group'
TOGGLE_GROUP_MEMBER_ACTIVE = 'toggle_group_member_active'
UPDATE_GROUP_CHAIR = 'update_group_chair'
UPDATE_GROUP_NAME = 'update_group_name'
UPDATE_MEMBER_EXPERTISE = 'update_member_expertise'

# --- Settings: referral questions, action categories, expertise ---
ADD_QUESTION = 'add_question'
DEACTIVATE_QUESTION = 'deactivate_question'
ADD_CATEGORY = 'add_category'
ADD_PRESET_CATEGORY = 'add_preset_category'
DEACTIVATE_CATEGORY = 'deactivate_category'
ADD_EXPERTISE = 'add_expertise'
DEACTIVATE_EXPERTISE = 'deactivate_expertise'

# --- Safeguarding notes ---
ADD_SAFEGUARDING_NOTE = 'add_safeguarding_note'


ALL = frozenset({
    ADD, ADD_REFERRAL, ADD_FOLLOWUP_TO_AGENDA,
    MOVE_AGENDA_REFERRAL, REMOVE_REFERRAL_FROM_AGENDA, UNASSIGN_REFERRAL, REORDER_AGENDA,
    UPDATE_PRIORITY,
    START_MEETING, END_PANEL_MEETING, TOGGLE_READY, RESCHEDULE_TO_NOW, UPDATE_CHAIR, CHECK_IN,
    MARK_LEFT, PING,
    START_DISCUSSION, MARK_DISCUSSED, ADD_PANEL_NOTE, UPDATE_REVIEW_DATE, CANCEL_FOLLOWUP,
    EDIT, DELETE, REACTIVATE,
    ADD_GROUP_MEMBER, DEACTIVATE_GROUP, TOGGLE_GROUP_MEMBER_ACTIVE, UPDATE_GROUP_CHAIR,
    UPDATE_GROUP_NAME, UPDATE_MEMBER_EXPERTISE,
    ADD_QUESTION, DEACTIVATE_QUESTION, ADD_CATEGORY, ADD_PRESET_CATEGORY, DEACTIVATE_CATEGORY,
    ADD_EXPERTISE, DEACTIVATE_EXPERTISE,
    ADD_SAFEGUARDING_NOTE,
})
