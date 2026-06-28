from django.core.management.base import BaseCommand

from hubs.inclusion.models import ReferralCategory, ReferralQuestion

# Only one category is expected going forward — "Concern" — everything else is
# a flat (category=None) question with no heading on the referral form.
CONCERN_CATEGORY = ('Concern', 0, [
    ('Concern Details', 1),
])

FLAT_QUESTIONS = [
    ('Parent Voice', 0),
    ('Student Voice', 1),
    ('What has been put in place so far?', 2),
]


class Command(BaseCommand):
    help = 'Seeds the default referral category/questions for local development.'

    def handle(self, *args, **options):
        name, order, questions = CONCERN_CATEGORY
        category, _ = ReferralCategory.objects.get_or_create(name=name, defaults={'order': order})
        for label, q_order in questions:
            ReferralQuestion.objects.get_or_create(
                category=category, label=label, defaults={'order': q_order},
            )

        for label, q_order in FLAT_QUESTIONS:
            ReferralQuestion.objects.get_or_create(
                category=None, label=label, defaults={'order': q_order},
            )

        self.stdout.write(self.style.SUCCESS(
            f'Seed complete. Categories: {ReferralCategory.objects.count()}, '
            f'Questions: {ReferralQuestion.objects.count()}.'
        ))
