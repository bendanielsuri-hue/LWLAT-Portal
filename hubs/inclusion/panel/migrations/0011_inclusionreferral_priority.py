from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0010_backfill_agenda_order'),
    ]

    operations = [
        migrations.AddField(
            model_name='inclusionreferral',
            name='priority',
            field=models.CharField(blank=True, choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')], default='', max_length=10),
        ),
    ]
