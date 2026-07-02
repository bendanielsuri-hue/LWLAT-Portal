from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Referral as CoreReferral, Student
from hubs.inclusion.panel.models import InclusionReferral, PanelReferral, ReferralQuestion, ReferralResponse


def _create_inclusion_referral(student, status='open', raised_by=None):
    base = CoreReferral.objects.create(
        referral_type=CoreReferral.TYPE_INCLUSION,
        student=student,
        raised_by=raised_by,
        date_referred=timezone.localdate(),
        status=CoreReferral.STATUS_CLOSED if status == 'closed' else CoreReferral.STATUS_OPEN,
    )
    return InclusionReferral.objects.create(
        referral=base, student=student, raised_by=raised_by, status=status,
    )

TARGET_UNASSIGNED_COUNT = 5

# Deterministic placeholder answers, keyed by question label, so every demo
# referral has something to show in the Referral Details panel instead of a
# blank screen. Falls back to a generic line for any question not listed here.
DEFAULT_ANSWERS = {
    'Concern Details': 'Ongoing low-level disruption in lessons and difficulty settling at the start of the day.',
    'Parent Voice': 'Parents are aware and supportive of any extra support the school can put in place.',
    'Student Voice': 'Student says they sometimes find it hard to concentrate and would like some extra help.',
    'What has been put in place so far?': 'Seating plan adjustments and a check-in with form tutor each morning.',
}
FALLBACK_ANSWER = 'No further detail recorded.'


class Command(BaseCommand):
    help = 'Seeds a handful of unassigned referrals (no PanelReferral) for local development.'

    def handle(self, *args, **options):
        unassigned_count = InclusionReferral.objects.exclude(
            pk__in=PanelReferral.objects.filter(removed_at__isnull=True).values_list('referral_id', flat=True)
        ).count()

        to_create = TARGET_UNASSIGNED_COUNT - unassigned_count
        if to_create <= 0:
            self.stdout.write(self.style.SUCCESS(
                f'Already have {unassigned_count} unassigned referrals — nothing to do.'
            ))
        else:
            students_with_referrals = InclusionReferral.objects.values_list('student_id', flat=True)
            candidates = Student.objects.filter(is_active=True).exclude(
                pk__in=students_with_referrals
            ).order_by('id')[:to_create]

            created = 0
            for student in candidates:
                _create_inclusion_referral(student)
                created += 1

            self.stdout.write(self.style.SUCCESS(
                f'Created {created} unassigned referral(s). Total unassigned: {unassigned_count + created}.'
            ))

        questions = list(ReferralQuestion.objects.filter(is_active=True))
        responses_created = 0
        for referral in InclusionReferral.objects.all():
            answered_question_ids = set(referral.responses.values_list('question_id', flat=True))
            for question in questions:
                if question.id in answered_question_ids:
                    continue
                ReferralResponse.objects.get_or_create(
                    referral=referral,
                    question=question,
                    defaults={'answer': DEFAULT_ANSWERS.get(question.label, FALLBACK_ANSWER)},
                )
                responses_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Backfilled {responses_created} referral response(s) for existing referrals.'
        ))
