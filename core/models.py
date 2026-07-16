# Dummy Student/Staff models, seeded with fake data over SQLite.
#
# Swapping to the real Azure MIS later:
#   - Point DATABASES (or a second entry + DATABASE_ROUTERS) at the Azure SQL
#     connection holding the MIS data.
#   - Set Meta.managed = False on these models and add db_table/db_column to
#     match the real MIS table/view and column names.
# Field names below are the contract every hub view should code against, so
# none of that needs to ripple out into hubs/*/views.py.

import datetime

from django.db import models
from django.utils import timezone

# Reused by School/MatSettings/CategorySettings as the only colours available for
# the per-school accent override, matching the personal "Primary colour" picker's
# choices in templates/_settings_content.html / [data-color="..."] CSS rules.
ACCENT_COLOUR_CHOICES = [
    ('purple', 'Royal Purple'), ('blue', 'Ocean Blue'),
    ('teal', 'Deep Teal'), ('green', 'Forest Green'), ('yellow', 'Golden Yellow'),
    ('orange', 'Sunset Orange'), ('red', 'Cherry Red'), ('pink', 'Blossom Pink'),
]


class School(models.Model):
    CATEGORY_CHOICES = [('Primary', 'Primary'), ('Secondary', 'Secondary')]

    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    is_active = models.BooleanField(default=True)

    # Portal-chrome overrides for this school — see core.portal_settings for the
    # School -> Category -> MAT fallthrough that resolves these (blank = inherit).
    student_term = models.CharField(max_length=30, blank=True)
    staff_term = models.CharField(max_length=30, blank=True)
    portal_title = models.CharField(max_length=100, blank=True)
    accent_colour = models.CharField(max_length=10, choices=ACCENT_COLOUR_CHOICES, blank=True)
    logo_url = models.CharField(max_length=300, blank=True)
    support_email = models.EmailField(blank=True)
    support_phone = models.CharField(max_length=30, blank=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return self.name


class MatSettings(models.Model):
    # Singleton MAT-wide defaults — the bottom tier of the School -> Category -> MAT
    # fallthrough in core.portal_settings. Always exactly one row (forced pk=1).
    student_term = models.CharField(max_length=30, blank=True)
    staff_term = models.CharField(max_length=30, blank=True)
    portal_title = models.CharField(max_length=100, blank=True)
    accent_colour = models.CharField(max_length=10, choices=ACCENT_COLOUR_CHOICES, blank=True)
    logo_url = models.CharField(max_length=300, blank=True)
    support_email = models.EmailField(blank=True)
    support_phone = models.CharField(max_length=30, blank=True)

    class Meta:
        verbose_name = 'MAT settings'
        verbose_name_plural = 'MAT settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return 'MAT defaults'


class CategorySettings(models.Model):
    # Middle tier of the fallthrough — one optional row per School.CATEGORY_CHOICES.
    category = models.CharField(max_length=20, choices=School.CATEGORY_CHOICES, unique=True)
    student_term = models.CharField(max_length=30, blank=True)
    staff_term = models.CharField(max_length=30, blank=True)
    portal_title = models.CharField(max_length=100, blank=True)
    accent_colour = models.CharField(max_length=10, choices=ACCENT_COLOUR_CHOICES, blank=True)
    logo_url = models.CharField(max_length=300, blank=True)
    support_email = models.EmailField(blank=True)
    support_phone = models.CharField(max_length=30, blank=True)

    class Meta:
        verbose_name_plural = 'Category settings'

    def __str__(self):
        return f'{self.category} defaults'


class Module(models.Model):
    STATUS_HIDDEN = 'hidden'
    STATUS_PILOT = 'pilot'
    STATUS_LIVE = 'live'
    STATUS_CHOICES = [(STATUS_HIDDEN, 'Hidden'), (STATUS_PILOT, 'Pilot'), (STATUS_LIVE, 'Live')]

    # Matches a Django URL name by convention — if you rename a path(..., name=...),
    # update the matching Module.key too, or filtering will warn and default to visible.
    key = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.CASCADE, related_name='children'
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_HIDDEN)
    pilot_schools = models.ManyToManyField(School, blank=True, related_name='piloting_modules')
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class Staff(models.Model):
    staff_code = models.CharField(max_length=20, unique=True)  # MIS staff ID
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    job_title = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=100, blank=True)
    school = models.ForeignKey(
        School, null=True, blank=True, on_delete=models.SET_NULL, related_name='staff_members'
    )
    is_active = models.BooleanField(default=True)
    is_mat_staff = models.BooleanField(default=False)
    is_developer = models.BooleanField(default=False)
    # Designated Safeguarding Lead - gates who can write a SafeguardingNote
    # (below), the same visibility-only, no-server-enforcement convention as
    # every other role flag on this model (see root CLAUDE.md "No
    # auth/permissions enforced yet"). Any panel staff can still read a
    # note - only writing it is gated to is_dsl.
    is_dsl = models.BooleanField(default=False)
    photo = models.ImageField(upload_to='staff_photos/', blank=True, null=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.last_name}, {self.first_name}'


class StaffGroup(models.Model):
    # A named group of Staff a task/action can be assigned to instead of one
    # individual - "SENCo Team", "Head of Year 9", "Careers Team". Deliberately
    # not scoped to any one hub (core, not hubs.inclusion.panel) since this is
    # a MAT-wide staffing concept other hubs can reuse later, same reasoning
    # as core.Staff/core.Student themselves. Distinct from
    # hubs.inclusion.panel.PanelGroup, which is semantically tied to running
    # panel meetings, not general task assignment.
    name = models.CharField(max_length=100)
    school = models.ForeignKey(
        School, null=True, blank=True, on_delete=models.SET_NULL, related_name='staff_groups'
    )  # null = MAT-wide (e.g. Careers Team)
    year_group = models.PositiveSmallIntegerField(null=True, blank=True)  # null = not year-specific
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['school', 'year_group', 'name']

    def __str__(self):
        return self.name


class StaffGroupMember(models.Model):
    group = models.ForeignKey(StaffGroup, on_delete=models.CASCADE, related_name='members')
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='staff_group_memberships')

    class Meta:
        unique_together = [('group', 'staff')]

    def __str__(self):
        return f'{self.staff} in {self.group}'


class Student(models.Model):
    upn = models.CharField(max_length=20, unique=True)  # Unique Pupil Number
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    year_group = models.PositiveSmallIntegerField()
    reg_form = models.CharField(max_length=10, blank=True)
    # Plain CharField, not a fixed choice list - houses are a per-school
    # naming scheme (e.g. Babington uses A-E), not a portal-wide fixed set,
    # and not every school runs a house system at all (blank means none).
    house = models.CharField(max_length=20, blank=True)
    form_tutor = models.ForeignKey(
        Staff, null=True, blank=True, on_delete=models.SET_NULL, related_name='tutees'
    )
    school = models.ForeignKey(
        School, null=True, blank=True, on_delete=models.SET_NULL, related_name='students'
    )
    date_of_birth = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    # Inclusion/SEND context fields.
    is_pp = models.BooleanField('Pupil Premium', default=False)
    is_eal = models.BooleanField('EAL', default=False)
    is_lac = models.BooleanField('Looked After Child', default=False)
    is_young_carer = models.BooleanField('Young Carer', default=False)

    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female')]
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True)

    SEN_STATUS_CHOICES = [('K', 'SEN Support (K)'), ('E', 'EHCP (E)')]
    sen_status = models.CharField(max_length=1, choices=SEN_STATUS_CHOICES, blank=True)

    is_more_able = models.BooleanField('More Able', default=False)

    ETHNICITY_CHOICES = [
        ('white_british', 'White British'),
        ('white_other', 'White Other'),
        ('mixed', 'Mixed / Multiple Ethnic Groups'),
        ('asian', 'Asian or Asian British'),
        ('black', 'Black or Black British'),
        ('chinese', 'Chinese'),
        ('other', 'Any Other Ethnic Group'),
    ]
    ethnicity = models.CharField(max_length=20, choices=ETHNICITY_CHOICES, blank=True)

    PRIOR_ATTAINMENT_CHOICES = [('low', 'Low'), ('middle', 'Middle'), ('high', 'High')]
    prior_attainment_band = models.CharField(max_length=10, choices=PRIOR_ATTAINMENT_CHOICES, blank=True)

    # Broad area of need from the SEND Code of Practice — only meaningful
    # when sen_status is set (K or E).
    SEND_NEED_CHOICES = [
        ('cognition', 'Cognition and Learning'),
        ('semh', 'Social, Emotional and Mental Health'),
        ('communication', 'Communication and Interaction'),
        ('sensory', 'Sensory and/or Physical'),
    ]
    send_need = models.CharField(max_length=20, choices=SEND_NEED_CHOICES, blank=True)
    date_of_arrival = models.DateField(null=True, blank=True)
    year_arrived = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.last_name}, {self.first_name}'


# The stored source of truth for a student's attendance record - an AM and a
# PM mark per day, matching how UK schools actually take a register twice
# daily. Any percentage/weekly/termly view is always a derived rollup
# computed from these at query time (see core/student_history.py), never
# stored on Student directly - see
# docs/adr/0007-student-history-tables-not-summary-fields.md for why.
class AttendanceDay(models.Model):
    SESSION_CHOICES = [
        ('present', 'Present'),
        ('absent_unauthorised', 'Absent (Unauthorised)'),
        ('absent_authorised', 'Absent (Authorised)'),
        ('late', 'Late'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='attendance_days')
    date = models.DateField()
    am_status = models.CharField(max_length=20, choices=SESSION_CHOICES, default='present')
    pm_status = models.CharField(max_length=20, choices=SESSION_CHOICES, default='present')

    class Meta:
        ordering = ['-date']
        unique_together = [('student', 'date')]

    def __str__(self):
        return f'{self.student} — {self.date}'


# One row per logged behaviour event - the behaviour picture shown anywhere
# in the app (a summary, a trend) is always derived from this log, never a
# standalone freeform summary field. category is a fixed preset set (not an
# admin-configurable model like ActionCategory) since it doesn't vary
# per-school the way Action's categories do.
class BehaviourIncident(models.Model):
    CATEGORY_CHOICES = [
        ('disruption', 'Disruption'),
        ('aggression', 'Aggression'),
        ('defiance', 'Defiance'),
        ('other', 'Other'),
    ]
    SEVERITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='behaviour_incidents')
    date = models.DateField()
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='low')
    logged_by = models.ForeignKey(Staff, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.student} — {self.get_category_display()} ({self.date})'


# One row per logged exclusion - exclusions_count shown anywhere in the app
# is always a derived count of these records, never its own stored counter.
class Exclusion(models.Model):
    TYPE_CHOICES = [
        ('fixed_term', 'Fixed-term'),
        ('permanent', 'Permanent'),
        ('internal', 'Internal'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='exclusions')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)  # blank/null = permanent
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.student} — {self.get_type_display()} ({self.start_date})'


class AcademicYear(models.Model):
    # Keyed on start_date (not a bare start_year int) so a year's actual
    # first day is a real, queryable fact rather than an assumed Sept 1 -
    # school years don't all start on the same calendar day (see the two
    # sample term-dates sheets this model was designed against - see
    # docs/adr/0008-academic-year-term-model-shape.md).
    start_date = models.DateField(unique=True)
    end_date = models.DateField()
    # Auto-derived from start_date on save, not user-editable - see save().
    label = models.CharField(max_length=10, editable=False)

    class Meta:
        ordering = ['-start_date']

    def save(self, *args, **kwargs):
        self.label = f'{self.start_date.year}/{str(self.start_date.year + 1)[-2:]}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.label

    @classmethod
    def for_date(cls, d):
        # Latest year that's already started as of `d`, not a strict
        # start_date<=d<=end_date containment check - a date can legitimately
        # fall in the gap between one year's end_date and the next year's
        # start_date (e.g. a summer-holiday referral), and it belongs to the
        # year that's still "current" until the next one actually begins, not
        # a mismatched synthesized row for that gap (see docs/adr/0008).
        year = cls.objects.filter(start_date__lte=d).order_by('-start_date').first()
        if year:
            return year
        # No seeded year starts before `d` at all (e.g. a historic date older
        # than seed_term_dates' range) - fall back to the conventional
        # Sept-Aug boundary the old ad-hoc _academic_year_key/_academic_year_
        # label helpers (hubs/inclusion/panel/views.py) used to encode.
        start_year = d.year if d.month >= 9 else d.year - 1
        year, _ = cls.objects.get_or_create(
            start_date=datetime.date(start_year, 9, 1),
            defaults={'end_date': datetime.date(start_year + 1, 8, 31)},
        )
        return year


class Term(models.Model):
    TERM_AUTUMN = 'autumn'
    TERM_SPRING = 'spring'
    TERM_SUMMER = 'summer'
    TERM_CHOICES = [
        (TERM_AUTUMN, 'Autumn'),
        (TERM_SPRING, 'Spring'),
        (TERM_SUMMER, 'Summer'),
    ]

    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='terms')
    name = models.CharField(max_length=10, choices=TERM_CHOICES)
    start_date = models.DateField()
    end_date = models.DateField()
    # The one internal break within a term (e.g. late Oct) - not a separate
    # Term row, since it's not its own bounded academic period with a name
    # of its own. Nullable since not every term necessarily has one recorded.
    half_term_start = models.DateField(null=True, blank=True)
    half_term_end = models.DateField(null=True, blank=True)
    # Holiday periods between terms are deliberately NOT stored here - they're
    # just the gap between one Term's end_date and the next Term's start_date
    # (or next year's Autumn Term, for the summer holidays). Storing them
    # explicitly would duplicate that gap and can't cleanly represent the
    # summer holidays' open-ended end (see docs/adr/0008).
    # Null = MAT-wide (applies to every school); set = this school's own
    # calendar overrides the MAT-wide row for the same academic_year/name.
    # Mirrors the School -> MAT tiered-resolution pattern already used by
    # core.portal_settings.resolve_portal_settings.
    school = models.ForeignKey(
        School, null=True, blank=True, on_delete=models.CASCADE, related_name='terms',
    )

    class Meta:
        ordering = ['start_date']
        unique_together = [('academic_year', 'name', 'school')]

    def __str__(self):
        scope = self.school.name if self.school_id else 'MAT-wide'
        return f'{self.get_name_display()} {self.academic_year} ({scope})'


class Referral(models.Model):
    # Extensible by adding new choices later — no separate lookup table, following
    # the same convention as Student.sen_status / School.category / Module.status.
    TYPE_SEND = 'send'
    TYPE_BEHAVIOUR = 'behaviour'
    TYPE_ATTENDANCE = 'attendance'
    TYPE_INCLUSION = 'inclusion'
    TYPE_CHOICES = [
        (TYPE_SEND, 'SEND'),
        (TYPE_BEHAVIOUR, 'Behaviour'),
        (TYPE_ATTENDANCE, 'Attendance'),
        (TYPE_INCLUSION, 'Inclusion'),
    ]

    # Minimal cross-type status for reporting/search only — NOT a state machine.
    # Type-specific detail tables (e.g. InclusionReferral) own their own richer
    # status where needed and are responsible for keeping this field in sync
    # (see hubs/inclusion/panel/models.py::InclusionReferral and the existing
    # _sync_referral_status() convention in hubs/inclusion/panel/views.py).
    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [(STATUS_OPEN, 'Open'), (STATUS_CLOSED, 'Closed')]

    referral_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='referrals_v2')
    raised_by = models.ForeignKey(Staff, null=True, blank=True, on_delete=models.SET_NULL)
    date_referred = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    # Auto-derived from created_at, not user-editable - see save(). created_at
    # is only assigned by Django's auto_now_add machinery inside super().save()
    # itself, so it isn't available to derive from until after that first
    # save() call - hence the second, field-scoped save() below rather than
    # computing this up front like Panel.academic_year does from its own
    # plain (non-auto_now_add) `date` field.
    academic_year = models.ForeignKey(
        AcademicYear, null=True, blank=True, editable=False, on_delete=models.SET_NULL, related_name='referrals',
    )

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            self.academic_year = AcademicYear.for_date(self.created_at.date())
            super().save(update_fields=['academic_year'])

    def __str__(self):
        return f'{self.get_referral_type_display()} referral #{self.pk} - {self.student}'


class SafeguardingNote(models.Model):
    # A DSL's atomic, one-line safeguarding statement about a student -
    # student-scoped only, no link to any Panel/Referral. Relocated to core
    # and decoupled from hubs.inclusion.panel (see #77-#81) so a second
    # consuming hub can read it without a panel-scoped model in the way.
    # Replaces hubs.inclusion.panel.SafeguardingBriefing. Fully append-only
    # except one narrow in-place mutation (manual retirement, below) - there
    # is no hard delete.
    #
    # "Editing" a note never mutates it - it creates a new active row with
    # `supersedes` pointing at the note it replaces, which auto-retires the
    # predecessor (retired_at/retired_by/retirement_reason='superseded').
    # `supersedes` is unique, so the chain is strictly linear, though
    # unbounded in depth - a note that itself superseded something can later
    # be superseded again.
    RETIREMENT_REASON_SUPERSEDED = 'superseded'
    RETIREMENT_REASON_RESOLVED = 'resolved'
    RETIREMENT_REASON_NO_LONGER_RELEVANT = 'no_longer_relevant'
    RETIREMENT_REASON_ENTERED_IN_ERROR = 'entered_in_error'
    RETIREMENT_REASON_CHOICES = [
        (RETIREMENT_REASON_SUPERSEDED, 'Superseded by a newer note'),
        (RETIREMENT_REASON_RESOLVED, 'Resolved'),
        (RETIREMENT_REASON_NO_LONGER_RELEVANT, 'No longer relevant'),
        (RETIREMENT_REASON_ENTERED_IN_ERROR, 'Entered in error'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='safeguarding_notes')
    author = models.ForeignKey(Staff, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    text = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    supersedes = models.OneToOneField(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='superseded_by',
    )

    # Active note == retired_at is null - no separate status field. Set
    # automatically (supersession, see above) or manually (retirement below,
    # the one field set this model ever mutates in place).
    retired_at = models.DateTimeField(null=True, blank=True)
    retired_by = models.ForeignKey(Staff, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    retirement_reason = models.CharField(max_length=20, choices=RETIREMENT_REASON_CHOICES, blank=True)
    retirement_note = models.TextField(blank=True)

    # Recorded, not surfaced in the UI (#84) - who undid a manual retire()
    # and when, kept for the audit trail alongside retired_at/retired_by
    # rather than overwriting them (reactivate() clears those instead).
    reactivated_at = models.DateTimeField(null=True, blank=True)
    reactivated_by = models.ForeignKey(Staff, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Safeguarding note for {self.student} ({self.created_at:%Y-%m-%d})'

    @classmethod
    def manual_retirement_choices(cls):
        # Every RETIREMENT_REASON_CHOICES entry a caller can pick when
        # retiring manually - excludes 'superseded', which is only ever set
        # automatically by supersede() below, never chosen by a form.
        return [c for c in cls.RETIREMENT_REASON_CHOICES if c[0] != cls.RETIREMENT_REASON_SUPERSEDED]

    def save(self, *args, **kwargs):
        # Single place enforcing the one-line/150-char constraint (#78),
        # rather than every caller remembering to slice before create()/save().
        self.text = self.text[:150]
        super().save(*args, **kwargs)

    def supersede(self, author, text):
        # "Editing" a note - see class docstring. Single owner for this so
        # every caller (Discussion, DSL Briefings) gets the same
        # create-new-row-and-auto-retire-predecessor behaviour.
        new_note = SafeguardingNote.objects.create(student=self.student, author=author, text=text, supersedes=self)
        self.retired_at = timezone.now()
        self.retired_by = author
        self.retirement_reason = self.RETIREMENT_REASON_SUPERSEDED
        self.save(update_fields=['retired_at', 'retired_by', 'retirement_reason'])
        return new_note

    def retire(self, retired_by, reason, retirement_note=''):
        self.retired_at = timezone.now()
        self.retired_by = retired_by
        self.retirement_reason = reason
        self.retirement_note = retirement_note
        self.save(update_fields=['retired_at', 'retired_by', 'retirement_reason', 'retirement_note'])

    def reactivate(self, reactivated_by):
        # Undoes a manual retire() (#84) - moves a note back from Inactive
        # to Active. Deliberately not offered for a supersede()'d note (the
        # UI never surfaces one to reactivate in the first place - see
        # _dsl_briefing_rows's History filter) since its successor already
        # exists; reactivating it would leave two active notes standing in
        # for what was one edit. reactivated_at/reactivated_by are recorded
        # for the audit trail but not shown in the UI - retired_at/
        # retired_by/etc. are cleared rather than overwritten by these, so
        # a later re-retirement doesn't need to remember two prior mutations.
        self.retired_at = None
        self.retired_by = None
        self.retirement_reason = ''
        self.retirement_note = ''
        self.reactivated_at = timezone.now()
        self.reactivated_by = reactivated_by
        self.save(update_fields=[
            'retired_at', 'retired_by', 'retirement_reason', 'retirement_note',
            'reactivated_at', 'reactivated_by',
        ])
