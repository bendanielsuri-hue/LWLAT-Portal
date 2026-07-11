from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0018_panelmember_panel_group_member'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='panelmember',
            unique_together=set(),
        ),
        migrations.RemoveField(model_name='panelmember', name='staff'),
        migrations.RemoveField(model_name='panelmember', name='external_contact'),
        migrations.RemoveField(model_name='panelmember', name='expertise'),
        migrations.RemoveField(model_name='panelmember', name='attended'),
        migrations.RemoveField(model_name='panelmember', name='is_active'),
        migrations.AlterField(
            model_name='panelmember',
            name='panel_group_member',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+', to='panel.panelgroupmember',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='panelmember',
            unique_together={('panel', 'panel_group_member')},
        ),
    ]
