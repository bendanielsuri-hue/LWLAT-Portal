from django.db import migrations, models
import django.db.models.deletion


def forwards(apps, schema_editor):
    PanelMember = apps.get_model('panel', 'PanelMember')
    PanelGroupMember = apps.get_model('panel', 'PanelGroupMember')
    for pm in PanelMember.objects.select_related('panel'):
        group_id = pm.panel.panel_group_id
        if not group_id:
            pm.delete()
            continue
        gm = None
        if pm.staff_id:
            gm = PanelGroupMember.objects.filter(panel_group_id=group_id, staff_id=pm.staff_id).first()
        elif pm.external_contact_id:
            gm = PanelGroupMember.objects.filter(panel_group_id=group_id, external_contact_id=pm.external_contact_id).first()
        if gm is None:
            pm.delete()
            continue
        pm.panel_group_member_id = gm.id
        pm.save(update_fields=['panel_group_member'])


def backwards(apps, schema_editor):
    # panel_group_member is dropped in the next migration anyway - nothing
    # meaningful to restore staff/external_contact from here.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('panel', '0017_panelgroupmember_deactivated_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='panelmember',
            name='panel_group_member',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+', to='panel.panelgroupmember',
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
