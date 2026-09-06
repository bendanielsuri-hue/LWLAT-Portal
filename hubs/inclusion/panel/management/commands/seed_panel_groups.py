from django.core.management.base import BaseCommand

from core.models import School, Staff
from hubs.inclusion.panel.models import Expertise, PanelGroup, PanelGroupMember

EXPERTISE_NAMES = ['SEND', 'EAL', 'Pastoral', 'Safeguarding', 'Attendance', 'Mental Health']

MEMBERS_PER_GROUP = 3
MIN_MEMBERS = 2


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

        # The one MAT-wide Panel Group MAT Panel Meetings belong to (see
        # hubs/inclusion/panel/CONTEXT.md) - seeded with a real standing
        # roster of MAT staff (is_mat_staff, set by seed_benjamin_admin),
        # same convention as every school group's default roster, rather
        # than left empty. Ad-hoc invited attendees beyond this roster are
        # out of scope here - see #161.
        mat_group, _ = PanelGroup.objects.get_or_create(
            is_mat_wide=True, defaults={'name': 'MAT Panel', 'school': None, 'is_active': True},
        )
        mat_staff_pool = list(Staff.objects.filter(is_mat_staff=True, is_active=True).order_by('id'))
        for idx, staff in enumerate(mat_staff_pool):
            PanelGroupMember.objects.update_or_create(
                panel_group=mat_group, staff=staff,
                defaults={'expertise': expertise_list[idx % len(expertise_list)] if expertise_list else None},
            )
        if mat_group.default_chair_id is None and mat_staff_pool:
            mat_group.default_chair = mat_staff_pool[0]
            mat_group.save(update_fields=['default_chair'])
        self.stdout.write(self.style.SUCCESS(
            f'{mat_group.name}: {len(mat_staff_pool)} MAT staff member(s) seeded.'
        ))

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

            if group.default_chair_id is None and staff_pool:
                group.default_chair = staff_pool[0]
                group.save(update_fields=['default_chair'])
                self.stdout.write(self.style.SUCCESS(
                    f'  Set default chair for {group.name} to {staff_pool[0]}.'
                ))

        # Repair pass over every active PanelGroup, including legacy/duplicate
        # ones the per-school block above doesn't touch (e.g. a group with no
        # school, or a second group for a school that already has one) - Panel
        # Setup assumes every group has at least MIN_MEMBERS members and a
        # default chair, regardless of how the group came to exist.
        for group in PanelGroup.objects.filter(is_active=True):
            pool = list(
                (Staff.objects.filter(school_id=group.school_id, is_active=True) if group.school_id
                 else Staff.objects.filter(is_active=True)).order_by('id')
            )
            existing_staff_ids = set(
                group.members.exclude(staff__isnull=True).values_list('staff_id', flat=True)
            )
            member_count = group.members.count()
            if member_count < MIN_MEMBERS:
                extra = [s for s in pool if s.id not in existing_staff_ids][:MIN_MEMBERS - member_count]
                for idx, staff in enumerate(extra):
                    PanelGroupMember.objects.get_or_create(
                        panel_group=group, staff=staff,
                        defaults={'expertise': expertise_list[idx % len(expertise_list)]},
                    )
                if extra:
                    self.stdout.write(self.style.SUCCESS(
                        f'Topped up {group.name} with {len(extra)} member(s) (had {member_count}).'
                    ))
            if group.default_chair_id is None:
                chair_member = group.members.filter(staff__isnull=False).order_by('id').first()
                if chair_member:
                    group.default_chair = chair_member.staff
                    group.save(update_fields=['default_chair'])
                    self.stdout.write(self.style.SUCCESS(
                        f'Set default chair for {group.name} to {chair_member.staff}.'
                    ))
