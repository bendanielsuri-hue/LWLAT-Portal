"""
State-only migration: removes the 16 models that have moved to hubs.inclusion.panel.
No database operations — the tables remain and are now owned by the panel app.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('inclusion', '0020_update_main_concern_category_choices'),
        ('panel', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='ReferralCategory'),
                migrations.DeleteModel(name='ReferralQuestion'),
                migrations.DeleteModel(name='ReferralResponse'),
                migrations.DeleteModel(name='Referral'),
                migrations.DeleteModel(name='StudentNote'),
                migrations.DeleteModel(name='Expertise'),
                migrations.DeleteModel(name='ExternalContact'),
                migrations.DeleteModel(name='PanelGroupMember'),
                migrations.DeleteModel(name='PanelGroup'),
                migrations.DeleteModel(name='PanelMember'),
                migrations.DeleteModel(name='PanelReferralNote'),
                migrations.DeleteModel(name='PanelReferral'),
                migrations.DeleteModel(name='Panel'),
                migrations.DeleteModel(name='ActionCategory'),
                migrations.DeleteModel(name='Action'),
                migrations.DeleteModel(name='Escalation'),
            ],
            database_operations=[],
        ),
    ]
