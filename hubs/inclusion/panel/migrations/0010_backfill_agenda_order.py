from django.db import migrations


PRIORITY_ORDER = {'high': 0, 'medium': 1, 'low': 2}


def backfill_agenda_order(apps, schema_editor):
    Panel = apps.get_model('panel', 'Panel')
    PanelReferral = apps.get_model('panel', 'PanelReferral')
    for panel in Panel.objects.all():
        referrals = list(
            PanelReferral.objects.filter(panel=panel, removed_at__isnull=True).order_by('id')
        )
        referrals.sort(key=lambda pr: (PRIORITY_ORDER.get(pr.priority, 1), pr.id))
        for index, pr in enumerate(referrals, start=1):
            pr.agenda_order = index
        PanelReferral.objects.bulk_update(referrals, ['agenda_order'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0009_panelreferral_agenda_order'),
    ]

    operations = [
        migrations.RunPython(backfill_agenda_order, noop),
    ]
