from django.core.management.base import BaseCommand, CommandError

from core.models import Staff


class Command(BaseCommand):
    help = 'Ensures Benjamin Suri is marked as MAT staff and developer (no school affiliation).'

    def handle(self, *args, **options):
        try:
            benjamin = Staff.objects.get(first_name='Benjamin', last_name='Suri')
        except Staff.DoesNotExist:
            raise CommandError(
                'Benjamin Suri not found in Staff. Run manage.py seed_dummy_data first.'
            )

        changed = []
        if not benjamin.is_mat_staff:
            benjamin.is_mat_staff = True
            changed.append('is_mat_staff')
        if not benjamin.is_developer:
            benjamin.is_developer = True
            changed.append('is_developer')
        # So the default test identity can immediately try writing a
        # Safeguarding Briefing (#52) without switching to a seeded SENDCo.
        if not benjamin.is_dsl:
            benjamin.is_dsl = True
            changed.append('is_dsl')
        if benjamin.school is not None:
            benjamin.school = None
            changed.append('school')

        if changed:
            benjamin.save(update_fields=changed)

        self.stdout.write(self.style.SUCCESS(
            f'{benjamin}: is_mat_staff={benjamin.is_mat_staff}, '
            f'is_developer={benjamin.is_developer}, is_dsl={benjamin.is_dsl}, school={benjamin.school}.'
        ))
