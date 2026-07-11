import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Staff
from hubs.inclusion.panel.management.seed_helpers import backfill_raised_by
from hubs.inclusion.panel.models import Action, ActionCategory, InclusionReferral, PanelReferral
from hubs.inclusion.panel.views import ACTION_CATEGORY_PRESETS

# Alternated by referral id so demo data isn't uniformly 2 or uniformly 3.
TARGET_COUNTS = [2, 3]

# A couple of deterministic variants per category (picked by referral id, not
# random - see ACTION_CATEGORY_PRESETS) so every seeded Action has a real
# free-text description instead of a blank one, without every action sharing
# the exact same sentence.
ACTION_DESCRIPTIONS = {
    'Parent Meeting': [
        'Arrange a meeting with parents/carers to discuss the concerns raised and agree next steps.',
        'Call home to update parents/carers on progress and confirm they are happy with the plan in place.',
    ],
    'Intervention': [
        'Set up a targeted intervention programme and check in weekly to monitor progress.',
        'Refer to the relevant support team and begin the agreed intervention within two weeks.',
    ],
    'Other': [
        'Review outstanding actions from the panel discussion and record the outcome.',
        'Liaise with the student\'s form tutor and share the agreed plan for classroom support.',
    ],
}


class Command(BaseCommand):
    help = (
        'Tops up Actions on every referral that has actually been discussed at a '
        'panel (both the "Complete" and "Needs Review" stages - see '
        '_panel_referral_stage in views.py) so each has 2 or 3 demo actions to '
        'show in Actions/Referral Details. Run after seed_panel_meetings. '
        'Idempotent: only tops up referrals with fewer than 2 actions, never '
        'removes or recounts existing ones.'
    )

    def handle(self, *args, **options):
        categories = self._ensure_categories()

        discussed = (
            PanelReferral.objects.filter(removed_at__isnull=True, discussion_status='discussed')
            .select_related('referral', 'panel')
            .order_by('referral_id', '-panel__date')
        )
        # A referral can be discussed at more than one panel (e.g. pulled back
        # in after a follow-up) - only its latest discussion is relevant here,
        # so keep the first row seen per referral (latest panel date first,
        # thanks to the ordering above).
        seen_referrals = set()
        created_total = 0
        topped_up = 0
        for pr in discussed:
            if pr.referral_id in seen_referrals:
                continue
            seen_referrals.add(pr.referral_id)

            existing = list(pr.referral.actions.all())
            if len(existing) >= 2:
                continue

            target = TARGET_COUNTS[pr.referral_id % len(TARGET_COUNTS)]
            is_followup = pr.follow_up_status == 'incomplete'
            for slot in range(len(existing), target):
                category = categories[(pr.referral_id + slot) % len(categories)]
                due_date = pr.panel.date + datetime.timedelta(days=7 * (slot + 1))
                # A "Needs Review" referral still has unfinished work - only
                # its first action is done, the rest stay open. A fully
                # "Complete" referral has every action wrapped up already.
                complete = (not is_followup) or slot == 0
                Action.objects.create(
                    referral=pr.referral,
                    category=category,
                    assigned_to=pr.panel.chair,
                    due_date=due_date,
                    status='complete' if complete else 'incomplete',
                    completed_at=timezone.now() if complete else None,
                    note=self._description_for(category, pr.referral_id + slot),
                    origin_panel_referral=pr,
                )
                created_total += 1
            topped_up += 1

        if created_total:
            self.stdout.write(self.style.SUCCESS(
                f'Created {created_total} action(s) across {topped_up} referral(s).'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                'Every discussed referral already has 2+ actions - nothing to do.'
            ))

        # Actions created before ACTION_DESCRIPTIONS existed (or added by hand
        # with no note) sit with a blank Description - backfill those too,
        # deterministically by category, same as new ones above. Never
        # touches an action that already has a note.
        backfilled = 0
        for action in Action.objects.filter(note='').select_related('category'):
            if not action.category:
                continue
            action.note = self._description_for(action.category, action.id)
            action.save(update_fields=['note'])
            backfilled += 1
        if backfilled:
            self.stdout.write(self.style.SUCCESS(
                f'Backfilled a description on {backfilled} action(s) that had none.'
            ))

        # Actions created by an earlier version of the top-up loop above (before
        # it passed origin_panel_referral=pr) have no discussion to attribute
        # them to, so a referral's "Panel Meetings" section shows actions that
        # don't add up to any discussion's own actions-added count. Backfill
        # onto the referral's latest discussed PanelReferral - the same one
        # the top-up loop itself would have used, since it always operates on
        # the latest discussion per referral (see the ordering/dedup above).
        # Never touches an action that already has an origin (e.g. one raised
        # from the standalone Actions page, which has no discussion to own it).
        origin_fixed = 0
        for action in Action.objects.filter(origin_panel_referral__isnull=True).select_related('referral'):
            latest_pr = PanelReferral.objects.filter(
                referral_id=action.referral_id, removed_at__isnull=True, discussion_status='discussed',
            ).order_by('-panel__date').first()
            if latest_pr:
                action.origin_panel_referral = latest_pr
                action.save(update_fields=['origin_panel_referral'])
                origin_fixed += 1
        if origin_fixed:
            self.stdout.write(self.style.SUCCESS(
                f'Attributed {origin_fixed} action(s) to the discussion that raised them.'
            ))

        # An action can end up unassigned if it was created (here or via the
        # New Action form) while its discussion's panel had no chair yet -
        # e.g. a stray/unassigned-group panel later repaired by
        # seed_panel_meetings. The top-up loop above never revisits existing
        # actions, so backfill separately: try the action's own discussion's
        # chair, then the referral's most recent discussed panel's chair,
        # then whoever raised the referral, then a deterministic staff pick
        # at the student's school - same "always something plausible, never
        # random" approach as _placeholder_answer in seed_helpers.py.
        assigned_fixed = 0
        for action in Action.objects.filter(assigned_to__isnull=True).select_related(
            'referral__student', 'referral__raised_by', 'origin_panel_referral__panel__chair',
        ):
            staff = None
            if action.origin_panel_referral_id and action.origin_panel_referral.panel.chair_id:
                staff = action.origin_panel_referral.panel.chair
            if staff is None:
                latest_pr = PanelReferral.objects.filter(
                    referral_id=action.referral_id, removed_at__isnull=True, discussion_status='discussed',
                ).select_related('panel__chair').order_by('-panel__date').first()
                if latest_pr and latest_pr.panel.chair_id:
                    staff = latest_pr.panel.chair
            if staff is None:
                staff = action.referral.raised_by
            if staff is None:
                school_id = action.referral.student.school_id
                staff_qs = Staff.objects.filter(is_active=True, school_id=school_id) if school_id else Staff.objects.none()
                candidates = list(staff_qs.order_by('id')) or list(Staff.objects.filter(is_active=True).order_by('id'))
                if candidates:
                    staff = candidates[action.id % len(candidates)]
            if staff:
                action.assigned_to = staff
                action.save(update_fields=['assigned_to'])
                assigned_fixed += 1
        if assigned_fixed:
            self.stdout.write(self.style.SUCCESS(
                f'Assigned staff to {assigned_fixed} action(s) that had none.'
            ))

        # Documented as the last command in the panel seed sequence (see
        # hubs/inclusion/panel/CLAUDE.md) - a final safety-net pass so
        # "Referred By" is backfilled regardless of which earlier command
        # actually created a given referral, or what order they ran in.
        raised_by_fixed = sum(
            1 for referral in InclusionReferral.objects.select_related('referral', 'student')
            if backfill_raised_by(referral)
        )
        if raised_by_fixed:
            self.stdout.write(self.style.SUCCESS(
                f'Backfilled "Referred By" on {raised_by_fixed} referral(s) that had none.'
            ))

    def _ensure_categories(self):
        for order, name in enumerate(ACTION_CATEGORY_PRESETS):
            ActionCategory.objects.get_or_create(name=name, defaults={'order': order})
        return list(ActionCategory.objects.filter(name__in=ACTION_CATEGORY_PRESETS).order_by('order'))

    def _description_for(self, category, seed):
        variants = ACTION_DESCRIPTIONS.get(category.name, [''])
        return variants[seed % len(variants)]
