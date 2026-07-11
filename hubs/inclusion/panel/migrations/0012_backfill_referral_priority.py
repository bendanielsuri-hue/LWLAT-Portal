from django.db import migrations


def forwards(apps, schema_editor):
    InclusionReferral = apps.get_model('panel', 'InclusionReferral')
    PanelReferral = apps.get_model('panel', 'PanelReferral')
    # A referral can have been on more than one panel (re-referred, moved
    # between meetings) - take the most recently created PanelReferral's
    # priority as the one that carries forward. Referrals never assigned to
    # any panel are left at the field's blank default - they were never
    # triaged, so there's nothing to backfill.
    for ir in InclusionReferral.objects.all():
        latest = PanelReferral.objects.filter(referral_id=ir.id).order_by('-created_at', '-pk').first()
        if latest is not None and latest.priority:
            ir.priority = latest.priority
            ir.save(update_fields=['priority'])


def backwards(apps, schema_editor):
    # Nothing to undo - the source PanelReferral.priority values this read
    # from are untouched by this migration.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0011_inclusionreferral_priority'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
