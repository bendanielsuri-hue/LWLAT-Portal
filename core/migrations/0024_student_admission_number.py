from django.db import migrations, models


def backfill_admission_number(apps, schema_editor):
    Student = apps.get_model('core', 'Student')
    for student in Student.objects.all():
        student.admission_number = f'{10000 + student.pk}'
        student.save(update_fields=['admission_number'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_pageview'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='admission_number',
            field=models.CharField(max_length=20, null=True, unique=True),
        ),
        migrations.RunPython(backfill_admission_number, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='student',
            name='admission_number',
            field=models.CharField(max_length=20, unique=True),
        ),
    ]
