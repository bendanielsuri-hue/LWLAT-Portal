from django.contrib import admin

from .models import (
    Action,
    ActionCategory,
    Escalation,
    Panel,
    PanelGroup,
    PanelGroupMember,
    PanelMember,
    PanelReferral,
    Referral,
    ReferralCategory,
    ReferralQuestion,
    ReferralResponse,
    StudentNote,
)

admin.site.register(ReferralCategory)
admin.site.register(ReferralQuestion)
admin.site.register(Referral)
admin.site.register(ReferralResponse)
admin.site.register(Panel)
admin.site.register(PanelMember)
admin.site.register(PanelReferral)
admin.site.register(ActionCategory)
admin.site.register(Action)
admin.site.register(Escalation)
admin.site.register(PanelGroup)
admin.site.register(PanelGroupMember)
admin.site.register(StudentNote)
