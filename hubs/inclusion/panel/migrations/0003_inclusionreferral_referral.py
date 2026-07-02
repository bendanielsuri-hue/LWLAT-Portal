from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0002_rename_referral_inclusionreferral'),
        ('core', '0012_referral'),
    ]

    operations = [
        migrations.AddField(
            model_name='inclusionreferral',
            name='referral',
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='inclusion_detail',
                to='core.referral',
            ),
        ),
    ]
