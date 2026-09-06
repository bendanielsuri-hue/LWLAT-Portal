import datetime
from collections import Counter

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Referral as CoreReferral, School, Staff, Student
from core.term_dates import terms_for_school
from hubs.inclusion.panel.management.seed_helpers import backfill_raised_by, backfill_referral_responses
from hubs.inclusion.panel.models import (
    InclusionReferral, Panel, PanelGroup, PanelGroupMember, PanelMember, PanelReferral,
)
from hubs.inclusion.panel.views import _sync_referral_status

# (days offset from today, target referral count). Negative offset = past.
PAST_SPECS_BABINGTON = [(-60, 4), (-30, 3)]
PAST_SPECS_OTHER_SCHOOLS = [(-45, 3), (-15, 2)]
# Two upcoming (draft) panels per school now, not one - #121 follow-up, live
# feedback: "add some upcoming for this academic year" - a week out and
# about six weeks out, both nudged into an actual term (_nudge_into_term,
# below) rather than landing on a bare day-offset that can drift into a
# holiday gap depending on what day this command happens to run.
FUTURE_OFFSETS_DAYS = [7, 45]
# How far a school's upcoming draft panel is allowed to drift from its own
# target offset before it gets rescheduled back onto target - reruns on a
# different day would otherwise just keep whatever date the panel already
# has, however far "a week's time" has drifted from it.
FUTURE_OFFSET_TOLERANCE_DAYS = 3
DISCUSSION_MINUTES = [12, 18, 25, 9]
# How many of the most recent past panel's discussed referrals get flagged
# as needing a review, so the Panel Agenda Setup Referral Selection "Reviews
# Due"/"All" tabs have something to show per school out of the box.
FOLLOW_UP_COUNT = 2
FOLLOW_UP_DAYS_AFTER_DISCUSSION = 14


def _unique_nudge(date, school, used_dates):
    # #121 follow-up: "make it feel like real data" - two of Babington's
    # past specs (60 and 30 days back) both happened to fall in the same
    # holiday gap and both nudged onto the exact same term-start date,
    # landing two "different" meetings on the same day for the same panel
    # group - correct per-date (both genuinely in-term) but reads as an
    # obvious seed artifact, not two real meetings. used_dates is a
    # Counter, not a plain set - shared across this whole school/group's
    # date assignments (kept-panel nudges, new past panels, and upcoming
    # panels all feed the same one) so any collision, not just this
    # specific one, gets bumped a day at a time until it lands somewhere
    # free. A Counter (occupancy count per date), not a set of dates, is
    # what actually catches TWO already-EXISTING panels sharing one date
    # before this pass even runs - a plain set can only ever record "this
    # date is used" once, so discarding+re-adding the same value for a
    # second panel that already shared it silently loses the fact that
    # anyone else was ever there (confirmed live: this really did leave the
    # Babington duplicate untouched with a set-based first attempt at this).
    # A day or two of drift practically never walks a date back out of the
    # term it was just nudged into (terms span months), so no
    # re-validation against the term boundary is needed here.
    date = _nudge_into_term(date, school)
    while used_dates[date] > 0:
        date += datetime.timedelta(days=1)
    used_dates[date] += 1
    return date


def _nudge_into_term(date, school):
    # #121: seeded panel dates used to be a bare day-offset from today,
    # which can land in the gap between one term's end_date and the next
    # term's start_date (holidays aren't their own Term row - see
    # core.models.Term) purely depending on what day this command happens
    # to run - live feedback: "update dates so that all seeded are a date
    # within a term". terms_for_school already applies the MAT-wide
    # fallback (core.term_dates) a school with no Term rows of its own
    # needs. No terms seeded at all (fresh DB, seed_term_dates not run
    # yet) -> leave the date untouched rather than erroring.
    terms = list(terms_for_school(school).order_by('start_date'))
    if not terms:
        return date
    for term in terms:
        if term.start_date <= date <= term.end_date:
            return date
    after = [t for t in terms if t.start_date > date]
    if after:
        return after[0].start_date + datetime.timedelta(days=3)
    before = [t for t in terms if t.end_date < date]
    if before:
        return before[-1].end_date - datetime.timedelta(days=3)
    return date


def _canonical_group(school):
    return (
        PanelGroup.objects.filter(school=school, is_active=True, name=f'{school.name} Panel').first()
        or PanelGroup.objects.filter(school=school, is_active=True, default_chair__isnull=False).first()
        or PanelGroup.objects.filter(school=school, is_active=True).order_by('id').first()
    )


def _complete_panel_times(panel_date):
    # A real 'complete' panel always has started_at/ended_at set - you can't
    # reach Complete without going through Start Meeting first (see
    # end_panel_meeting/inclusion_panel_meeting_attendance in views.py).
    # Panels created directly at status='complete' here (skipping that real
    # flow, for speed) never got these set at all - live feedback: "I have
    # completed meetings that say number of members and not X of Y attended"
    # - checked_in_count (views.py) is None whenever started_at is falsy,
    # which any of these seeded-complete panels always were. 13:30-15:00
    # brackets _link_referrals' own fixed 14:00 discussion timestamp for
    # every referral on the panel (own comment there) - not a real
    # scheduling model, just wide enough that "started before, ended after"
    # stays true for that fixed time.
    started_at = timezone.make_aware(datetime.datetime.combine(panel_date, datetime.time(hour=13, minute=30)))
    ended_at = timezone.make_aware(datetime.datetime.combine(panel_date, datetime.time(hour=15, minute=0)))
    return started_at, ended_at


def _discussed_count(panel):
    return PanelReferral.objects.filter(
        panel=panel, removed_at__isnull=True, discussion_status='discussed',
    ).count()


class Command(BaseCommand):
    help = (
        'Repairs broken/duplicate past Panels (missing referrals, chair, or members) '
        'and tops up to one or two past (complete, with discussed demo referrals) plus '
        'two draft/upcoming Panel meetings per active School\'s panel group, all nudged '
        'onto a date within an actual term. Run after seed_panel_groups (and after '
        'seed_term_dates, if that\'s been added, for the term-nudging to have anything '
        'to nudge against). Idempotent regardless of what day it runs on.'
    )

    def handle(self, *args, **options):
        today = timezone.localdate()
        self._repair_orphaned_referrals()
        self._delete_unassigned_panels()
        self._delete_stale_noncomplete_panels(today)
        students_used = set(InclusionReferral.objects.values_list('student_id', flat=True))

        for school in School.objects.filter(is_active=True):
            group = _canonical_group(school)
            if group is None:
                self.stdout.write(self.style.WARNING(f'No active PanelGroup for {school.name} — skipping.'))
                continue

            past_specs = PAST_SPECS_BABINGTON if school.name == 'Babington Academy' else PAST_SPECS_OTHER_SCHOOLS
            # #121: shared across every date this group gets assigned/nudged
            # below (kept-panel repairs, new past panels, upcoming panels) so
            # _unique_nudge can catch a collision between any two of them,
            # not just within one of those sections.
            used_dates = Counter(Panel.objects.filter(panel_group=group).values_list('date', flat=True))

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
                used_dates[extra.date] -= 1
                self.stdout.write(self.style.WARNING(
                    f'Deleted excess past panel {extra.date} for {group.name} (beyond target of {len(past_specs)}).'
                ))

            good_panels = []
            for panel in kept_panels:
                # #121: a panel kept as-is (not recreated) never had its date
                # re-checked against the term calendar - only brand new
                # shortfall panels (below) got _nudge_into_term. seed_term_
                # dates/seed_panel_meetings can each be reran independently
                # at different times, so a panel seeded before term dates
                # existed (or before this nudge existed) can still be
                # sitting on a holiday-gap date - live feedback: "update
                # dates so that all seeded are a date within a term".
                # Discarded from used_dates first - otherwise this panel's
                # OWN current date always looks like a "collision" against
                # itself and gets needlessly bumped even when it needs no
                # change at all.
                used_dates[panel.date] -= 1
                nudged = _unique_nudge(panel.date, school, used_dates)
                if nudged != panel.date:
                    panel.date = nudged
                    panel.save(update_fields=['date'])
                    self.stdout.write(self.style.SUCCESS(
                        f'Nudged past panel onto {nudged} for {group.name} (was outside any term).'
                    ))

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
                    used_dates[panel.date] -= 1
                    self.stdout.write(self.style.WARNING(
                        f'Deleted empty past panel {panel.date} for {group.name} (no students available to repair it).'
                    ))

            shortfall = len(past_specs) - len(good_panels)
            if shortfall > 0:
                for offset, referral_target in past_specs[-shortfall:]:
                    panel_date = _unique_nudge(today + datetime.timedelta(days=offset), school, used_dates)
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
                    started_at, ended_at = _complete_panel_times(panel_date)
                    panel = Panel.objects.create(
                        panel_group=group, date=panel_date, status='complete', chair=group.default_chair,
                        started_at=started_at, ended_at=ended_at,
                    )
                    self._link_referrals(panel, candidates, students_used)
                    self.stdout.write(self.style.SUCCESS(
                        f'Created past panel {panel_date} for {group.name} ({school.name}) '
                        f'with {len(candidates)} discussed referral(s).'
                    ))

            # Every school needs a couple of upcoming panels (FUTURE_OFFSETS_DAYS,
            # #121: "add some upcoming for this academic year" - was just one).
            # Keep whichever ones already exist (rather than always creating
            # fresh ones keyed to today's offsets) unless a draft has drifted
            # too far from its own target - e.g. left over from a run days/
            # weeks ago. Matched positionally (soonest existing upcoming
            # panel <-> soonest target offset) since both lists are already
            # date-ordered.
            upcoming = list(
                Panel.objects.filter(panel_group=group, date__gte=today)
                .exclude(status='complete').order_by('date')
            )
            for extra in upcoming[len(FUTURE_OFFSETS_DAYS):]:
                self._delete_panel_and_its_referrals(extra)
                used_dates[extra.date] -= 1
                self.stdout.write(self.style.WARNING(
                    f'Deleted duplicate upcoming panel {extra.date} for {group.name} (already have enough).'
                ))
            for i, offset in enumerate(FUTURE_OFFSETS_DAYS):
                if i < len(upcoming):
                    kept = upcoming[i]
                    # Only draft panels are safely reschedulable - one already
                    # marked Ready, or actually Running/Delayed, is being acted
                    # on for real and shouldn't have its date yanked out from
                    # under it. Discarded from used_dates first for the same
                    # "don't collide with itself" reason as the kept-past-
                    # panel nudge, above.
                    used_dates[kept.date] -= 1
                    target_date = _unique_nudge(today + datetime.timedelta(days=offset), school, used_dates)
                    if kept.status == 'draft' and abs((kept.date - target_date).days) > FUTURE_OFFSET_TOLERANCE_DAYS:
                        kept.date = target_date
                        kept.save(update_fields=['date'])
                        self.stdout.write(self.style.SUCCESS(
                            f'Rescheduled draft panel to {target_date} for {group.name} ({school.name}) '
                            f'(was too far from target).'
                        ))
                    else:
                        # Not actually rescheduling - target_date was only a
                        # speculative probe, and kept.date (discarded above)
                        # is the real date still in use. Swap the bookkeeping
                        # back so used_dates reflects what's actually on the
                        # panel, not the road not taken.
                        used_dates[target_date] -= 1
                        used_dates[kept.date] += 1
                        self.stdout.write(self.style.SUCCESS(
                            f'Found upcoming panel {kept.date} for {group.name} ({school.name}).'
                        ))
                else:
                    Panel.objects.create(
                        panel_group=group, date=target_date, status='draft', chair=group.default_chair,
                    )
                    self.stdout.write(self.style.SUCCESS(
                        f'Created draft panel {target_date} for {group.name} ({school.name}).'
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

    def _delete_stale_noncomplete_panels(self, today):
        # #121: a draft panel that drifts too far from target gets
        # rescheduled (the "every school needs upcoming panels" section,
        # below), but a Ready/Running/Delayed panel is deliberately left
        # alone there - it's being acted on for real, not safely
        # reschedulable. Left unattended across enough reruns (this command
        # is meant to be run again as "today" moves on), one of those can
        # still end up stuck in the past with a status that was never
        # "complete" - a stale demo meeting that never happened, showing an
        # accordingly-blank Term. Since every Panel here is dummy/seed data
        # (no real deployment, CLAUDE.md), the fix is dropping and
        # reseeding rather than trying to preserve a state nobody's
        # actually mid-testing.
        stale = list(Panel.objects.filter(status__in=['draft', 'ready', 'running', 'delayed'], date__lt=today))
        for panel in stale:
            self._delete_panel_and_its_referrals(panel)
        if stale:
            self.stdout.write(self.style.WARNING(
                f'Deleted {len(stale)} stale non-complete panel(s) whose date had already passed.'
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
            # #121 follow-up: single catch-all backfill for every 'complete'
            # panel missing started_at/ended_at (kept-past panels from
            # before _complete_panel_times existed, the follow-up-source
            # panel, any other stray one) - live feedback: "I still have
            # completed meetings with no attended" - checked_in_count
            # (views.py) gates on started_at being truthy, so a panel with
            # real PanelMember check-in rows (_seed_members, below) still
            # shows nothing without this. 'running'/'delayed' panels are
            # never missing it - those statuses are only ever reached by
            # actually starting a meeting through the real flow.
            if panel.status == 'complete' and panel.started_at is None:
                started_at, ended_at = _complete_panel_times(panel.date)
                panel.started_at = started_at
                panel.ended_at = ended_at
                panel.save(update_fields=['started_at', 'ended_at'])
                self.stdout.write(self.style.SUCCESS(
                    f'Backfilled started_at/ended_at for panel {panel.date} (id={panel.id}).'
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
        started_at, ended_at = _complete_panel_times(panel_date)
        panel = Panel.objects.create(
            panel_group=group, date=panel_date, status='complete', chair=group.default_chair,
            started_at=started_at, ended_at=ended_at,
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
