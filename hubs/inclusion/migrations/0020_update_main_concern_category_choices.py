from django.db import migrations

NEW_CHOICES = (
    'Attendance,Truancy,Behaviour,Access to Learning,Wellbeing,SEND,'
    'Educational Provision,Medical Needs,Peer Issues,Compliance,'
    'Safeguarding,Home Life,School Transport,Agency Support,Careers,Funding,Other'
)


def forwards(apps, schema_editor):
    ReferralQuestion = apps.get_model('inclusion', 'ReferralQuestion')
    ReferralQuestion.objects.filter(label='Main Concern Category').update(
        question_type='select',
        choices=NEW_CHOICES,
    )


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inclusion', '0019_remove_panelreferral_notes_panelreferralnote'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
