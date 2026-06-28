from django.db import migrations


def forwards(apps, schema_editor):
    ReferralResponse = apps.get_model('inclusion', 'ReferralResponse')
    ReferralResponse.objects.filter(
        question__label='Primary Concern Category',
        answer='Attendance dropping and disengagement in lessons.',
    ).update(answer='Attendance')


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inclusion', '0012_remove_concern_freetext_rename_category'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
