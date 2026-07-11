from django.contrib import admin

from .models import (
    Action,
    ActionCategory,
    Escalation,
    Expertise,
    ExternalContact,
    InclusionReferral,
    Panel,
    PanelMember,
    PanelReferral,
    PanelReferralNote,
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
    StudentNote,
)

admin.site.register(ReferralCategory)
admin.site.register(ReferralQuestion)
admin.site.register(InclusionReferral)
admin.site.register(ReferralResponse)
admin.site.register(Panel)
admin.site.register(PanelMember)
admin.site.register(PanelReferral)
admin.site.register(PanelReferralNote)
admin.site.register(ActionCategory)
admin.site.register(Action)
admin.site.register(Escalation)
admin.site.register(StudentNote)
admin.site.register(Expertise)
admin.site.register(ExternalContact)
