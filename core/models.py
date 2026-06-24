# Dummy Student/Staff models, seeded with fake data over SQLite.
#
# Swapping to the real Azure MIS later:
#   - Point DATABASES (or a second entry + DATABASE_ROUTERS) at the Azure SQL
#     connection holding the MIS data.
#   - Set Meta.managed = False on these models and add db_table/db_column to
#     match the real MIS table/view and column names.
# Field names below are the contract every hub view should code against, so
# none of that needs to ripple out into hubs/*/views.py.

from django.db import models

# Reused by School/MatSettings/CategorySettings as the only colours available for
# the per-school accent override, matching the personal "Primary colour" picker's
# palette in templates/_settings_content.html / [data-color="..."] CSS rules.
ACCENT_COLOUR_CHOICES = [
    ('purple', 'Royal Purple'), ('indigo', 'Midnight Indigo'), ('blue', 'Ocean Blue'),
    ('teal', 'Deep Teal'), ('green', 'Forest Green'), ('yellow', 'Golden Yellow'),
    ('orange', 'Sunset Orange'), ('burnt', 'Burnt Red'), ('red', 'Cherry Red'), ('pink', 'Blossom Pink'),
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

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.last_name}, {self.first_name}'


class Student(models.Model):
    upn = models.CharField(max_length=20, unique=True)  # Unique Pupil Number
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    year_group = models.PositiveSmallIntegerField()
    reg_form = models.CharField(max_length=10, blank=True)
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

    # Broad area of need from the SEND Code of Practice — only meaningful
    # when sen_status is set (K or E).
    SEND_NEED_CHOICES = [
        ('cognition', 'Cognition and Learning'),
        ('semh', 'Social, Emotional and Mental Health'),
        ('communication', 'Communication and Interaction'),
        ('sensory', 'Sensory and/or Physical'),
    ]
    send_need = models.CharField(max_length=20, choices=SEND_NEED_CHOICES, blank=True)
    attendance_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    behaviour_summary = models.TextField(blank=True)
    exclusions_count = models.PositiveSmallIntegerField(default=0)
    date_of_arrival = models.DateField(null=True, blank=True)
    year_arrived = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.last_name}, {self.first_name}'
