from django.db import migrations


def forwards(apps, schema_editor):
    InclusionReferral = apps.get_model('panel', 'InclusionReferral')
    CoreReferral = apps.get_model('core', 'Referral')
    for ir in InclusionReferral.objects.filter(referral__isnull=True):
        base = CoreReferral.objects.create(
            referral_type='inclusion',
            student_id=ir.student_id,
            raised_by_id=ir.raised_by_id,
            date_referred=ir.created_at.date(),
            status='closed' if ir.status == 'closed' else 'open',
        )
        CoreReferral.objects.filter(pk=base.pk).update(created_at=ir.created_at)
        ir.referral_id = base.id
        ir.save(update_fields=['referral_id'])


def backwards(apps, schema_editor):
    InclusionReferral = apps.get_model('panel', 'InclusionReferral')
    CoreReferral = apps.get_model('core', 'Referral')
    InclusionReferral.objects.update(referral=None)
    CoreReferral.objects.filter(referral_type='inclusion').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0003_inclusionreferral_referral'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
