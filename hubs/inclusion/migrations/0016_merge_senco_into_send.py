from django.db import migrations


def forwards(apps, schema_editor):
    Expertise = apps.get_model('inclusion', 'Expertise')
    PanelGroupMember = apps.get_model('inclusion', 'PanelGroupMember')
    PanelMember = apps.get_model('inclusion', 'PanelMember')

    senco = Expertise.objects.filter(name='SENCO').first()
    send = Expertise.objects.filter(name='SEND').first()
    if senco is None or send is None:
        return

    PanelGroupMember.objects.filter(expertise=senco).update(expertise=send)
    PanelMember.objects.filter(expertise=senco).update(expertise=send)
    senco.is_active = False
    senco.save()


def backwards(apps, schema_editor):
    Expertise = apps.get_model('inclusion', 'Expertise')
    Expertise.objects.filter(name='SENCO').update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ('inclusion', '0015_panelgroupmember_joined_at_panelmember_is_active'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
