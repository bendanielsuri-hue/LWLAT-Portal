from django.core.management.base import BaseCommand

from hubs.inclusion.panel.models import ReferralCategory, ReferralQuestion

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

MAIN_CONCERN_CHOICES = (
    'Attendance,Truancy,Behaviour,Access to Learning,Wellbeing,SEND,'
    'Educational Provision,Medical Needs,Peer Issues,Compliance,'
    'Safeguarding,Home Life,School Transport,Agency Support,Careers,Funding,Other'
)


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

        # In the Concern category (order 0), above Concern Details (order 1) -
        # the referring member picks the headline category before writing the
        # free-text detail, both on the referral form and in Referral Details.
        mcq, _ = ReferralQuestion.objects.get_or_create(
            label='Main Concern Category',
            defaults={'category': category, 'order': 0, 'question_type': 'select', 'choices': MAIN_CONCERN_CHOICES},
        )
        if (mcq.category_id != category.id or mcq.order != 0
                or mcq.choices != MAIN_CONCERN_CHOICES or mcq.question_type != 'select'):
            mcq.category = category
            mcq.order = 0
            mcq.question_type = 'select'
            mcq.choices = MAIN_CONCERN_CHOICES
            mcq.save()

        self.stdout.write(self.style.SUCCESS(
            f'Seed complete. Categories: {ReferralCategory.objects.count()}, '
            f'Questions: {ReferralQuestion.objects.count()}.'
        ))
