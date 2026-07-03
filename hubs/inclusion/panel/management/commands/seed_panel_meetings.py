import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Referral as CoreReferral, School, Student
from hubs.inclusion.panel.models import (
    InclusionReferral, Panel, PanelGroup, PanelGroupMember, PanelMember, PanelReferral,
)

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


def _discussed_count(panel):
    return PanelReferral.objects.filter(
        panel=panel, removed_at__isnull=True, discussion_status='discussed',
    ).count()


class Command(BaseCommand):
    help = (
        'Repairs broken/duplicate past Panels (missing referrals, chair, or members) '
        'and tops up to one or two past (complete, with discussed demo referrals) plus '
        'one draft Panel meeting per active School\'s panel group. Run after '
        'seed_panel_groups. Idempotent regardless of what day it runs on.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()
        students_used = set(InclusionReferral.objects.values_list('student_id', flat=True))

        for school in School.objects.filter(is_active=True):
            group = _canonical_group(school)
            if group is None:
                self.stdout.write(self.style.WARNING(f'No active PanelGroup for {school.name} — skipping.'))
                continue

            past_specs = PAST_SPECS_BABINGTON if school.name == 'Babington Academy' else PAST_SPECS_OTHER_SCHOOLS

            # Reruns on different days must not accumulate past Panel rows without
            # bound: keep only the most recent len(past_specs) past "complete" panels
            # for this group and drop anything older before spending any effort
            # repairing referrals.
            existing_past = list(
                Panel.objects.filter(panel_group=group, status='complete', date__lt=today).order_by('date')
            )
            excess, kept_panels = existing_past[:-len(past_specs)] if existing_past else [], (
                existing_past[-len(past_specs):] if existing_past else []
            )
            for extra in excess:
                extra.delete()
                self.stdout.write(self.style.WARNING(
                    f'Deleted excess past panel {extra.date} for {group.name} (beyond target of {len(past_specs)}).'
                ))

            good_panels = []
            for panel in kept_panels:
                if _discussed_count(panel) > 0:
                    good_panels.append(panel)
                    continue

                # Kept but broken (no discussed referrals) — try to top it up.
                to_create = next((target for _offset, target in past_specs), 1) - PanelReferral.objects.filter(
                    panel=panel, removed_at__isnull=True,
                ).count()
                candidates = []
                if to_create > 0:
                    candidates = list(
                        Student.objects.filter(school=school, is_active=True)
                        .exclude(pk__in=students_used)
                        .order_by('id')[:to_create]
                    )
                if candidates:
                    self._link_referrals(panel, candidates, students_used)
                    good_panels.append(panel)
                    self.stdout.write(self.style.SUCCESS(
                        f'Repaired empty past panel {panel.date} for {group.name} with {len(candidates)} referral(s).'
                    ))
                else:
                    panel.delete()
                    self.stdout.write(self.style.WARNING(
                        f'Deleted empty past panel {panel.date} for {group.name} (no students available to repair it).'
                    ))

            shortfall = len(past_specs) - len(good_panels)
            if shortfall > 0:
                for offset, referral_target in past_specs[-shortfall:]:
                    panel_date = today + datetime.timedelta(days=offset)
                    candidates = list(
                        Student.objects.filter(school=school, is_active=True)
                        .exclude(pk__in=students_used)
                        .order_by('id')[:referral_target]
                    )
                    if not candidates:
                        self.stdout.write(self.style.WARNING(
                            f'No students available to seed a new past panel for {group.name} ({school.name}) — skipping.'
                        ))
                        continue
                    panel = Panel.objects.create(
                        panel_group=group, date=panel_date, status='complete', chair=group.default_chair,
                    )
                    self._link_referrals(panel, candidates, students_used)
                    self.stdout.write(self.style.SUCCESS(
                        f'Created past panel {panel_date} for {group.name} ({school.name}) '
                        f'with {len(candidates)} discussed referral(s).'
                    ))

            # Same date-drift problem applies to the single upcoming demo panel: keep
            # whichever one already exists rather than creating a new one keyed to
            # today's offset every time the command is rerun on a different day.
            upcoming = list(
                Panel.objects.filter(panel_group=group, date__gte=today)
                .exclude(status='complete').order_by('date')
            )
            for extra in upcoming[1:]:
                extra.delete()
                self.stdout.write(self.style.WARNING(
                    f'Deleted duplicate upcoming panel {extra.date} for {group.name} (already have one).'
                ))
            if upcoming:
                self.stdout.write(self.style.SUCCESS(
                    f'Found draft panel {upcoming[0].date} for {group.name} ({school.name}).'
                ))
            else:
                future_date = today + datetime.timedelta(days=FUTURE_OFFSET_DAYS)
                Panel.objects.create(
                    panel_group=group, date=future_date, status='draft', chair=group.default_chair,
                )
                self.stdout.write(self.style.SUCCESS(
                    f'Created draft panel {future_date} for {group.name} ({school.name}).'
                ))

            for panel in Panel.objects.filter(panel_group=group):
                self._backfill_chair(panel, group)
                self._seed_members(panel, group)

    def _link_referrals(self, panel, candidates, students_used):
        for idx, student in enumerate(candidates):
            base = CoreReferral.objects.create(
                referral_type=CoreReferral.TYPE_INCLUSION,
                student=student,
                date_referred=timezone.localdate(),
            )
            referral = InclusionReferral.objects.create(referral=base, student=student, status='in_panel')
            students_used.add(student.id)
            minutes = DISCUSSION_MINUTES[idx % len(DISCUSSION_MINUTES)]
            discussed_at = timezone.make_aware(
                datetime.datetime.combine(panel.date, datetime.time(hour=14, minute=0))
            )
            PanelReferral.objects.create(
                panel=panel,
                referral=referral,
                discussion_status='discussed',
                priority=['low', 'medium', 'high'][idx % 3],
                discussion_started_at=discussed_at,
                duration=datetime.timedelta(minutes=minutes),
            )

    def _backfill_chair(self, panel, group):
        if panel.chair_id is None and group.default_chair_id is not None:
            panel.chair_id = group.default_chair_id
            panel.save(update_fields=['chair'])

    def _seed_members(self, panel, group):
        for gm in PanelGroupMember.objects.filter(panel_group=group):
            if gm.staff_id:
                PanelMember.objects.get_or_create(
                    panel=panel, staff_id=gm.staff_id,
                    defaults={'expertise_id': gm.expertise_id, 'attended': True},
                )
            elif gm.external_contact_id:
                PanelMember.objects.get_or_create(
                    panel=panel, external_contact_id=gm.external_contact_id,
                    defaults={'expertise_id': gm.expertise_id, 'attended': True},
                )
