from django.db import models
from django.db.models import Q
from django.utils import timezone

from core.models import AcademicYear


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
    # 'assigned'/'discussing' mean it's genuinely on a panel's live agenda
    # right now (pending or actively being discussed) - same words as
    # _panel_referral_stage's per-meeting stage_key, deliberately, so the
    # same real-world moment reads identically everywhere. The other three
    # cover a referral that's been discussed before and has a follow-up
    # due but isn't on any current agenda (the Reviews Due queue), tiered
    # by how close that follow-up date is: 'review_scheduled' (more than a
    # week away), 'awaiting_review' (within a week either side of it), or
    # 'overdue_review' (more than a week past it). See _sync_referral_status.
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('review_scheduled', 'Review Scheduled'),
        ('awaiting_review', 'Awaiting Review'),
        ('overdue_review', 'Overdue Review'),
        ('assigned', 'Assigned to Panel'),
        ('discussing', 'Discussing'),
        ('closed', 'Closed'),
    ]
    PRIORITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]

    # Links this Inclusion-specific detail row to the shared cross-type base record.
    referral = models.OneToOneField(
        'core.Referral', on_delete=models.CASCADE, related_name='inclusion_detail',
    )
    student = models.ForeignKey('core.Student', on_delete=models.CASCADE, related_name='referrals')
    raised_by = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    # Blank (not defaulted to 'medium') so a fresh referral reads as "not yet
    # triaged" rather than silently claiming a priority nobody chose. Lives
    # here (not on PanelReferral) so it's set once, before a referral is ever
    # added to a panel's agenda, and carries over automatically afterward.
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'inclusion_referral'

    def __str__(self):
        return f'Referral #{self.pk} - {self.student}'

    @classmethod
    def create_for(cls, student, raised_by, date_referred=None, status='open'):
        # Single owner of the "CoreReferral.raised_by must match
        # InclusionReferral.raised_by" invariant - both the live referral-new
        # view and the demo-data seed scripts go through this instead of
        # each re-deriving the dual write independently.
        from core.models import Referral as CoreReferral

        base = CoreReferral.objects.create(
            referral_type=CoreReferral.TYPE_INCLUSION,
            student=student,
            raised_by=raised_by,
            date_referred=date_referred or timezone.localdate(),
            status=CoreReferral.STATUS_CLOSED if status == 'closed' else CoreReferral.STATUS_OPEN,
        )
        return cls.objects.create(referral=base, student=student, raised_by=raised_by, status=status)

    def set_raised_by(self, staff):
        # Same invariant as create_for, for the repair/backfill path where the
        # rows already exist (see seed_helpers.backfill_raised_by).
        self.raised_by = staff
        self.save(update_fields=['raised_by'])
        self.referral.raised_by = staff
        self.referral.save(update_fields=['raised_by'])


class ReferralResponse(models.Model):
    referral = models.ForeignKey(InclusionReferral, on_delete=models.CASCADE, related_name='responses')
    question = models.ForeignKey(ReferralQuestion, on_delete=models.PROTECT)
    answer = models.TextField(blank=True)

    class Meta:
        db_table = 'inclusion_referralresponse'

    def __str__(self):
        return f'{self.question}: {self.answer[:30]}'


class SafeguardingBriefing(models.Model):
    # A DSL's pre-meeting safeguarding summary for a student - deliberately
    # tied to the student (not a specific InclusionReferral), since a
    # student's safeguarding context spans whichever referral happens to be
    # on today's agenda. `panel` records which meeting it was prepared for
    # (optional - a briefing could in principle be written outside that
    # workflow), and drives Discussion's auto-pop modal: it only fires for a
    # briefing whose `panel` matches the meeting actually being discussed,
    # never a stale one from an unrelated past meeting (see #52 grilling).
    # Append-only by design, same convention as PanelReferralNote - a new
    # circumstance gets a fresh entry, never a silent edit to an existing
    # one, so the record stays auditable. Replaces the old StudentNote
    # (edit-in-place, no meeting link), which this app never actually used
    # again after DSL Notes was pulled from discussion.html pending this
    # redesign.
    # Narrow exception (#71/#74): a row still scoped to a panel that hasn't
    # happened yet (panel.status != 'complete') can be edited/deleted from
    # the Safeguarding Briefings screen - it's still being drafted, not yet
    # a historical record. Once that panel completes, the row is fixed like
    # any other - see inclusion_panel_dsl_briefing_notes in views.py.
    student = models.ForeignKey('core.Student', on_delete=models.CASCADE, related_name='safeguarding_briefings')
    author = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL)
    panel = models.ForeignKey(
        'Panel', null=True, blank=True, on_delete=models.SET_NULL, related_name='safeguarding_briefings',
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'inclusion_safeguardingbriefing'

    def __str__(self):
        return f'Safeguarding briefing for {self.student} ({self.created_at:%Y-%m-%d})'


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
    is_active = models.BooleanField(default=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

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
    # When True, `chair` is ignored and the effective chair is always
    # whatever the Panel Group's default_chair currently is (see
    # effective_chair/effective_chair_id below) - lets a draft/ready panel
    # keep tracking the group's default chair even if it's changed after
    # this panel was created, instead of freezing a snapshot at create time.
    # Never True on a 'complete' panel - see end_panel_meeting in views.py,
    # which freezes the resolved chair into `chair` and clears this flag so
    # a finished meeting's chair is a historical record like everything
    # else about its attendance.
    chair_follows_default = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    panel_group = models.ForeignKey(PanelGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name='panels')
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    # Set by _sync_stale_running_panels (views.py) when a running meeting is
    # force-completed for running 2x past this group's typical duration with
    # no End Panel Meeting click - an abandoned meeting's elapsed time is an
    # outlier, not a real data point about how long this group's meetings
    # normally run, so _group_typical_duration excludes any panel with this
    # set from its average. Never set by a manual End Panel Meeting.
    auto_ended = models.BooleanField(default=False)
    # Auto-derived from `date` on every save, not user-editable - so a
    # rescheduled panel (see update_details) always reflects its current
    # date, unlike Referral/Action below whose derivation date is an
    # auto_now_add timestamp that never changes after creation.
    academic_year = models.ForeignKey(
        AcademicYear, null=True, blank=True, editable=False, on_delete=models.SET_NULL, related_name='panels',
    )

    class Meta:
        ordering = ['date']
        db_table = 'inclusion_panel'

    def save(self, *args, **kwargs):
        self.academic_year = AcademicYear.for_date(self.date)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Panel {self.date}'

    @property
    def effective_chair_id(self):
        if self.chair_follows_default and self.panel_group_id:
            return self.panel_group.default_chair_id
        return self.chair_id

    @property
    def effective_chair(self):
        if self.chair_follows_default and self.panel_group_id:
            return self.panel_group.default_chair
        return self.chair

    def update_details(self, date=None, time=None, chair_id=None, panel_group_id=None):
        # Owns the "Panel Agenda Setup -> Details tab" save rule: a rescheduled
        # date is only ever moved forward (never into the past). Chair itself
        # is untouched here - chair_id is passed back in as whatever it
        # already was, since Chair (including whether it's following the
        # group's default) is edited on its own, separately, via update_chair.
        # Single place both the view and any future caller (tests, admin
        # actions) can trigger this without going through a request.
        if date is not None and date >= timezone.localdate():
            self.date = date
        self.time = time
        self.chair_id = chair_id
        self.panel_group_id = panel_group_id
        self.save()


class PanelMember(models.Model):
    # Per-meeting attendance only - who actually checked into *this* Panel,
    # and when they left. Not a roster: identity (staff/external_contact),
    # expertise, and active/inactive state all live on the referenced
    # PanelGroupMember, which is also what every "who's on this panel" query
    # reads for draft/running panels (see inclusion_panel_meeting_setup and
    # inclusion_panel_meeting_agenda). A completed panel's attendance is the
    # one place these diverge on purpose - it's a frozen record of who was
    # actually present, independent of later changes to the group's roster.
    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='members')
    panel_group_member = models.ForeignKey(PanelGroupMember, on_delete=models.CASCADE, related_name='+')
    checked_in_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('panel', 'panel_group_member')]
        db_table = 'inclusion_panelmember'

    def __str__(self):
        return str(self.panel_group_member)


class PanelReferral(models.Model):
    # 'deferred' - the meeting ended (manually or via _sync_stale_running_panels'
    # auto-end) while this referral was still 'pending'. The row is kept, not
    # removed, so this panel's own history still shows it was queued but not
    # reached - see _sync_referral_status/_panel_referral_stage in views.py,
    # which both treat 'deferred' as non-blocking so the referral becomes
    # pickable again for a future panel without needing removed_at.
    DISCUSSION_CHOICES = [('pending', 'Pending'), ('discussed', 'Discussed'), ('deferred', 'Deferred')]
    FOLLOW_UP_CHOICES = [('incomplete', 'Incomplete'), ('complete', 'Complete')]

    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='panel_referrals')
    referral = models.ForeignKey(InclusionReferral, on_delete=models.CASCADE, related_name='panel_referrals')
    # Nullable rather than a strict auto_now_add default so existing rows (created before
    # this field existed) don't need a fabricated backfill value — they simply won't
    # surface in the "assigned to panel" activity feed, see _recent_activity() in views.py.
    created_at = models.DateTimeField(null=True, blank=True, auto_now_add=True)
    discussion_status = models.CharField(max_length=20, choices=DISCUSSION_CHOICES, default='pending')
    duration = models.DurationField(null=True, blank=True)
    # Set by _sync_stale_discussion_timers (views.py) when this discussion's
    # timer is auto-stopped for going 30 minutes with no note/action against
    # it - duration is computed up to the last real activity, not the moment
    # the lazy check happened to run, so this flags that the stop point (and
    # therefore the counted duration) is an estimate, not a genuine End
    # Discussion click. Reset to False whenever a fresh discussion_started_at
    # begins (see start_discussion), so it only ever describes the most
    # recent segment, not a stale flag from an earlier one.
    discussion_auto_stopped = models.BooleanField(default=False)
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_status = models.CharField(max_length=20, choices=FOLLOW_UP_CHOICES, blank=True)
    # Manual agenda position — set by drag-and-drop on the
    # Panel Agenda Setup / Meeting Agenda pages. New rows get the next value (see
    # _next_agenda_order in views.py) so they land at the end of the list by default.
    agenda_order = models.PositiveIntegerField(default=0)
    discussion_started_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by = models.ForeignKey(
        'core.Staff', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    # Set by a DSL on the Safeguarding Briefings screen (#71/#74) once this
    # student's briefing for this specific panel is complete - lives here
    # (not on SafeguardingBriefing) because readiness is a per-(student,
    # panel) fact, exactly PanelReferral's own identity, not a property of
    # any one note in the thread. No downstream consumer reads it yet
    # (e.g. Panel Agenda has no "briefing ready" indicator - out of scope,
    # see #71) - it's surfaced only on the Safeguarding Briefings screen
    # itself for now.
    briefing_ready = models.BooleanField(default=False)

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
        ordering = ['created_at']
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
    # Either assigned_to (an individual) or assigned_to_group (a
    # core.StaffGroup - "SENCo Team", "Head of Year 9", etc.), exactly one
    # set at a time - same either/or FK pattern as PanelGroupMember's own
    # staff/external_contact split. assigned_to itself is not renamed to
    # assigned_to_staff yet - that's a wider rename across every existing
    # caller (Actions list, action_form.html, seed_referral_actions, ...),
    # deferred until the Panel Discussion Actions row redesign this supports
    # is actually confirmed (see /prototype, ?variant=b).
    assigned_to_group = models.ForeignKey(
        'core.StaffGroup', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='incomplete')
    completed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    # Who raised the action - the discussion's chair when raised from a live
    # discussion, or whoever used the standalone "New Action" form otherwise.
    # null=True since actions created before this field existed have no
    # value to backfill with confidence (see seed_referral_actions).
    created_by = models.ForeignKey('core.Staff', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    # Provenance only - the action stays a referral-level checklist item (not
    # reset/fragmented per meeting) even for a referral discussed at several
    # panels over time. Null when created outside a live discussion (e.g. the
    # standalone Actions page), where there's no discussion to attribute it to.
    origin_panel_referral = models.ForeignKey(
        'PanelReferral', null=True, blank=True, on_delete=models.SET_NULL, related_name='raised_actions',
    )
    # Auto-derived from created_at, not user-editable - see save(). Stays
    # null for the same pre-existing rows created_at itself can't be
    # backfilled for (see created_at's own comment above).
    academic_year = models.ForeignKey(
        AcademicYear, null=True, blank=True, editable=False, on_delete=models.SET_NULL, related_name='actions',
    )

    class Meta:
        ordering = ['due_date']
        db_table = 'inclusion_action'

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new and self.created_at:
            self.academic_year = AcademicYear.for_date(self.created_at.date())
            super().save(update_fields=['academic_year'])

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
