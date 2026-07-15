import datetime

from django.core.management.base import BaseCommand

from core.models import AcademicYear, Term

# MAT-wide (school=None) term dates from the trust's published term-dates
# sheets. Deliberately excludes INSET days/bank holidays (out of scope - see
# docs/adr/0008-academic-year-term-model-shape.md) and holiday periods
# (derived from the gaps between these rows, not stored).
TERM_DATES = [
    # 2025/26
    {
        'academic_year': (datetime.date(2025, 8, 26), datetime.date(2026, 7, 8)),
        'terms': [
            (Term.TERM_AUTUMN, datetime.date(2025, 8, 26), datetime.date(2025, 12, 18),
             datetime.date(2025, 10, 20), datetime.date(2025, 10, 24)),
            (Term.TERM_SPRING, datetime.date(2026, 1, 6), datetime.date(2026, 3, 27),
             datetime.date(2026, 2, 16), datetime.date(2026, 2, 20)),
            (Term.TERM_SUMMER, datetime.date(2026, 4, 13), datetime.date(2026, 7, 8),
             datetime.date(2026, 5, 25), datetime.date(2026, 5, 29)),
        ],
    },
    # 2026/27
    {
        'academic_year': (datetime.date(2026, 8, 25), datetime.date(2027, 7, 9)),
        'terms': [
            (Term.TERM_AUTUMN, datetime.date(2026, 8, 25), datetime.date(2026, 12, 18),
             datetime.date(2026, 10, 19), datetime.date(2026, 10, 23)),
            (Term.TERM_SPRING, datetime.date(2027, 1, 6), datetime.date(2027, 3, 19),
             datetime.date(2027, 2, 15), datetime.date(2027, 2, 19)),
            (Term.TERM_SUMMER, datetime.date(2027, 4, 5), datetime.date(2027, 7, 9),
             datetime.date(2027, 5, 31), datetime.date(2027, 6, 4)),
        ],
    },
]


class Command(BaseCommand):
    help = 'Seeds MAT-wide AcademicYear/Term rows from the trust\'s published term-dates sheets.'

    def handle(self, *args, **options):
        years_created = 0
        terms_created = 0
        for entry in TERM_DATES:
            start_date, end_date = entry['academic_year']
            year, created = AcademicYear.objects.get_or_create(
                start_date=start_date, defaults={'end_date': end_date},
            )
            if created:
                years_created += 1
            elif year.end_date != end_date:
                year.end_date = end_date
                year.save(update_fields=['end_date'])

            for name, term_start, term_end, half_term_start, half_term_end in entry['terms']:
                term, created = Term.objects.get_or_create(
                    academic_year=year, name=name, school=None,
                    defaults={
                        'start_date': term_start, 'end_date': term_end,
                        'half_term_start': half_term_start, 'half_term_end': half_term_end,
                    },
                )
                if created:
                    terms_created += 1
                else:
                    changed = False
                    for field, value in (
                        ('start_date', term_start), ('end_date', term_end),
                        ('half_term_start', half_term_start), ('half_term_end', half_term_end),
                    ):
                        if getattr(term, field) != value:
                            setattr(term, field, value)
                            changed = True
                    if changed:
                        term.save()

        self.stdout.write(self.style.SUCCESS(
            f'AcademicYears in DB: {AcademicYear.objects.count()} ({years_created} created). '
            f'Terms in DB: {Term.objects.count()} ({terms_created} created).'
        ))
