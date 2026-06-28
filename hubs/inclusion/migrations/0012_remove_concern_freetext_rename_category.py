from django.db import migrations


def forwards(apps, schema_editor):
    ReferralQuestion = apps.get_model('inclusion', 'ReferralQuestion')
    ReferralResponse = apps.get_model('inclusion', 'ReferralResponse')

    concern_question = ReferralQuestion.objects.filter(label='Concern').first()
    if concern_question is not None:
        ReferralResponse.objects.filter(question=concern_question).delete()
        concern_question.delete()

    ReferralQuestion.objects.filter(label='Concern Category').update(label='Primary Concern Category')


def backwards(apps, schema_editor):
    ReferralQuestion = apps.get_model('inclusion', 'ReferralQuestion')
    ReferralQuestion.objects.filter(label='Primary Concern Category').update(label='Concern Category')


class Migration(migrations.Migration):

    dependencies = [
        ('inclusion', '0011_panelgroupmember_guest_name_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
