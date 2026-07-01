"""
State-only migration: claims all 16 models that physically live in the
inclusion_* tables.  No database operations are performed — the tables
already exist from hubs.inclusion migrations 0001-0020.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('inclusion', '0020_update_main_concern_category_choices'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='ReferralCategory',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100)),
                        ('order', models.PositiveSmallIntegerField(default=0)),
                        ('is_active', models.BooleanField(default=True)),
                    ],
                    options={'ordering': ['order', 'name'], 'db_table': 'inclusion_referralcategory'},
                ),
                migrations.CreateModel(
                    name='ReferralQuestion',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('label', models.CharField(max_length=255)),
                        ('order', models.PositiveSmallIntegerField(default=0)),
                        ('is_active', models.BooleanField(default=True)),
                        ('question_type', models.CharField(choices=[('text', 'Text'), ('select', 'Dropdown')], default='text', max_length=10)),
                        ('choices', models.CharField(blank=True, help_text='Comma-separated options, used when type is Dropdown.', max_length=500)),
                        ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='questions', to='panel.referralcategory')),
                    ],
                    options={'ordering': ['category__order', 'order'], 'db_table': 'inclusion_referralquestion'},
                ),
                migrations.CreateModel(
                    name='Referral',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('status', models.CharField(choices=[('open', 'Open'), ('in_panel', 'In Panel'), ('closed', 'Closed')], default='open', max_length=20)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='referrals', to='core.student')),
                        ('raised_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.staff')),
                    ],
                    options={'ordering': ['-created_at'], 'db_table': 'inclusion_referral'},
                ),
                migrations.CreateModel(
                    name='ReferralResponse',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('answer', models.TextField(blank=True)),
                        ('referral', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='responses', to='panel.referral')),
                        ('question', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='panel.referralquestion')),
                    ],
                    options={'db_table': 'inclusion_referralresponse'},
                ),
                migrations.CreateModel(
                    name='StudentNote',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('body', models.TextField()),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notes', to='core.student')),
                        ('author', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.staff')),
                    ],
                    options={'ordering': ['-created_at'], 'db_table': 'inclusion_studentnote'},
                ),
                migrations.CreateModel(
                    name='Expertise',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100)),
                        ('order', models.PositiveSmallIntegerField(default=0)),
                        ('is_active', models.BooleanField(default=True)),
                        ('school', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='expertise_tags', to='core.school')),
                    ],
                    options={'ordering': ['order', 'name'], 'db_table': 'inclusion_expertise'},
                ),
                migrations.CreateModel(
                    name='ExternalContact',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=150)),
                        ('job_title', models.CharField(blank=True, max_length=150)),
                        ('is_active', models.BooleanField(default=True)),
                    ],
                    options={'ordering': ['name'], 'db_table': 'inclusion_externalcontact'},
                ),
                migrations.CreateModel(
                    name='PanelGroup',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100)),
                        ('is_active', models.BooleanField(default=True)),
                        ('school', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='panel_groups', to='core.school')),
                        ('default_chair', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.staff')),
                    ],
                    options={'db_table': 'inclusion_panelgroup'},
                ),
                migrations.CreateModel(
                    name='PanelGroupMember',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('joined_at', models.DateTimeField(auto_now_add=True)),
                        ('panel_group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='panel.panelgroup')),
                        ('staff', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='core.staff')),
                        ('external_contact', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='panel.externalcontact')),
                        ('expertise', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='panel.expertise')),
                    ],
                    options={'db_table': 'inclusion_panelgroupmember', 'unique_together': {('panel_group', 'staff'), ('panel_group', 'external_contact')}},
                ),
                migrations.CreateModel(
                    name='Panel',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('date', models.DateField()),
                        ('time', models.TimeField(blank=True, null=True)),
                        ('status', models.CharField(choices=[('upcoming', 'Upcoming'), ('complete', 'Complete')], default='upcoming', max_length=20)),
                        ('started_at', models.DateTimeField(blank=True, null=True)),
                        ('chair', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='chaired_panels', to='core.staff')),
                        ('panel_group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='panels', to='panel.panelgroup')),
                    ],
                    options={'ordering': ['date'], 'db_table': 'inclusion_panel'},
                ),
                migrations.CreateModel(
                    name='PanelMember',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('attended', models.BooleanField(default=True)),
                        ('is_active', models.BooleanField(default=True)),
                        ('checked_in_at', models.DateTimeField(blank=True, null=True)),
                        ('left_at', models.DateTimeField(blank=True, null=True)),
                        ('panel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='panel.panel')),
                        ('staff', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='core.staff')),
                        ('external_contact', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='panel.externalcontact')),
                        ('expertise', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='panel.expertise')),
                    ],
                    options={'db_table': 'inclusion_panelmember', 'unique_together': {('panel', 'staff'), ('panel', 'external_contact')}},
                ),
                migrations.CreateModel(
                    name='PanelReferral',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('discussion_status', models.CharField(choices=[('pending', 'Pending'), ('discussed', 'Discussed')], default='pending', max_length=20)),
                        ('duration', models.DurationField(blank=True, null=True)),
                        ('follow_up_date', models.DateField(blank=True, null=True)),
                        ('follow_up_status', models.CharField(blank=True, choices=[('incomplete', 'Incomplete'), ('complete', 'Complete')], max_length=20)),
                        ('priority', models.CharField(choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')], default='medium', max_length=10)),
                        ('discussion_started_at', models.DateTimeField(blank=True, null=True)),
                        ('removed_at', models.DateTimeField(blank=True, null=True)),
                        ('panel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='panel_referrals', to='panel.panel')),
                        ('referral', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='panel_referrals', to='panel.referral')),
                        ('removed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='core.staff')),
                    ],
                    options={'db_table': 'inclusion_panelreferral', 'unique_together': {('panel', 'referral')}},
                ),
                migrations.CreateModel(
                    name='PanelReferralNote',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('body', models.TextField()),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('panel_referral', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notes', to='panel.panelreferral')),
                        ('author', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.staff')),
                    ],
                    options={'ordering': ['-created_at'], 'db_table': 'inclusion_panelreferralnote'},
                ),
                migrations.CreateModel(
                    name='ActionCategory',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100)),
                        ('order', models.PositiveSmallIntegerField(default=0)),
                        ('is_active', models.BooleanField(default=True)),
                        ('auto_assign_job_title', models.CharField(blank=True, max_length=100)),
                        ('is_sensitive', models.BooleanField(default=False)),
                    ],
                    options={'ordering': ['order', 'name'], 'db_table': 'inclusion_actioncategory'},
                ),
                migrations.CreateModel(
                    name='Action',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('due_date', models.DateField(blank=True, null=True)),
                        ('status', models.CharField(choices=[('incomplete', 'Incomplete'), ('complete', 'Complete'), ('not_needed', 'Inactive')], default='incomplete', max_length=20)),
                        ('note', models.TextField(blank=True)),
                        ('referral', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='actions', to='panel.referral')),
                        ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='panel.actioncategory')),
                        ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.staff')),
                    ],
                    options={'ordering': ['due_date'], 'db_table': 'inclusion_action'},
                ),
                migrations.CreateModel(
                    name='Escalation',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('escalated_at', models.DateTimeField(auto_now_add=True)),
                        ('reason', models.TextField()),
                        ('status', models.CharField(choices=[('open', 'Open'), ('resolved', 'Resolved')], default='open', max_length=20)),
                        ('resolution_notes', models.TextField(blank=True)),
                        ('resolved_at', models.DateTimeField(blank=True, null=True)),
                        ('referral', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='escalations', to='panel.referral')),
                        ('escalated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='core.staff')),
                    ],
                    options={'ordering': ['-escalated_at'], 'db_table': 'inclusion_escalation'},
                ),
            ],
            database_operations=[],
        ),
    ]
