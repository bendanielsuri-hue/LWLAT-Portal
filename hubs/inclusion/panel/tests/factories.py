"""Row factories for panel tests.

Pinning down even one panel rule needs a chain of rows across three apps:
School -> Staff/Student -> core.Referral -> InclusionReferral -> PanelGroup
-> PanelGroupMember -> Panel -> PanelReferral. InclusionReferral is a detail
table hanging off the shared core.Referral base (ADR 0001), and a
PanelReferral means nothing without both a Panel and a group to run it, so
none of those links can be skipped. Rebuilding that chain inline in every
test is most of what makes these rules feel untestable, so it lives here
once.

Deliberately NOT the seed_* management commands. Those are whole-database,
order-dependent ("seed_schools must run after seed_dummy_data") and built to
produce a browsable demo. A test wants the smallest world that makes one
assertion meaningful, and wants to vary one field of it without reseeding
everything.

Benjamin Suri is created by default because core.identity.default_staff()
looks him up by name as the whole app's fallback identity - with no cookie
set (which is every test client request) any view calling current_staff()
gets None without him, which is not a state the running app is ever in.
"""

import datetime

from django.utils import timezone

from core.models import School, Staff, Student
from hubs.inclusion.panel.models import (
    InclusionReferral,
    Panel,
    PanelGroup,
    PanelGroupMember,
    PanelReferral,
)


class PanelWorld:
    """The rows one panel test needs, addressable by name.

    Plain attribute bag rather than a dataclass so a test can hang extra rows
    on it (a second panel, an escalation) without a factory change.
    """

    def __init__(self, **rows):
        self.__dict__.update(rows)


def make_school(name='Test Academy', category='Secondary', **kwargs):
    return School.objects.create(name=name, category=category, **kwargs)


def make_staff(first_name='Ada', last_name='Byron', school=None, **kwargs):
    # staff_code is unique and nothing in the tests cares about its value, so
    # derive it from the name rather than making every caller invent one.
    kwargs.setdefault('staff_code', f'{first_name[:2]}{last_name[:3]}'.upper())
    return Staff.objects.create(
        first_name=first_name, last_name=last_name, school=school, **kwargs
    )


def make_default_identity(school=None):
    """The Benjamin Suri row core.identity.default_staff() falls back to.

    Mirrors seed_benjamin_admin: MAT-wide (no school), developer, DSL.
    """
    return make_staff(
        first_name='Benjamin',
        last_name='Suri',
        school=None,
        staff_code='BSURI',
        job_title='Portal Developer',
        is_mat_staff=True,
        is_developer=True,
        is_dsl=True,
    )


def make_student(first_name='Rosa', last_name='Parks', school=None, year_group=9, **kwargs):
    # upn and admission_number are both unique; same reasoning as staff_code.
    stem = f'{first_name}{last_name}'.upper()
    kwargs.setdefault('upn', f'UPN{stem}')
    kwargs.setdefault('admission_number', f'ADM{stem}')
    kwargs.setdefault('date_of_birth', datetime.date(2011, 5, 4))
    return Student.objects.create(
        first_name=first_name, last_name=last_name, school=school,
        year_group=year_group, **kwargs
    )


def make_referral(student, raised_by=None, status='open'):
    """An InclusionReferral plus its core.Referral base row.

    Goes through create_for rather than InclusionReferral.objects.create so
    tests exercise the same dual-write invariant the app uses (the base row's
    raised_by must match the detail row's).
    """
    return InclusionReferral.create_for(student, raised_by, status=status)


def make_panel_group(school=None, name='Test Panel Group', chair=None, members=()):
    group = PanelGroup.objects.create(name=name, school=school, default_chair=chair)
    for staff in members:
        PanelGroupMember.objects.create(panel_group=group, staff=staff)
    return group


def make_panel(group=None, date=None, status='ready', **kwargs):
    return Panel.objects.create(
        panel_group=group,
        date=date or timezone.localdate(),
        status=status,
        **kwargs,
    )


def make_panel_referral(panel, referral, **kwargs):
    return PanelReferral.objects.create(panel=panel, referral=referral, **kwargs)


def build_panel_world(referral_count=1):
    """One school, one panel group with a member, one upcoming panel, and
    `referral_count` referrals already on its agenda.

    Enough for any view in the app to render, and the starting point for the
    lifecycle tests (which then move one PanelReferral and assert on the
    referral's aggregate status).
    """
    school = make_school()
    benjamin = make_default_identity()
    sendco = make_staff('Ada', 'Byron', school=school, job_title='SENDCo', is_dsl=True)
    group = make_panel_group(school=school, chair=sendco, members=[sendco, benjamin])
    panel = make_panel(group=group)

    students, referrals, panel_referrals = [], [], []
    for i in range(referral_count):
        student = make_student(f'Rosa{i}', 'Parks', school=school)
        referral = make_referral(student, raised_by=sendco)
        students.append(student)
        referrals.append(referral)
        panel_referrals.append(make_panel_referral(panel, referral, agenda_order=i))

    return PanelWorld(
        school=school,
        benjamin=benjamin,
        sendco=sendco,
        group=group,
        panel=panel,
        students=students,
        student=students[0] if students else None,
        referrals=referrals,
        referral=referrals[0] if referrals else None,
        panel_referrals=panel_referrals,
        panel_referral=panel_referrals[0] if panel_referrals else None,
    )
