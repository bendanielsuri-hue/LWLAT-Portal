import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import School, Student
from hubs.inclusion.panel.models import Panel, PanelGroup, PanelReferral, Referral

# (days offset from today, target referral count). Negative offset = past.
PAST_SPECS_BABINGTON = [(-60, 4), (-30, 3)]
PAST_SPECS_OTHER_SCHOOLS = [(-45, 3), (-15, 2)]
FUTURE_OFFSET_DAYS = 14
DISCUSSION_MINUTES = [12, 18, 25, 9]


def _canonical_group(school):
    return (
        PanelGroup.objects.filter(school=school, is_active=True, name=f'{school.name} Panel').first()
        or PanelGroup.objects.filter(school=school, is_active=True, default_chair__isnull=False).first()
        or PanelGroup.objects.filter(school=school, is_active=True).order_by('id').first()
    )


class Command(BaseCommand):
    help = (
        'Fixes past Panels stuck with status="upcoming", then seeds one or two past '
        '(complete, with discussed demo referrals) and one upcoming Panel meeting for '
        'every active School\'s panel group. Run after seed_panel_groups.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()
        students_used = set(Referral.objects.values_list('student_id', flat=True))

        stale = Panel.objects.filter(date__lt=today, status='upcoming')
        stale_count = stale.update(status='complete')
        if stale_count:
            self.stdout.write(self.style.SUCCESS(f'Fixed {stale_count} past panel(s) wrongly marked "upcoming".'))

        for school in School.objects.filter(is_active=True):
            group = _canonical_group(school)
            if group is None:
                self.stdout.write(self.style.WARNING(f'No active PanelGroup for {school.name} — skipping.'))
                continue

            past_specs = PAST_SPECS_BABINGTON if school.name == 'Babington Academy' else PAST_SPECS_OTHER_SCHOOLS
            for offset, referral_target in past_specs:
                panel_date = today + datetime.timedelta(days=offset)
                panel, created = Panel.objects.get_or_create(
                    panel_group=group,
                    date=panel_date,
                    defaults={'status': 'complete', 'chair': group.default_chair},
                )
                self.stdout.write(self.style.SUCCESS(
                    f'{"Created" if created else "Found"} past panel {panel_date} for {group.name} ({school.name}).'
                ))

                existing_links = PanelReferral.objects.filter(panel=panel, removed_at__isnull=True).count()
                to_create = referral_target - existing_links
                if to_create <= 0:
                    self.stdout.write(f'  Already has {existing_links} referral(s) linked — nothing to add.')
                    continue

                candidates = Student.objects.filter(school=school, is_active=True).exclude(
                    pk__in=students_used
                ).order_by('id')[:to_create]

                for idx, student in enumerate(candidates):
                    referral = Referral.objects.create(student=student, status='in_panel')
                    students_used.add(student.id)
                    minutes = DISCUSSION_MINUTES[idx % len(DISCUSSION_MINUTES)]
                    discussed_at = timezone.make_aware(
                        datetime.datetime.combine(panel_date, datetime.time(hour=14, minute=0))
                    )
                    PanelReferral.objects.create(
                        panel=panel,
                        referral=referral,
                        discussion_status='discussed',
                        priority=['low', 'medium', 'high'][idx % 3],
                        discussion_started_at=discussed_at,
                        duration=datetime.timedelta(minutes=minutes),
                    )
                self.stdout.write(self.style.SUCCESS(
                    f'  Linked {len(candidates)} new discussed referral(s) to panel {panel_date}.'
                ))

            future_date = today + datetime.timedelta(days=FUTURE_OFFSET_DAYS)
            panel, created = Panel.objects.get_or_create(
                panel_group=group,
                date=future_date,
                defaults={'status': 'upcoming', 'chair': group.default_chair},
            )
            self.stdout.write(self.style.SUCCESS(
                f'{"Created" if created else "Found"} upcoming panel {future_date} for {group.name} ({school.name}).'
            ))
