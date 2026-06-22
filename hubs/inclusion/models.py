from django.db import models


class ReferralCategory(models.Model):
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class ReferralQuestion(models.Model):
    TYPE_CHOICES = [('text', 'Text'), ('select', 'Dropdown')]

    # Null category = a flat question shown with no category heading. Only the
    # "Concern" category is expected to hold questions going forward.
    category = models.ForeignKey(
        ReferralCategory, null=True, blank=True, on_delete=models.CASCADE, related_name='questions'
    )
    label = models.CharField(max_length=255)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    question_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='text')
    choices = models.CharField(
        max_length=500, blank=True,
        help_text='Comma-separated options, used when type is Dropdown.',
    )

    def choice_list(self):
        return [c.strip() for c in self.choices.split(',') if c.strip()]

    class Meta:
        ordering = ['category__order', 'order']

    def __str__(self):
        return self.label


class Referral(models.Model):
    STATUS_CHOICES = [('open', 'Open'), ('in_panel', 'In Panel'), ('closed', 'Closed')]

    student = models.ForeignKey('core.Student', on_delete=models.CASCADE, related_name='referrals')
    raised_by = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Referral #{self.pk} - {self.student}'


class ReferralResponse(models.Model):
    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name='responses')
    question = models.ForeignKey(ReferralQuestion, on_delete=models.PROTECT)
    answer = models.TextField(blank=True)

    def __str__(self):
        return f'{self.question}: {self.answer[:30]}'


class StudentNote(models.Model):
    student = models.ForeignKey('core.Student', on_delete=models.CASCADE, related_name='notes')
    author = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Note on {self.student} ({self.created_at:%Y-%m-%d})'


class Expertise(models.Model):
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class PanelGroup(models.Model):
    name = models.CharField(max_length=100)
    school = models.ForeignKey(
        'core.School', null=True, blank=True, on_delete=models.SET_NULL, related_name='panel_groups'
    )
    default_chair = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class PanelGroupMember(models.Model):
    panel_group = models.ForeignKey(PanelGroup, on_delete=models.CASCADE, related_name='members')
    staff = models.ForeignKey('core.Staff', on_delete=models.CASCADE)
    expertise = models.ForeignKey(Expertise, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        unique_together = [('panel_group', 'staff')]

    def __str__(self):
        return f'{self.staff} in {self.panel_group}'


class Panel(models.Model):
    STATUS_CHOICES = [('upcoming', 'Upcoming'), ('complete', 'Complete')]

    date = models.DateField()
    time = models.TimeField(null=True, blank=True)
    chair = models.ForeignKey('core.Staff', null=True, blank=True, related_name='chaired_panels', on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='upcoming')
    panel_group = models.ForeignKey(PanelGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name='panels')
    started_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f'Panel {self.date}'


class PanelMember(models.Model):
    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='members')
    staff = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.CASCADE)
    guest_name = models.CharField(max_length=150, blank=True)
    expertise = models.ForeignKey(Expertise, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    attended = models.BooleanField(default=True)

    class Meta:
        unique_together = [('panel', 'staff')]

    def __str__(self):
        return str(self.staff) if self.staff_id else (self.guest_name or 'Guest')


class PanelReferral(models.Model):
    DISCUSSION_CHOICES = [('pending', 'Pending'), ('discussed', 'Discussed')]
    FOLLOW_UP_CHOICES = [('incomplete', 'Incomplete'), ('complete', 'Complete')]
    PRIORITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]

    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='panel_referrals')
    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name='panel_referrals')
    discussion_status = models.CharField(max_length=20, choices=DISCUSSION_CHOICES, default='pending')
    duration = models.DurationField(null=True, blank=True)
    notes = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_status = models.CharField(max_length=20, choices=FOLLOW_UP_CHOICES, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    discussion_started_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by = models.ForeignKey(
        'core.Staff', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        unique_together = [('panel', 'referral')]

    def __str__(self):
        return f'{self.referral} on {self.panel}'


class ActionCategory(models.Model):
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # Matched against Staff.job_title to auto-suggest an assignee, e.g. "SENDCo".
    auto_assign_job_title = models.CharField(max_length=100, blank=True)
    # Sensitive categories (e.g. safeguarding) are hidden from staff who aren't
    # in a PanelGroup, see _is_panel_staff() in views.py.
    is_sensitive = models.BooleanField(default=False)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name

    def resolve_auto_assignee(self):
        if not self.auto_assign_job_title:
            return None
        from core.models import Staff
        matches = list(Staff.objects.filter(job_title=self.auto_assign_job_title, is_active=True)[:2])
        return matches[0] if len(matches) == 1 else None


class Action(models.Model):
    STATUS_CHOICES = [
        ('incomplete', 'Incomplete'),
        ('complete', 'Complete'),
        ('not_needed', 'Inactive'),
    ]

    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name='actions')
    category = models.ForeignKey(ActionCategory, null=True, blank=True, on_delete=models.SET_NULL)
    assigned_to = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='incomplete')
    note = models.TextField(blank=True)

    class Meta:
        ordering = ['due_date']

    def __str__(self):
        return f'Action #{self.pk} - {self.referral}'


class Escalation(models.Model):
    STATUS_CHOICES = [('open', 'Open'), ('resolved', 'Resolved')]

    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name='escalations')
    escalated_by = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    escalated_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-escalated_at']

    def __str__(self):
        return f'Escalation #{self.pk} - {self.referral}'
