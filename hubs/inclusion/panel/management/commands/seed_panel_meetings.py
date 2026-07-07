import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Referral as CoreReferral, School, Student
from hubs.inclusion.panel.management.seed_helpers import backfill_referral_responses
from hubs.inclusion.panel.models import (
    InclusionReferral, Panel, PanelGroup, PanelGroupMember, PanelMember, PanelReferral,
)

# (days offset from today, target referral count). Negative offset = past.
PAST_SPECS_BABINGTON = [(-60, 4), (-30, 3)]
PAST_SPECS_OTHER_SCHOOLS = [(-45, 3), (-15, 2)]
FUTURE_OFFSET_DAYS = 14
DISCUSSION_MINUTES = [12, 18, 25, 9]
# How many of the most recent past panel's discussed referrals get flagged
# as needing a follow-up, so the Panel Setup Referral Selection "Due
# Follow-up"/"All" tabs have something to show per school out of the box.
FOLLOW_UP_COUNT = 2
FOLLOW_UP_DAYS_AFTER_DISCUSSION = 14


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
        self._repair_orphaned_referrals()
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
                self._delete_panel_and_its_referrals(extra)
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
                    self._delete_panel_and_its_referrals(panel)
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
                self._delete_panel_and_its_referrals(extra)
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

            # Tie-broken by pk (not just date) so a school with two past panels
            # sharing the same date (a pre-existing data quirk on some
            # machines) still lands on the same one every rerun, instead of
            # flagging a fresh batch of referrals each time.
            most_recent_past = Panel.objects.filter(
                panel_group=group, status='complete', date__lt=today,
            ).order_by('-date', '-pk').first()
            if most_recent_past:
                flagged = self._seed_followups(most_recent_past)
                if flagged:
                    self.stdout.write(self.style.SUCCESS(
                        f'Flagged {flagged} referral(s) as due for follow-up on {group.name} ({school.name}).'
                    ))

    def _link_referrals(self, panel, candidates, students_used):
        for idx, student in enumerate(candidates):
            base = CoreReferral.objects.create(
                referral_type=CoreReferral.TYPE_INCLUSION,
                student=student,
                date_referred=timezone.localdate(),
            )
            referral = InclusionReferral.objects.create(referral=base, student=student, status='in_panel')
            # Without this, a referral created here (rather than by
            # seed_demo_referrals) has no questionnaire answers at all - a blank
            # card with no Main Concern Category, regardless of command order.
            backfill_referral_responses(referral)
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

    def _delete_panel_and_its_referrals(self, panel):
        # Panel.delete() cascades away the PanelReferral link (panel FK,
        # CASCADE), but the InclusionReferral/base Referral it pointed at
        # would otherwise survive as an orphan: unassigned, stuck at whatever
        # status _link_referrals left it in (never 'open'), with no responses
        # - a blank card in New Referrals with no Main Concern Category. These
        # referrals exist solely for this panel's demo discussion, so delete
        # them (via their base Referral, which cascades everything else) too.
        base_ids = list(
            InclusionReferral.objects.filter(panel_referrals__panel=panel).values_list('referral_id', flat=True)
        )
        panel.delete()
        CoreReferral.objects.filter(pk__in=base_ids).delete()

    def _repair_orphaned_referrals(self):
        # Fixes referrals left orphaned by a past run of this command before
        # _delete_panel_and_its_referrals existed (or by any other path that
        # deletes a Panel directly) - same zombie shape: never resynced to
        # 'open', unassigned, no responses ever recorded for them.
        orphaned = InclusionReferral.objects.exclude(
            pk__in=PanelReferral.objects.filter(removed_at__isnull=True).values_list('referral_id', flat=True)
        ).filter(status='in_panel', responses__isnull=True)
        base_ids = list(orphaned.values_list('referral_id', flat=True))
        if base_ids:
            CoreReferral.objects.filter(pk__in=base_ids).delete()
            self.stdout.write(self.style.WARNING(
                f'Deleted {len(base_ids)} orphaned referral(s) left over from a previously deleted past panel.'
            ))

    def _seed_followups(self, panel):
        # Idempotent via follow_up_status='' - once a row's been flagged
        # (here or by real usage), reruns skip straight past it instead of
        # re-picking a different candidate or pushing the date forward.
        candidates = list(
            PanelReferral.objects.filter(
                panel=panel, removed_at__isnull=True, discussion_status='discussed', follow_up_status='',
            ).order_by('id')[:FOLLOW_UP_COUNT]
        )
        for pr in candidates:
            pr.follow_up_status = 'incomplete'
            pr.follow_up_date = panel.date + datetime.timedelta(days=FOLLOW_UP_DAYS_AFTER_DISCUSSION)
            pr.save(update_fields=['follow_up_status', 'follow_up_date'])
        return len(candidates)

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
