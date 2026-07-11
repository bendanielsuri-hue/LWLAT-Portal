import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Referral as CoreReferral, School, Staff, Student
from hubs.inclusion.panel.management.seed_helpers import backfill_raised_by, backfill_referral_responses
from hubs.inclusion.panel.models import (
    InclusionReferral, Panel, PanelGroup, PanelGroupMember, PanelMember, PanelReferral,
)
from hubs.inclusion.panel.views import _sync_referral_status

# (days offset from today, target referral count). Negative offset = past.
PAST_SPECS_BABINGTON = [(-60, 4), (-30, 3)]
PAST_SPECS_OTHER_SCHOOLS = [(-45, 3), (-15, 2)]
FUTURE_OFFSET_DAYS = 7
# How far a school's upcoming draft panel is allowed to drift from
# today + FUTURE_OFFSET_DAYS before it gets rescheduled back onto target -
# reruns on a different day would otherwise just keep whatever date the
# panel already has, however far "a week's time" has drifted from it.
FUTURE_OFFSET_TOLERANCE_DAYS = 3
DISCUSSION_MINUTES = [12, 18, 25, 9]
# How many of the most recent past panel's discussed referrals get flagged
# as needing a review, so the Panel Agenda Setup Referral Selection "Reviews
# Due"/"All" tabs have something to show per school out of the box.
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
        self._delete_unassigned_panels()
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

            # Every school needs one upcoming panel due in about a week's time.
            # Keep whichever one already exists (rather than always creating a
            # fresh one keyed to today's offset) unless it's drifted too far
            # from that target - e.g. left over from a run days/weeks ago.
            upcoming = list(
                Panel.objects.filter(panel_group=group, date__gte=today)
                .exclude(status='complete').order_by('date')
            )
            for extra in upcoming[1:]:
                self._delete_panel_and_its_referrals(extra)
                self.stdout.write(self.style.WARNING(
                    f'Deleted duplicate upcoming panel {extra.date} for {group.name} (already have one).'
                ))
            target_date = today + datetime.timedelta(days=FUTURE_OFFSET_DAYS)
            if upcoming:
                kept = upcoming[0]
                # Only draft panels are safely reschedulable - one already
                # marked Ready, or actually Running/Delayed, is being acted on
                # for real and shouldn't have its date yanked out from under it.
                if kept.status == 'draft' and abs((kept.date - target_date).days) > FUTURE_OFFSET_TOLERANCE_DAYS:
                    kept.date = target_date
                    kept.save(update_fields=['date'])
                    self.stdout.write(self.style.SUCCESS(
                        f'Rescheduled draft panel to {target_date} for {group.name} ({school.name}) '
                        f'(was too far from a week away).'
                    ))
                else:
                    self.stdout.write(self.style.SUCCESS(
                        f'Found draft panel {kept.date} for {group.name} ({school.name}).'
                    ))
            else:
                future_date = target_date
                Panel.objects.create(
                    panel_group=group, date=future_date, status='draft', chair=group.default_chair,
                )
                self.stdout.write(self.style.SUCCESS(
                    f'Created draft panel {future_date} for {group.name} ({school.name}).'
                ))

            for panel in Panel.objects.filter(panel_group=group):
                self._backfill_chair(panel, group)
                self._seed_members(panel, group)

        # Final catch-all pass: any Complete/Live/Delayed panel attached to a
        # legacy/duplicate PanelGroup the per-school loop above doesn't own
        # (can happen from manual testing outside these seed commands) still
        # needs a chair and at least one referral, same as the per-school
        # panels above. Reruns are cheap no-ops for panels already fixed.
        self._repair_stray_panels(students_used)

        # Reviews are seeded per PanelGroup, not just per school's canonical
        # group - a school with two groups (or a group with no school at all,
        # e.g. a MAT-wide one) still gets its own couple of due-review
        # referrals, same as the canonical per-school groups above.
        for group in PanelGroup.objects.filter(is_active=True):
            self._ensure_followup_source(group, students_used)
            self._ensure_followup_minimum(group)

    def _delete_unassigned_panels(self):
        # A Panel with no PanelGroup renders as "Unassigned Group" (see
        # meetings.html) - not a real meeting anyone can run (no group means
        # no members/chair to inherit), so these are cleared out rather than
        # repaired. Every real Panel is expected to belong to a group.
        unassigned = list(Panel.objects.filter(panel_group__isnull=True))
        for panel in unassigned:
            self._delete_panel_and_its_referrals(panel)
        if unassigned:
            self.stdout.write(self.style.WARNING(
                f'Deleted {len(unassigned)} unassigned-group panel(s).'
            ))

    def _repair_stray_panels(self, students_used):
        fallback_chair = Staff.objects.filter(is_active=True).order_by('id').first()
        for panel in Panel.objects.filter(status__in=['complete', 'running', 'delayed'], panel_group__isnull=False):
            group = panel.panel_group
            if panel.chair_id is None:
                chair = group.default_chair if group.default_chair_id else fallback_chair
                if chair:
                    panel.chair = chair
                    panel.save(update_fields=['chair'])
                    self.stdout.write(self.style.SUCCESS(
                        f'Set chair for panel {panel.date} (id={panel.id}) to {chair}.'
                    ))
            self._seed_members(panel, group)
            school = group.school if group.school_id else None
            added = self._ensure_panel_has_referrals(panel, school, students_used)
            if added:
                self.stdout.write(self.style.SUCCESS(
                    f'Added {added} referral(s) to empty {panel.get_status_display()} panel '
                    f'{panel.date} (id={panel.id}).'
                ))

    def _ensure_panel_has_referrals(self, panel, school, students_used, count=1):
        if PanelReferral.objects.filter(panel=panel, removed_at__isnull=True).exists():
            return 0
        student_qs = Student.objects.filter(is_active=True).exclude(pk__in=students_used)
        candidates = list((student_qs.filter(school=school) if school else student_qs).order_by('id')[:count])
        if not candidates:
            return 0
        self._link_referrals(panel, candidates, students_used, discussed=panel.status != 'delayed')
        return len(candidates)

    def _ensure_followup_source(self, group, students_used):
        # _ensure_followup_minimum can only flag referrals that were actually
        # discussed at one of this group's panels - a group with no complete
        # panel of its own (e.g. a second group for a school, or a group with
        # no school at all) has nothing to flag. Tops up to FOLLOW_UP_COUNT
        # discussed referrals across the group's existing complete panels
        # first; only creates a new small past panel if that's still short.
        available = PanelReferral.objects.filter(
            panel__panel_group=group, removed_at__isnull=True, discussion_status='discussed',
        ).count()
        if available >= FOLLOW_UP_COUNT:
            return
        needed = FOLLOW_UP_COUNT - available
        student_qs = Student.objects.filter(is_active=True).exclude(pk__in=students_used)
        candidates = list((student_qs.filter(school=group.school) if group.school_id else student_qs).order_by('id')[:needed])
        if not candidates:
            return
        # Dated far enough in the past that panel_date + FOLLOW_UP_DAYS_AFTER_DISCUSSION
        # (applied below in _ensure_followup_minimum) still lands on or before
        # today - otherwise the referral gets flagged but isn't actually due
        # yet, and _due_followups (follow_up_date__lte=today) never surfaces it.
        panel_date = timezone.localdate() - datetime.timedelta(days=FOLLOW_UP_DAYS_AFTER_DISCUSSION + 7)
        panel = Panel.objects.create(
            panel_group=group, date=panel_date, status='complete', chair=group.default_chair,
        )
        self._link_referrals(panel, candidates, students_used)
        self._seed_members(panel, group)
        self.stdout.write(self.style.SUCCESS(
            f'Created follow-up source panel {panel_date} for {group.name} with {len(candidates)} discussed referral(s).'
        ))

    def _ensure_followup_minimum(self, group):
        # Guarantees a couple of *overdue* follow-up referrals per
        # PanelGroup, not just flagged ones - _due_followups (and the
        # dashboard's followups_due_count) only surface a follow-up once its
        # date is on or before today, so a flagged-but-future-dated row
        # doesn't actually satisfy this. Repairs any already-flagged row left
        # over from before this date guarantee existed.
        today = timezone.localdate()
        stale = list(
            PanelReferral.objects.filter(
                panel__panel_group=group, removed_at__isnull=True,
                follow_up_status='incomplete', follow_up_date__gt=today,
            ).select_related('panel')
        )
        for pr in stale:
            # Can't just recompute from panel.date + FOLLOW_UP_DAYS_AFTER_DISCUSSION -
            # for an old source panel created before this date guarantee
            # existed, that would still land in the future. Backdating
            # directly to "yesterday" is what actually guarantees overdue.
            pr.follow_up_date = today - datetime.timedelta(days=1)
            pr.save(update_fields=['follow_up_date'])
        if stale:
            self.stdout.write(self.style.SUCCESS(
                f'Backdated {len(stale)} follow-up referral(s) on {group.name} so they read as overdue.'
            ))

        # Counts what's already flagged across the whole group first (not
        # just the most recent panel) so reruns stop once FOLLOW_UP_COUNT is
        # reached, instead of flagging a fresh batch every time this runs.
        flagged_count = PanelReferral.objects.filter(
            panel__panel_group=group, removed_at__isnull=True, follow_up_status='incomplete',
        ).count()
        if flagged_count >= FOLLOW_UP_COUNT:
            return
        candidates = list(
            PanelReferral.objects.filter(
                panel__panel_group=group, removed_at__isnull=True,
                discussion_status='discussed', follow_up_status='',
            ).select_related('panel').order_by('-panel__date', 'id')[:FOLLOW_UP_COUNT - flagged_count]
        )
        for pr in candidates:
            pr.follow_up_status = 'incomplete'
            pr.follow_up_date = pr.panel.date + datetime.timedelta(days=FOLLOW_UP_DAYS_AFTER_DISCUSSION)
            pr.save(update_fields=['follow_up_status', 'follow_up_date'])
        if candidates:
            self.stdout.write(self.style.SUCCESS(
                f'Flagged {len(candidates)} more referral(s) as due for follow-up on {group.name} '
                f'to reach the minimum of {FOLLOW_UP_COUNT}.'
            ))

    def _link_referrals(self, panel, candidates, students_used, discussed=True):
        for idx, student in enumerate(candidates):
            referral = InclusionReferral.create_for(student, raised_by=None)
            referral.priority = ['low', 'medium', 'high'][idx % 3]
            referral.save(update_fields=['priority'])
            # Without this, a referral created here (rather than by
            # seed_demo_referrals) has no questionnaire answers at all - a blank
            # card with no Main Concern Category, regardless of command order.
            backfill_referral_responses(referral)
            # Same idea for "Referred By" - shared helper (seed_helpers.py) so a
            # referral created here reads the same as one from
            # seed_demo_referrals, regardless of command run order.
            backfill_raised_by(referral)
            students_used.add(student.id)
            # A 'delayed' panel never actually met, so its referrals stay
            # pending rather than claiming a discussion that didn't happen.
            if discussed:
                minutes = DISCUSSION_MINUTES[idx % len(DISCUSSION_MINUTES)]
                discussed_at = timezone.make_aware(
                    datetime.datetime.combine(panel.date, datetime.time(hour=14, minute=0))
                )
                PanelReferral.objects.create(
                    panel=panel,
                    referral=referral,
                    discussion_status='discussed',
                    discussion_started_at=discussed_at,
                    duration=datetime.timedelta(minutes=minutes),
                )
            else:
                PanelReferral.objects.create(panel=panel, referral=referral)
            # Reflects the PanelReferral just created (review_scheduled if
            # still pending, awaiting_review/closed if discussed) instead of
            # a hardcoded guess - see _sync_referral_status in views.py.
            _sync_referral_status(referral)

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
        ).exclude(status='open').filter(responses__isnull=True)
        base_ids = list(orphaned.values_list('referral_id', flat=True))
        if base_ids:
            CoreReferral.objects.filter(pk__in=base_ids).delete()
            self.stdout.write(self.style.WARNING(
                f'Deleted {len(base_ids)} orphaned referral(s) left over from a previously deleted past panel.'
            ))

    def _backfill_chair(self, panel, group):
        if panel.chair_id is None and group.default_chair_id is not None:
            panel.chair_id = group.default_chair_id
            panel.save(update_fields=['chair'])

    def _seed_members(self, panel, group):
        # PanelMember is attendance-only now (see hubs/inclusion/panel/models.py)
        # - "who's on this panel" for a draft/ready panel is just the live
        # PanelGroupMember roster, nothing to seed. Only started panels get
        # attendance rows, so seeded Complete/Running demo meetings still show
        # a realistic "N Panel Members in attendance" instead of zero.
        if panel.status not in ('running', 'delayed', 'complete'):
            return
        for gm in PanelGroupMember.objects.filter(panel_group=group, is_active=True):
            PanelMember.objects.get_or_create(
                panel=panel, panel_group_member=gm,
                defaults={'checked_in_at': timezone.now()},
            )
