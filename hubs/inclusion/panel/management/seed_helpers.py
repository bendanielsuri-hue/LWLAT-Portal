from hubs.inclusion.panel.models import ReferralQuestion, ReferralResponse

# Deterministic placeholder answers, keyed by question label, so every demo
# referral has something to show in the Referral Details panel (and a Main
# Concern Category on its card) instead of a blank one. Falls back to a
# generic line for any question not listed here. Shared by every seed command
# that creates an InclusionReferral, so a referral's completeness never
# depends on which command created it or the order commands ran in.
DEFAULT_ANSWERS = {
    'Concern Details': 'Ongoing low-level disruption in lessons and difficulty settling at the start of the day.',
    'Parent Voice': 'Parents are aware and supportive of any extra support the school can put in place.',
    'Student Voice': 'Student says they sometimes find it hard to concentrate and would like some extra help.',
    'What has been put in place so far?': 'Seating plan adjustments and a check-in with form tutor each morning.',
}
FALLBACK_ANSWER = 'No further detail recorded.'


def _placeholder_answer(referral, question):
    if question.question_type == 'select':
        # A dropdown question (currently just Main Concern Category) is
        # required in the real referral form - the fallback text isn't one of
        # its choices, so it must never be used here. Pick deterministically
        # off the student id so reruns are idempotent without needing random.
        choices = question.choice_list()
        if choices:
            return choices[referral.student_id % len(choices)]
    return DEFAULT_ANSWERS.get(question.label, FALLBACK_ANSWER)


def backfill_referral_responses(referral, questions=None):
    """Fills in any ReferralResponse rows missing for this referral with
    placeholder answers, and repairs any dropdown-question answer that isn't
    actually one of its choices (e.g. the old FALLBACK_ANSWER text, invalid
    now the question is a dropdown - a select field must never be able to
    hold an answer outside its own choice list). Returns the number of
    responses created or corrected."""
    if questions is None:
        questions = ReferralQuestion.objects.filter(is_active=True)
    existing = {r.question_id: r for r in referral.responses.all()}
    changed = 0
    for question in questions:
        response = existing.get(question.id)
        if response is None:
            ReferralResponse.objects.create(
                referral=referral, question=question, answer=_placeholder_answer(referral, question),
            )
            changed += 1
        elif question.question_type == 'select':
            choices = question.choice_list()
            if choices and response.answer not in choices:
                response.answer = _placeholder_answer(referral, question)
                response.save(update_fields=['answer'])
                changed += 1
    return changed
