from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_student_ethnicity_student_is_more_able_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Referral',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('referral_type', models.CharField(choices=[('send', 'SEND'), ('behaviour', 'Behaviour'), ('attendance', 'Attendance'), ('inclusion', 'Inclusion')], max_length=20)),
                ('date_referred', models.DateField()),
                ('status', models.CharField(choices=[('open', 'Open'), ('closed', 'Closed')], default='open', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('raised_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.staff')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='referrals_v2', to='core.student')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
