from django.core.management.base import BaseCommand

from core.management.commands.seed_dummy_data import (
    PRIMARY_YEAR_GROUPS,
    SECONDARY_YEAR_GROUPS,
    SENCO_SCHOOL_ASSIGNMENTS,
)
from core.models import School, Staff, StaffGroup, StaffGroupMember

# Illustrative demo assignment only, same as seed_dummy_data's own STAFF list -
# no real "Careers" department exists yet to filter by, so this is just two
# deterministic staff codes standing in for a MAT-wide Careers Team.
CAREERS_TEAM_STAFF_CODES = ['STF009', 'STF010']


class Command(BaseCommand):
    help = (
        'Seeds core.StaffGroup rows a task/action can be assigned to instead of one '
        'individual Staff member: a SENCo Team per school (reusing the existing SENDCo '
        'assignment), Head of Year N per school/year group (created without members - no '
        'data exists yet for who actually holds that role), and one MAT-wide Careers Team. '
        'Run after seed_dummy_data and seed_schools.'
    )

    def handle(self, *args, **options):
        senco_group_count = 0
        senco_member_count = 0
        for school in School.objects.filter(is_active=True):
            group, _ = StaffGroup.objects.get_or_create(name='SENCo Team', school=school, year_group=None)
            senco_group_count += 1
            senco_staff_codes = [code for code, school_name in SENCO_SCHOOL_ASSIGNMENTS.items() if school_name == school.name]
            for staff in Staff.objects.filter(staff_code__in=senco_staff_codes):
                _, created = StaffGroupMember.objects.get_or_create(group=group, staff=staff)
                senco_member_count += created
        self.stdout.write(self.style.SUCCESS(
            f'SENCo Team groups: {senco_group_count} ({senco_member_count} memberships created).'
        ))

        hoy_group_count = 0
        for school in School.objects.filter(is_active=True):
            year_groups = PRIMARY_YEAR_GROUPS if school.category == 'Primary' else SECONDARY_YEAR_GROUPS
            for year_group in year_groups:
                StaffGroup.objects.get_or_create(
                    name=f'Head of Year {year_group}', school=school, year_group=year_group,
                )
                hoy_group_count += 1
        self.stdout.write(self.style.SUCCESS(
            f'Head of Year groups: {hoy_group_count} (no members seeded - real holder TBD).'
        ))

        careers_group, _ = StaffGroup.objects.get_or_create(name='Careers Team', school=None, year_group=None)
        careers_member_count = 0
        for staff in Staff.objects.filter(staff_code__in=CAREERS_TEAM_STAFF_CODES):
            _, created = StaffGroupMember.objects.get_or_create(group=careers_group, staff=staff)
            careers_member_count += created
        self.stdout.write(self.style.SUCCESS(f'Careers Team: {careers_member_count} memberships created.'))
