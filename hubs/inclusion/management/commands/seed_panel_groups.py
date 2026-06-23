from django.core.management.base import BaseCommand

from core.models import School, Staff
from hubs.inclusion.models import Expertise, PanelGroup, PanelGroupMember

EXPERTISE_NAMES = ['SEND', 'EAL', 'Pastoral', 'Safeguarding', 'Attendance', 'Mental Health']

MEMBERS_PER_GROUP = 3


class Command(BaseCommand):
    help = (
        'Seeds Expertise tags and ensures every active School has at least one Panel '
        'Group with a few members tagged by expertise. Run after seed_schools.'
    )

    def handle(self, *args, **options):
        for i, name in enumerate(EXPERTISE_NAMES):
            Expertise.objects.get_or_create(name=name, defaults={'order': i})
        self.stdout.write(self.style.SUCCESS(f'Expertise tags in DB: {Expertise.objects.count()}'))

        expertise_list = list(Expertise.objects.filter(name__in=EXPERTISE_NAMES).order_by('order'))

        for school in School.objects.filter(is_active=True):
            group_name = 'Babington Panel' if school.name == 'Babington Academy' else f'{school.name} Panel'
            group, _ = PanelGroup.objects.get_or_create(
                school=school, name=group_name, defaults={'is_active': True},
            )

            staff_pool = list(Staff.objects.filter(school=school, is_active=True)[:MEMBERS_PER_GROUP])
            for idx, staff in enumerate(staff_pool):
                PanelGroupMember.objects.update_or_create(
                    panel_group=group, staff=staff,
                    defaults={'expertise': expertise_list[idx % len(expertise_list)]},
                )
            self.stdout.write(self.style.SUCCESS(
                f'{group.name} ({school.name}): {len(staff_pool)} member(s) seeded.'
            ))
