from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0004_backfill_core_referral'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inclusionreferral',
            name='referral',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='inclusion_detail',
                to='core.referral',
            ),
        ),
    ]
