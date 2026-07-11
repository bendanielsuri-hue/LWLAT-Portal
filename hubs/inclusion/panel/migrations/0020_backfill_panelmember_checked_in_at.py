import datetime

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    # 0018's backfill carried PanelMember rows over onto their matching
    # PanelGroupMember but left checked_in_at as whatever it already was -
    # under the old model, checked_in_at was only ever set by someone
    # actually clicking "check in" during a live meeting, so every row
    # seeded by the old _seed_members command (which only set attended=True,
    # never checked_in_at) has it null. Now that a PanelMember row's entire
    # reason for existing *is* attendance, backfill a reasonable check-in
    # time for these - the panel's started_at, falling back to its
    # date/time - so historical Complete/Running demo meetings still show
    # realistic attendance instead of "no members checked in."
    PanelMember = apps.get_model('panel', 'PanelMember')
    for pm in PanelMember.objects.filter(checked_in_at__isnull=True).select_related('panel'):
        panel = pm.panel
        pm.checked_in_at = panel.started_at or timezone.make_aware(
            datetime.datetime.combine(panel.date, panel.time or datetime.time.min)
        )
        pm.save(update_fields=['checked_in_at'])


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0019_panelmember_drop_roster_fields'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
