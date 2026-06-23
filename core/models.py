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


class School(models.Model):
    CATEGORY_CHOICES = [('Primary', 'Primary'), ('Secondary', 'Secondary')]

    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['category', 'name']

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
    sen_status = models.CharField(max_length=50, blank=True)
    attendance_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    behaviour_summary = models.TextField(blank=True)
    exclusions_count = models.PositiveSmallIntegerField(default=0)
    date_of_arrival = models.DateField(null=True, blank=True)
    year_arrived = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.last_name}, {self.first_name}'
