import datetime

from django.core.management.base import BaseCommand, CommandError

from core.models import School, Staff, Student
from hubs.inclusion.models import Action, PanelGroup, PanelGroupMember, Referral

TARGET_REFERRALS = 3
TARGET_ACTIONS = 3


class Command(BaseCommand):
    help = (
        'Makes Benjamin Suri the default Inclusion Panel test identity: chair of '
        '"Babington Panel" (so he sees sensitive items), with some referrals and actions.'
    )

    def handle(self, *args, **options):
        try:
            benjamin = Staff.objects.get(first_name='Benjamin', last_name='Suri')
        except Staff.DoesNotExist:
            raise CommandError(
                'Benjamin Suri not found in Staff. Run manage.py seed_dummy_data first.'
            )

        try:
            babington_academy = School.objects.get(name='Babington Academy')
        except School.DoesNotExist:
            raise CommandError(
                'School "Babington Academy" not found. Run manage.py seed_schools first.'
            )

        if not benjamin.is_mat_staff:
            benjamin.is_mat_staff = True
            benjamin.save(update_fields=['is_mat_staff'])

        if not benjamin.is_developer:
            benjamin.is_developer = True
            benjamin.save(update_fields=['is_developer'])

        panel_group, _ = PanelGroup.objects.get_or_create(
            name='Babington Panel',
            defaults={'default_chair': benjamin, 'is_active': True, 'school': babington_academy},
        )
        if (
            panel_group.default_chair_id != benjamin.id
            or not panel_group.is_active
            or panel_group.school_id != babington_academy.id
        ):
            panel_group.default_chair = benjamin
            panel_group.is_active = True
            panel_group.school = babington_academy
            panel_group.save()

        PanelGroupMember.objects.get_or_create(panel_group=panel_group, staff=benjamin)
        self.stdout.write(self.style.SUCCESS(
            f'{benjamin} is chair of "{panel_group.name}".'
        ))

        existing_referrals = Referral.objects.filter(raised_by=benjamin).count()
        to_create = TARGET_REFERRALS - existing_referrals
        new_referrals = []
        if to_create > 0:
            candidates = Student.objects.filter(is_active=True).exclude(
                referrals__raised_by=benjamin
            ).order_by('id')[:to_create]
            for student in candidates:
                new_referrals.append(Referral.objects.create(student=student, raised_by=benjamin))
        self.stdout.write(self.style.SUCCESS(
            f'Referrals raised by {benjamin}: {existing_referrals + len(new_referrals)}.'
        ))

        existing_actions = Action.objects.filter(assigned_to=benjamin).count()
        to_create = TARGET_ACTIONS - existing_actions
        new_actions = 0
        if to_create > 0:
            pool = list(Referral.objects.filter(raised_by=benjamin)) or list(
                Referral.objects.order_by('-created_at')[:TARGET_ACTIONS]
            )
            today = datetime.date.today()
            for i in range(to_create):
                if not pool:
                    break
                referral = pool[i % len(pool)]
                Action.objects.create(
                    referral=referral,
                    assigned_to=benjamin,
                    due_date=today + datetime.timedelta(days=7 * (i + 1)),
                    status='incomplete',
                )
                new_actions += 1
        self.stdout.write(self.style.SUCCESS(
            f'Actions assigned to {benjamin}: {existing_actions + new_actions}.'
        ))
