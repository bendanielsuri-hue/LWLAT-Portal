from django.core.management.base import BaseCommand

from core.models import SafeguardingNote, Staff, Student

# Deterministic (student.id-keyed) one-line statements, not random - cycled
# per student so a rerun always produces the same text for the same student.
NOTE_TEXTS = [
    'EHCP annual review due this term.',
    'Home circumstances flagged by pastoral team - monitor wellbeing.',
    'Recent disclosure logged with local authority, awaiting outcome.',
    'Attendance dip linked to ongoing family situation.',
]


class Command(BaseCommand):
    help = (
        'Seeds a SafeguardingNote for a subset of seeded Students, authored by a '
        'seeded DSL (see core.models.Staff.is_dsl) - run after seed_dummy_data. '
        'Deterministic (student.id-keyed) and idempotent: skips any student who '
        'already has an active note rather than re-creating one each run.'
    )

    def handle(self, *args, **options):
        dsl_staff = list(Staff.objects.filter(is_dsl=True).order_by('id'))
        if not dsl_staff:
            self.stdout.write(self.style.WARNING('No is_dsl Staff found - run seed_dummy_data first. Nothing seeded.'))
            return

        students = list(Student.objects.order_by('id'))
        created = 0
        for student in students:
            if student.id % 4 != 0:
                continue
            if student.safeguarding_notes.filter(retired_at__isnull=True).exists():
                continue
            author = dsl_staff[student.id % len(dsl_staff)]
            text = NOTE_TEXTS[student.id % len(NOTE_TEXTS)]
            SafeguardingNote.objects.create(student=student, author=author, text=text)
            created += 1

        self.stdout.write(self.style.SUCCESS(f'SafeguardingNote rows created: {created}.'))
