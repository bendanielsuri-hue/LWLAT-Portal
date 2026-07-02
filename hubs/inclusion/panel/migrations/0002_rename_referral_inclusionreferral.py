from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0001_initial'),
    ]

    operations = [
        migrations.RenameModel(old_name='Referral', new_name='InclusionReferral'),
    ]
