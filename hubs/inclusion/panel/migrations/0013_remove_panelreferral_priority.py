from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0012_backfill_referral_priority'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='panelreferral',
            name='priority',
        ),
    ]
