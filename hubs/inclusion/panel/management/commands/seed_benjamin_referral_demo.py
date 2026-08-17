import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Staff, Student
from hubs.inclusion.panel.management.seed_helpers import backfill_referral_responses
from hubs.inclusion.panel.models import InclusionReferral, Panel, PanelGroup, PanelReferral
from hubs.inclusion.panel.views import _sync_referral_status

# Enough per tab for the phone carousel (#116) to actually have something to
# swipe/drag through in each of My Referrals' Awaiting Discussion / Discussed
# tabs, not just prove a single card renders.
AWAITING_TARGET = 5
DISCUSSED_TARGET = 5


class Command(BaseCommand):
    help = (
        "Tops up Benjamin Suri's My Referrals (Panel Home) with a few open "
        '"Awaiting Discussion" and a few "Discussed" referrals, so the phone '
        "carousel/tab-row (#116) has enough cards per tab to actually test. "
        'Idempotent - reruns only create however many more are needed to '
        'reach the target counts.'
    )

    def handle(self, *args, **options):
        try:
            benjamin = Staff.objects.get(first_name='Benjamin', last_name='Suri')
        except Staff.DoesNotExist:
            raise CommandError('Benjamin Suri not found. Run manage.py seed_dummy_data first.')

        # Same queryset/tab split as inclusion_panel() (views.py) - "my
        # referrals" is status='open' + raised_by=Benjamin; discussed_pr
        # reads the full panel_referrals history (any discussion_status=
        # 'discussed' row, removed or not), not just currently-active ones.
        my_referrals = list(InclusionReferral.objects.filter(status='open', raised_by=benjamin))
        awaiting = [r for r in my_referrals if not r.panel_referrals.filter(discussion_status='discussed').exists()]
        discussed = [r for r in my_referrals if r.panel_referrals.filter(discussion_status='discussed').exists()]

        used_student_ids = set(InclusionReferral.objects.values_list('student_id', flat=True))
        candidates = list(
            Student.objects.filter(is_active=True).exclude(pk__in=used_student_ids).order_by('id')
        )

        def next_student():
            return candidates.pop(0) if candidates else None

        created_awaiting = 0
        while len(awaiting) < AWAITING_TARGET:
            student = next_student()
            if not student:
                self.stdout.write(self.style.WARNING(
                    'Ran out of students without a referral - stopping the awaiting batch early.'
                ))
                break
            referral = InclusionReferral.create_for(student, raised_by=benjamin)
            backfill_referral_responses(referral)
            awaiting.append(referral)
            created_awaiting += 1

        panel = self._demo_panel()
        created_discussed = 0
        while len(discussed) < DISCUSSED_TARGET:
            student = next_student()
            if not student:
                self.stdout.write(self.style.WARNING(
                    'Ran out of students without a referral - stopping the discussed batch early.'
                ))
                break
            referral = InclusionReferral.create_for(student, raised_by=benjamin)
            backfill_referral_responses(referral)
            pr = PanelReferral.objects.create(
                panel=panel,
                referral=referral,
                discussion_status='discussed',
                discussion_started_at=timezone.now() - datetime.timedelta(days=3),
                duration=datetime.timedelta(minutes=15),
            )
            # Soft-remove it immediately - _sync_referral_status only counts
            # *active* (removed_at is null) rows, so this is what keeps the
            # referral itself 'open' (the only status My Referrals' own
            # queryset shows) while its card still reads as "Discussed",
            # exactly the (admittedly edge-case) real path that combination
            # requires - a referral discussed once, then unpicked from that
            # panel, with no new discussion attached since.
            pr.removed_at = timezone.now()
            pr.save(update_fields=['removed_at'])
            _sync_referral_status(referral)
            discussed.append(referral)
            created_discussed += 1

        self.stdout.write(self.style.SUCCESS(
            f'Benjamin Suri: {len(awaiting)} awaiting ({created_awaiting} new), '
            f'{len(discussed)} discussed ({created_discussed} new).'
        ))

    def _demo_panel(self):
        # Any real (grouped) Panel works as the vessel for the discussed-then
        # -removed PanelReferral above - reusing an existing one rather than
        # always creating a fresh throwaway avoids piling up empty Panel rows
        # on every rerun. Not an unassigned (panel_group=None) Panel - those
        # get deleted by seed_panel_meetings' own cleanup pass, which would
        # cascade-delete this row's PanelReferral along with it.
        panel = Panel.objects.filter(panel_group__isnull=False).order_by('id').first()
        if panel:
            return panel
        group = PanelGroup.objects.filter(is_active=True).order_by('id').first()
        if not group:
            raise CommandError('No PanelGroup found - run manage.py seed_panel_groups first.')
        return Panel.objects.create(
            panel_group=group, date=timezone.localdate(), status='complete', chair=group.default_chair,
        )
