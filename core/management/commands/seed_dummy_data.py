import datetime

from django.core.management.base import BaseCommand

from core.models import Staff, Student

STAFF = [
    ('STF001', 'Alice', 'Mitchell', 'Principal', 'Senior Leadership'),
    ('STF002', 'Benjamin', 'Suri', 'Data Guru', 'Senior Leadership'),
    ('STF003', 'Clara', 'Ng', 'Teacher', 'Maths'),
    ('STF004', 'David', 'Foster', 'Teacher', 'English'),
    ('STF005', 'Emily', 'Watson', 'Teacher', 'Science'),
    ('STF006', 'Farah', 'Hussain', 'SENDCo', 'Inclusion'),
    ('STF007', 'George', 'Patel', 'Administrator', 'Pastoral'),
    ('STF008', 'Hannah', 'O\'Brien', 'Teaching Assistant', 'Maths'),
    ('STF009', 'Ian', 'Reynolds', 'Teacher', 'English'),
    ('STF010', 'Jasmine', 'Lee', 'Teaching Assistant', 'Science'),
    ('STF011', 'Patricia', 'Adeyemi', 'CEO', 'MAT Central'),
    ('STF012', 'Robert', 'Kingsley', 'MAT HR Director', 'MAT Central'),
    ('STF013', 'Maya', 'Okafor', 'SENDCo', 'Inclusion'),
    ('STF014', 'Daniel', 'Whitfield', 'SENDCo', 'Inclusion'),
    ('STF015', 'Priya', 'Chandra', 'SENDCo', 'Inclusion'),
    ('STF016', 'Connor', 'Boyle', 'SENDCo', 'Inclusion'),
    ('STF017', 'Sofia', 'Marchetti', 'SENDCo', 'Inclusion'),
]

# Staff who work across the whole Trust rather than at one school — seed_schools
# leaves their `school` FK as None instead of assigning them in the round-robin.
MAT_STAFF_CODES = {'STF011', 'STF012'}

# Explicit per-school SENDCo assignment (overrides the generic round-robin in
# seed_schools.py) so every school is guaranteed exactly one SENDCo, except
# Babington Academy which gets two.
SENCO_SCHOOL_ASSIGNMENTS = {
    'STF006': 'Heatherbrook',
    'STF013': 'Woodstock',
    'STF014': 'Babington Academy',
    'STF015': 'Babington Academy',
    'STF016': 'Lancaster Academy',
    'STF017': 'South Wigston Academy',
}

# Single source of truth for both this command and seed_schools.py: how many
# students each school gets (30 per primary, 60 per secondary) and in what
# order, so the flat student list generated here can be sliced into
# per-school blocks there.
SCHOOL_STUDENT_COUNTS = [
    ('Heatherbrook', 'Primary', 30),
    ('Woodstock', 'Primary', 30),
    ('Babington Academy', 'Secondary', 60),
    ('Lancaster Academy', 'Secondary', 60),
    ('South Wigston Academy', 'Secondary', 60),
]
TOTAL_STUDENTS = sum(count for _, _, count in SCHOOL_STUDENT_COUNTS)
CATEGORY_BY_INDEX = [
    category
    for _, category, count in SCHOOL_STUDENT_COUNTS
    for _ in range(count)
]

# Deterministic SEND assignment matching national SEND statistics (SEN
# Support ~14.2% of pupils, EHCP ~5.3% of pupils), using modulo checks
# (1/19 = 5.3%, 1/7 = 14.3%) so the ratio holds regardless of population
# size and reseeding stays idempotent (not random).
def _sen_status(i):
    if i % 19 == 0:
        return 'E'
    if i % 7 == 0:
        return 'K'
    return ''


# Cycles through the 4 broad needs in order.
SEND_NEEDS = ['cognition', 'semh', 'communication', 'sensory']

PRIMARY_YEAR_GROUPS = [1, 2, 3, 4, 5, 6]
SECONDARY_YEAR_GROUPS = [7, 8, 9, 10, 11]
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
    'Hill', 'Ward', 'Cooper', 'Hughes', 'Edwards', 'Baker', 'Morris',
    'Cox', 'King',
]


class Command(BaseCommand):
    help = 'Seeds dummy Staff and Student rows for local development.'

    def handle(self, *args, **options):
        staff_objs = []
        for staff_code, first_name, last_name, job_title, department in STAFF:
            email_last = last_name.lower().replace("'", '')
            staff, _ = Staff.objects.update_or_create(
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
        for i in range(TOTAL_STUDENTS):
            # Pair first/last names by treating i as a base-len(FIRST_NAMES)
            # number: the first-name index cycles every row but the
            # last-name index only advances once every len(FIRST_NAMES) rows,
            # so every (first, last) combination up to
            # len(FIRST_NAMES) * len(LAST_NAMES) students is unique instead
            # of both cycling in lockstep and repeating together.
            first_name = FIRST_NAMES[i % len(FIRST_NAMES)]
            last_name = LAST_NAMES[(i // len(FIRST_NAMES)) % len(LAST_NAMES)]
            year_groups = (
                PRIMARY_YEAR_GROUPS if CATEGORY_BY_INDEX[i] == 'Primary' else SECONDARY_YEAR_GROUPS
            )
            year_group = year_groups[i % len(year_groups)]
            reg_form = f'{year_group}{FORM_LETTERS[i % len(FORM_LETTERS)]}'
            upn = f'X9000{i:04d}A123'
            dob_year = 2026 - year_group - 5
            sen_status = _sen_status(i)
            send_need = SEND_NEEDS[i % len(SEND_NEEDS)] if sen_status else ''
            gender = 'M' if i % 2 == 0 else 'F'
            _, created_flag = Student.objects.update_or_create(
                upn=upn,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'year_group': year_group,
                    'reg_form': reg_form,
                    'form_tutor': staff_objs[i % len(staff_objs)],
                    'date_of_birth': datetime.date(dob_year, 1 + (i % 12), 1 + (i % 28)),
                    'sen_status': sen_status,
                    'send_need': send_need,
                    'gender': gender,
                    'is_pp': i % 4 == 0,
                    'is_eal': i % 6 == 0,
                    'is_lac': i % 23 == 0,
                    'is_young_carer': i % 17 == 0,
                },
            )
            if created_flag:
                created += 1
        self.stdout.write(self.style.SUCCESS(
            f'Seed complete. Students in DB: {Student.objects.count()} ({created} newly created).'
        ))
