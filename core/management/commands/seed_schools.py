from django.core.management.base import BaseCommand

from core.management.commands.seed_dummy_data import (
    MAT_STAFF_CODES,
    SCHOOL_STUDENT_COUNTS,
    SENCO_SCHOOL_ASSIGNMENTS,
)
from core.models import School, Staff, Student

SCHOOLS = [(name, category) for name, category, _ in SCHOOL_STUDENT_COUNTS]


class Command(BaseCommand):
    help = (
        'Seeds the real Schools and backfills existing Staff/Student rows to a '
        'school round-robin. Run after seed_dummy_data, before seed_benjamin_admin.'
    )

    def handle(self, *args, **options):
        schools = []
        for name, category in SCHOOLS:
            school, _ = School.objects.get_or_create(name=name, defaults={'category': category})
            if school.category != category:
                school.category = category
                school.save()
            schools.append(school)
        self.stdout.write(self.style.SUCCESS(f'Schools in DB: {School.objects.count()}'))

        staff_updated = 0
        school_staff = [
            s for s in Staff.objects.order_by('id')
            if s.staff_code not in MAT_STAFF_CODES and s.staff_code not in SENCO_SCHOOL_ASSIGNMENTS
        ]
        for i, staff in enumerate(school_staff):
            school = schools[i % len(schools)]
            if staff.school_id != school.id:
                staff.school = school
                staff.save(update_fields=['school'])
                staff_updated += 1
        mat_updated = Staff.objects.filter(staff_code__in=MAT_STAFF_CODES).exclude(school=None).update(school=None)
        self.stdout.write(self.style.SUCCESS(
            f'Staff assigned to a school: {staff_updated} updated ({mat_updated} reset to MAT-wide).'
        ))

        schools_by_name = {school.name: school for school in schools}
        senco_updated = 0
        for staff_code, school_name in SENCO_SCHOOL_ASSIGNMENTS.items():
            school = schools_by_name[school_name]
            updated = Staff.objects.filter(staff_code=staff_code).exclude(school=school).update(school=school)
            senco_updated += updated
        self.stdout.write(self.style.SUCCESS(f'SENDCo staff assigned to their school: {senco_updated} updated.'))

        student_updated = 0
        students = list(Student.objects.order_by('id'))
        offset = 0
        for school, (_, _, count) in zip(schools, SCHOOL_STUDENT_COUNTS):
            for student in students[offset:offset + count]:
                if student.school_id != school.id:
                    student.school = school
                    student.save(update_fields=['school'])
                    student_updated += 1
            offset += count
        self.stdout.write(self.style.SUCCESS(f'Students assigned to a school: {student_updated} updated.'))

        # Babington is the one school piloting a house system for now (see
        # issue #8) - deterministic A-E cycle by student id, not random.
        # Other schools stay blank ("no house") rather than being forced
        # into a scheme they don't use.
        babington = schools_by_name.get('Babington Academy')
        house_updated = 0
        if babington:
            houses = ['A', 'B', 'C', 'D', 'E']
            for i, student in enumerate(Student.objects.filter(school=babington).order_by('id')):
                house = houses[i % len(houses)]
                if student.house != house:
                    student.house = house
                    student.save(update_fields=['house'])
                    house_updated += 1
        if house_updated:
            self.stdout.write(self.style.SUCCESS(f'Babington students assigned a house: {house_updated} updated.'))
