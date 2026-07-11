from django.core.management.base import BaseCommand

from core.models import School, Staff, Student
from hubs.inclusion.panel.management.seed_helpers import backfill_raised_by, backfill_referral_responses
from hubs.inclusion.panel.models import InclusionReferral, PanelReferral, ReferralQuestion

TARGET_UNASSIGNED_PER_SCHOOL = 3


class Command(BaseCommand):
    help = 'Seeds a few unassigned referrals (no PanelReferral) per active School for local development.'

    def handle(self, *args, **options):
        assigned_referral_ids = PanelReferral.objects.filter(removed_at__isnull=True).values_list(
            'referral_id', flat=True
        )
        students_with_referrals = set(InclusionReferral.objects.values_list('student_id', flat=True))
        all_active_staff = list(Staff.objects.filter(is_active=True).order_by('id'))
        created = 0

        for school in School.objects.filter(is_active=True):
            unassigned_count = InclusionReferral.objects.filter(student__school=school).exclude(
                pk__in=assigned_referral_ids
            ).count()
            to_create = TARGET_UNASSIGNED_PER_SCHOOL - unassigned_count
            if to_create <= 0:
                self.stdout.write(self.style.SUCCESS(
                    f'{school.name}: already have {unassigned_count} unassigned referral(s) — nothing to do.'
                ))
                continue

            candidates = list(
                Student.objects.filter(school=school, is_active=True)
                .exclude(pk__in=students_with_referrals)
                .order_by('id')[:to_create]
            )
            staff_pool = list(Staff.objects.filter(is_active=True, school=school).order_by('id')) or all_active_staff
            for student in candidates:
                raised_by = staff_pool[student.id % len(staff_pool)] if staff_pool else None
                InclusionReferral.create_for(student, raised_by)
                students_with_referrals.add(student.id)
                created += 1

            if len(candidates) < to_create:
                self.stdout.write(self.style.WARNING(
                    f'{school.name}: only {len(candidates)} of {to_create} needed unassigned referral(s) '
                    f'created — no more students without one available.'
                ))
            else:
                self.stdout.write(self.style.SUCCESS(
                    f'{school.name}: created {len(candidates)} unassigned referral(s) '
                    f'(total now {unassigned_count + len(candidates)}).'
                ))

        if created:
            self.stdout.write(self.style.SUCCESS(f'Created {created} unassigned referral(s) in total.'))

        questions = list(ReferralQuestion.objects.filter(is_active=True))
        responses_created = 0
        raised_by_fixed = 0
        for referral in InclusionReferral.objects.select_related('referral', 'student').all():
            responses_created += backfill_referral_responses(referral, questions=questions)
            if backfill_raised_by(referral):
                raised_by_fixed += 1

        self.stdout.write(self.style.SUCCESS(
            f'Backfilled {responses_created} referral response(s) for existing referrals.'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Backfilled "Referred By" on {raised_by_fixed} referral(s) that had none.'
        ))
