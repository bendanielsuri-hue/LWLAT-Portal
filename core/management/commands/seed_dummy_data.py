import datetime

from django.core.management.base import BaseCommand

from core.models import Staff, Student

STAFF = [
    ('STF001', 'Alice', 'Mitchell', 'Headteacher', 'Senior Leadership'),
    ('STF002', 'Benjamin', 'Suri', 'Deputy Headteacher', 'Senior Leadership'),
    ('STF003', 'Clara', 'Ng', 'Head of Maths', 'Maths'),
    ('STF004', 'David', 'Foster', 'Head of English', 'English'),
    ('STF005', 'Emily', 'Watson', 'Head of Science', 'Science'),
    ('STF006', 'Farah', 'Hussain', 'SENDCo', 'Inclusion'),
    ('STF007', 'George', 'Patel', 'Pastoral Lead', 'Pastoral'),
    ('STF008', 'Hannah', 'O\'Brien', 'Teacher', 'Maths'),
    ('STF009', 'Ian', 'Reynolds', 'Teacher', 'English'),
    ('STF010', 'Jasmine', 'Lee', 'Teacher', 'Science'),
]

YEAR_GROUPS = [7, 8, 9, 10, 11]
FORM_LETTERS = ['A', 'B', 'C']
FIRST_NAMES = [
    'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Oliver', 'Sophia', 'Elijah',
    'Isabella', 'James', 'Mia', 'Henry', 'Amelia', 'Lucas', 'Harper', 'Jack',
    'Evelyn', 'Leo', 'Abigail', 'Charlie', 'Ella', 'Theo', 'Grace', 'Freddie',
    'Chloe', 'Oscar', 'Lily', 'Arthur', 'Zoe', 'Max',
]
LAST_NAMES = [
    'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson',
    'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White',
    'Roberts', 'Green', 'Hall', 'Wood', 'Jackson', 'Clarke', 'Turner',
    'Hill', 'Ward', 'Cooper', 'Hughes', 'Edwards', 'Green', 'Morris',
    'Cox', 'King',
]


class Command(BaseCommand):
    help = 'Seeds dummy Staff and Student rows for local development.'

    def handle(self, *args, **options):
        staff_objs = []
        for staff_code, first_name, last_name, job_title, department in STAFF:
            email_last = last_name.lower().replace("'", '')
            staff, _ = Staff.objects.get_or_create(
                staff_code=staff_code,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': f'{first_name.lower()}.{email_last}@example-mat.uk',
                    'job_title': job_title,
                    'department': department,
                },
            )
            staff_objs.append(staff)
        self.stdout.write(f'Staff in DB: {Staff.objects.count()}')

        created = 0
        for i in range(30):
            first_name = FIRST_NAMES[i % len(FIRST_NAMES)]
            last_name = LAST_NAMES[i % len(LAST_NAMES)]
            year_group = YEAR_GROUPS[i % len(YEAR_GROUPS)]
            reg_form = f'{year_group}{FORM_LETTERS[i % len(FORM_LETTERS)]}'
            upn = f'X9000{i:04d}A123'
            dob_year = 2026 - year_group - 5
            _, created_flag = Student.objects.get_or_create(
                upn=upn,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'year_group': year_group,
                    'reg_form': reg_form,
                    'form_tutor': staff_objs[i % len(staff_objs)],
                    'date_of_birth': datetime.date(dob_year, 1 + (i % 12), 1 + (i % 28)),
                },
            )
            if created_flag:
                created += 1
        self.stdout.write(self.style.SUCCESS(
            f'Seed complete. Students in DB: {Student.objects.count()} ({created} newly created).'
        ))
