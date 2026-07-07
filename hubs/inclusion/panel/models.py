from django.db import models
from django.db.models import Q


class ReferralCategory(models.Model):
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'name']
        db_table = 'inclusion_referralcategory'

    def __str__(self):
        return self.name


class ReferralQuestion(models.Model):
    TYPE_CHOICES = [('text', 'Text'), ('select', 'Dropdown')]

    # Null category = a flat question shown with no category heading.
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
        db_table = 'inclusion_referralquestion'

    def __str__(self):
        return self.label


class InclusionReferral(models.Model):
    STATUS_CHOICES = [('open', 'Open'), ('in_panel', 'In Panel'), ('closed', 'Closed')]

    # Links this Inclusion-specific detail row to the shared cross-type base record.
    referral = models.OneToOneField(
        'core.Referral', on_delete=models.CASCADE, related_name='inclusion_detail',
    )
    student = models.ForeignKey('core.Student', on_delete=models.CASCADE, related_name='referrals')
    raised_by = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'inclusion_referral'

    def __str__(self):
        return f'Referral #{self.pk} - {self.student}'


class ReferralResponse(models.Model):
    referral = models.ForeignKey(InclusionReferral, on_delete=models.CASCADE, related_name='responses')
    question = models.ForeignKey(ReferralQuestion, on_delete=models.PROTECT)
    answer = models.TextField(blank=True)

    class Meta:
        db_table = 'inclusion_referralresponse'

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
        db_table = 'inclusion_studentnote'

    def __str__(self):
        return f'Note on {self.student} ({self.created_at:%Y-%m-%d})'


class ExpertiseQuerySet(models.QuerySet):
    def visible_for_school(self, school_id):
        return self.filter(is_active=True).filter(Q(school__isnull=True) | Q(school_id=school_id))


class Expertise(models.Model):
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # Null = shared across every school. Set = a custom tag only that school can use/see.
    school = models.ForeignKey(
        'core.School', null=True, blank=True, on_delete=models.CASCADE, related_name='expertise_tags'
    )

    objects = ExpertiseQuerySet.as_manager()

    class Meta:
        ordering = ['order', 'name']
        db_table = 'inclusion_expertise'

    def __str__(self):
        return self.name


class ExternalContact(models.Model):
    name = models.CharField(max_length=150)
    job_title = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        db_table = 'inclusion_externalcontact'

    def __str__(self):
        return self.name


class PanelGroup(models.Model):
    name = models.CharField(max_length=100)
    school = models.ForeignKey(
        'core.School', null=True, blank=True, on_delete=models.SET_NULL, related_name='panel_groups'
    )
    default_chair = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'inclusion_panelgroup'

    def __str__(self):
        return self.name


class PanelGroupMember(models.Model):
    panel_group = models.ForeignKey(PanelGroup, on_delete=models.CASCADE, related_name='members')
    # Null when this is an external (non-Staff) member — see external_contact. Mirrors
    # the same staff/external_contact split already used on PanelMember.
    staff = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.CASCADE)
    external_contact = models.ForeignKey(
        ExternalContact, null=True, blank=True, on_delete=models.CASCADE, related_name='+'
    )
    expertise = models.ForeignKey(Expertise, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('panel_group', 'staff'), ('panel_group', 'external_contact')]
        db_table = 'inclusion_panelgroupmember'

    def __str__(self):
        return f'{self.staff if self.staff_id else (self.external_contact or "Guest")} in {self.panel_group}'


class Panel(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('ready', 'Ready'),
        ('running', 'Running'),
        ('delayed', 'Delayed'),
        ('complete', 'Complete'),
    ]

    date = models.DateField()
    time = models.TimeField(null=True, blank=True)
    chair = models.ForeignKey('core.Staff', null=True, blank=True, related_name='chaired_panels', on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    panel_group = models.ForeignKey(PanelGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name='panels')
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['date']
        db_table = 'inclusion_panel'

    def __str__(self):
        return f'Panel {self.date}'


class PanelMember(models.Model):
    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='members')
    staff = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.CASCADE)
    external_contact = models.ForeignKey(
        ExternalContact, null=True, blank=True, on_delete=models.CASCADE, related_name='+'
    )
    expertise = models.ForeignKey(Expertise, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    attended = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('panel', 'staff'), ('panel', 'external_contact')]
        db_table = 'inclusion_panelmember'

    def __str__(self):
        return str(self.staff) if self.staff_id else str(self.external_contact or 'Guest')


class PanelReferral(models.Model):
    DISCUSSION_CHOICES = [('pending', 'Pending'), ('discussed', 'Discussed')]
    FOLLOW_UP_CHOICES = [('incomplete', 'Incomplete'), ('complete', 'Complete')]
    PRIORITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]

    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='panel_referrals')
    referral = models.ForeignKey(InclusionReferral, on_delete=models.CASCADE, related_name='panel_referrals')
    # Nullable rather than a strict auto_now_add default so existing rows (created before
    # this field existed) don't need a fabricated backfill value — they simply won't
    # surface in the "assigned to panel" activity feed, see _recent_activity() in views.py.
    created_at = models.DateTimeField(null=True, blank=True, auto_now_add=True)
    discussion_status = models.CharField(max_length=20, choices=DISCUSSION_CHOICES, default='pending')
    duration = models.DurationField(null=True, blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_status = models.CharField(max_length=20, choices=FOLLOW_UP_CHOICES, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    # Manual agenda position, independent of `priority` — set by drag-and-drop on the
    # Panel Setup / Meeting Agenda pages. New rows get the next value (see
    # _next_agenda_order in views.py) so they land at the end of the list by default.
    agenda_order = models.PositiveIntegerField(default=0)
    discussion_started_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by = models.ForeignKey(
        'core.Staff', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        unique_together = [('panel', 'referral')]
        db_table = 'inclusion_panelreferral'

    def __str__(self):
        return f'{self.referral} on {self.panel}'


class PanelReferralNote(models.Model):
    # Add-only thread (no edit) so concurrent panel members adding notes to the
    # same discussion can never silently overwrite each other's text.
    panel_referral = models.ForeignKey(PanelReferral, on_delete=models.CASCADE, related_name='notes')
    author = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'inclusion_panelreferralnote'

    def __str__(self):
        return f'Note on {self.panel_referral} ({self.created_at:%Y-%m-%d})'


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
        db_table = 'inclusion_actioncategory'

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
        ('not_needed', 'Not Required'),
    ]

    referral = models.ForeignKey(InclusionReferral, on_delete=models.CASCADE, related_name='actions')
    category = models.ForeignKey(ActionCategory, null=True, blank=True, on_delete=models.SET_NULL)
    assigned_to = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='incomplete')
    completed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ['due_date']
        db_table = 'inclusion_action'

    def __str__(self):
        return f'Action #{self.pk} - {self.referral}'


class Escalation(models.Model):
    STATUS_CHOICES = [('open', 'Open'), ('resolved', 'Resolved')]

    referral = models.ForeignKey(InclusionReferral, on_delete=models.CASCADE, related_name='escalations')
    escalated_by = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    escalated_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-escalated_at']
        db_table = 'inclusion_escalation'

    def __str__(self):
        return f'Escalation #{self.pk} - {self.referral}'
