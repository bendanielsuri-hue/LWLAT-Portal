import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from hubs.inclusion.panel.models import Action, ActionCategory, PanelReferral
from hubs.inclusion.panel.views import ACTION_CATEGORY_PRESETS

# Alternated by referral id so demo data isn't uniformly 2 or uniformly 3.
TARGET_COUNTS = [2, 3]


class Command(BaseCommand):
    help = (
        'Tops up Actions on every referral that has actually been discussed at a '
        'panel (both the "Complete" and "Requires Follow-up" stages - see '
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
                # A "Requires Follow-up" referral still has unfinished work - only
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

    def _ensure_categories(self):
        for order, name in enumerate(ACTION_CATEGORY_PRESETS):
            ActionCategory.objects.get_or_create(name=name, defaults={'order': order})
        return list(ActionCategory.objects.filter(name__in=ACTION_CATEGORY_PRESETS).order_by('order'))
