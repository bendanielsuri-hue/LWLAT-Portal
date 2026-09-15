from django.core.management.base import BaseCommand

from hubs.inclusion.panel.models import PresetReason

# The sentences an admin would otherwise have to type before either form is
# usable at all. Kept deliberately short per context: these are demo presets,
# and the point of PresetReason is that the real list is edited on Panel
# Settings rather than here. The escalation four are the same wording that
# used to be hardcoded as Escalation.REASON_CHOICES, so existing demo
# escalations (seed_escalations reads this table) keep reading the same.
PRESET_REASONS = {
    PresetReason.CONTEXT_ESCALATION: [
        'Concerns have escalated beyond what the school-level panel can resolve alone.',
        'Family has requested MAT-level involvement after repeated attempts at school level.',
        'Safeguarding threshold may be met - needs MAT-level oversight as a precaution.',
        'Multiple agencies now involved; needs coordinating at MAT level.',
    ],
    PresetReason.CONTEXT_MEMBER_DEACTIVATION: [
        'No longer working at this school.',
        'Role has changed - panel work sits with someone else now.',
        'Stepping back from panel duties for the time being.',
        'Added to this group in error.',
    ],
}


class Command(BaseCommand):
    help = (
        'Seeds the PresetReason rows offered by the Escalate to MAT form and the '
        'Panel Group deactivate-member step. No dependency on the other seed '
        'commands, but run it before seed_escalations, which picks its demo '
        'reasons out of this table. Idempotent on (context, text); never '
        'reactivates a preset an admin has deactivated.'
    )

    def handle(self, *args, **options):
        for context, texts in PRESET_REASONS.items():
            for order, text in enumerate(texts, start=1):
                PresetReason.objects.get_or_create(
                    context=context, text=text, defaults={'order': order},
                )
            self.stdout.write(self.style.SUCCESS(
                f'{context}: {PresetReason.objects.for_context(context).count()} active preset(s).'
            ))
