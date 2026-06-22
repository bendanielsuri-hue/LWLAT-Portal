from django.core.management.base import BaseCommand

from core.models import School, Staff, Student

SCHOOLS = [
    ('Heatherbrook', 'Primary'),
    ('Woodstock', 'Primary'),
    ('Babington Academy', 'Secondary'),
    ('Lancaster Academy', 'Secondary'),
    ('South Wigston Academy', 'Secondary'),
]


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
        for i, staff in enumerate(Staff.objects.order_by('id')):
            school = schools[i % len(schools)]
            if staff.school_id != school.id:
                staff.school = school
                staff.save(update_fields=['school'])
                staff_updated += 1
        self.stdout.write(self.style.SUCCESS(f'Staff assigned to a school: {staff_updated} updated.'))

        student_updated = 0
        for i, student in enumerate(Student.objects.order_by('id')):
            school = schools[i % len(schools)]
            if student.school_id != school.id:
                student.school = school
                student.save(update_fields=['school'])
                student_updated += 1
        self.stdout.write(self.style.SUCCESS(f'Students assigned to a school: {student_updated} updated.'))
