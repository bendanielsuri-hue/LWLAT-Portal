from django.core.management.base import BaseCommand

from core.models import Student
from hubs.inclusion.models import PanelReferral, Referral

TARGET_UNASSIGNED_COUNT = 5


class Command(BaseCommand):
    help = 'Seeds a handful of unassigned referrals (no PanelReferral) for local development.'

    def handle(self, *args, **options):
        unassigned_count = Referral.objects.exclude(
            pk__in=PanelReferral.objects.filter(removed_at__isnull=True).values_list('referral_id', flat=True)
        ).count()

        to_create = TARGET_UNASSIGNED_COUNT - unassigned_count
        if to_create <= 0:
            self.stdout.write(self.style.SUCCESS(
                f'Already have {unassigned_count} unassigned referrals — nothing to do.'
            ))
            return

        students_with_referrals = Referral.objects.values_list('student_id', flat=True)
        candidates = Student.objects.filter(is_active=True).exclude(
            pk__in=students_with_referrals
        ).order_by('id')[:to_create]

        created = 0
        for student in candidates:
            Referral.objects.create(student=student)
            created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Created {created} unassigned referral(s). Total unassigned: {unassigned_count + created}.'
        ))
