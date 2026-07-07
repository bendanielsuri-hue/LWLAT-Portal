from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Referral as CoreReferral, Student
from hubs.inclusion.panel.management.seed_helpers import backfill_referral_responses
from hubs.inclusion.panel.models import InclusionReferral, PanelReferral, ReferralQuestion


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
            responses_created += backfill_referral_responses(referral, questions=questions)

        self.stdout.write(self.style.SUCCESS(
            f'Backfilled {responses_created} referral response(s) for existing referrals.'
        ))
