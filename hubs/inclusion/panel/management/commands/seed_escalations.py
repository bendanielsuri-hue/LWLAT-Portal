import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Staff
from hubs.inclusion.panel.models import Escalation, InclusionReferral

# Reuses Escalation.REASON_CHOICES (the same presets escalate_form.html
# offers) rather than its own copy, so seeded reasons read as genuine answers
# a real user could have picked, not invented demo copy. Deterministic
# (referral.id-keyed) selection, not random - cycled per referral so a rerun
# always produces the same text for the same referral, same convention as
# core's seed_safeguarding_notes.py NOTE_TEXTS.
RESOLUTION_TEXTS = [
    'Discussed at MAT Panel - agreed a joint plan with the school, no further MAT involvement needed.',
    'Resolved directly with family; school-level plan resumed.',
    'Referred on to external agency; MAT role in this case is complete.',
]


class Command(BaseCommand):
    help = (
        'Escalates a deterministic subset of seeded Referrals to MAT-level '
        'attention (see hubs/inclusion/panel/CONTEXT.md\'s Escalation entry) so '
        'the Escalations screen has demo rows - run after seed_dummy_data/ '
        'seed_schools/seed_demo_referrals. Idempotent: skips any referral that '
        'already has an Escalation (open or resolved).'
    )

    def handle(self, *args, **options):
        dsl_staff = list(Staff.objects.filter(is_dsl=True).order_by('id'))
        if not dsl_staff:
            self.stdout.write(self.style.WARNING('No is_dsl Staff found - run seed_dummy_data first. Nothing seeded.'))
            return

        referrals = list(
            InclusionReferral.objects.select_related('student', 'student__school').order_by('id')
        )
        created_open = 0
        created_resolved = 0
        for referral in referrals:
            if referral.escalations.exists():
                continue
            # A referral's id decides whether it's escalated at all, and
            # whether that escalation is still open or already resolved -
            # every 10th referral resolved, every 15th (and not already
            # caught by the every-10th rule) still open, giving a mix of
            # both states without escalating most of the demo dataset.
            if referral.id % 10 == 0:
                status = 'resolved'
            elif referral.id % 15 == 0:
                status = 'open'
            else:
                continue

            school_id = referral.student.school_id
            school_dsls = [s for s in dsl_staff if s.school_id == school_id]
            escalated_by = (school_dsls or dsl_staff)[referral.id % len(school_dsls or dsl_staff)]

            escalated_at = timezone.now() - datetime.timedelta(days=referral.id % 20 + 1)
            escalation = Escalation.objects.create(
                referral=referral,
                escalated_by=escalated_by,
                reason=Escalation.REASON_CHOICES[referral.id % len(Escalation.REASON_CHOICES)],
                status=status,
            )
            Escalation.objects.filter(pk=escalation.pk).update(escalated_at=escalated_at)
            if status == 'resolved':
                escalation.resolution_notes = RESOLUTION_TEXTS[referral.id % len(RESOLUTION_TEXTS)]
                escalation.resolved_at = escalated_at + datetime.timedelta(days=referral.id % 5 + 1)
                escalation.save(update_fields=['resolution_notes', 'resolved_at'])
                created_resolved += 1
            else:
                created_open += 1

        self.stdout.write(self.style.SUCCESS(
            f'Escalation rows created: {created_open} open, {created_resolved} resolved.'
        ))
