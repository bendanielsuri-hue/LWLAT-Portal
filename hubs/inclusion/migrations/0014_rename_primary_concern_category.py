from django.db import migrations


def forwards(apps, schema_editor):
    ReferralQuestion = apps.get_model('inclusion', 'ReferralQuestion')
    ReferralQuestion.objects.filter(label='Primary Concern Category').update(label='Main Concern Category')


def backwards(apps, schema_editor):
    ReferralQuestion = apps.get_model('inclusion', 'ReferralQuestion')
    ReferralQuestion.objects.filter(label='Main Concern Category').update(label='Primary Concern Category')


class Migration(migrations.Migration):

    dependencies = [
        ('inclusion', '0013_fix_stray_concern_category_text'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
