from django.urls import path
from . import views

urlpatterns = [
    path('', views.inclusion_panel_home, name='inclusion_panel'),
    path('search/', views.inclusion_panel_search, name='inclusion_panel_search'),
    path('students/', views.inclusion_panel_students, name='inclusion_panel_students'),

    path('referrals/', views.inclusion_panel_referrals, name='inclusion_panel_referrals'),
    path('referrals/new/', views.inclusion_panel_referral_new, name='inclusion_panel_referral_new'),
    path('referrals/<int:referral_id>/edit/', views.inclusion_panel_referral_edit, name='inclusion_panel_referral_edit'),
    path('referrals/<int:referral_id>/delete/', views.inclusion_panel_referral_delete, name='inclusion_panel_referral_delete'),
    path('referrals/<int:referral_id>/escalate/', views.inclusion_panel_referral_escalate, name='inclusion_panel_referral_escalate'),
    path('referrals/<int:referral_id>/actions/new/', views.inclusion_panel_action_new, name='inclusion_panel_action_new'),
    path('referrals/<int:referral_id>/actions/status/', views.inclusion_panel_action_status_update, name='inclusion_panel_action_status_update'),

    path('actions/', views.inclusion_panel_actions, name='inclusion_panel_actions'),
    path('actions/<int:action_id>/status/', views.inclusion_panel_action_set_status, name='inclusion_panel_action_set_status'),
    path('actions/<int:action_id>/edit/', views.inclusion_panel_action_edit, name='inclusion_panel_action_edit'),
    path('actions/<int:action_id>/inline-update/', views.inclusion_panel_action_inline_update, name='inclusion_panel_action_inline_update'),

    path('escalations/', views.inclusion_panel_escalations, name='inclusion_panel_escalations'),
    path('escalations/<int:escalation_id>/resolve/', views.inclusion_panel_escalation_resolve, name='inclusion_panel_escalation_resolve'),

    path('meetings/', views.inclusion_panel_meetings, name='inclusion_panel_meetings'),
    path('meetings/new/', views.inclusion_panel_meeting_new, name='inclusion_panel_meeting_new'),
    path('meetings/<int:panel_id>/edit-details/', views.inclusion_panel_meeting_new, name='inclusion_panel_meeting_edit_details'),
    path('meetings/<int:panel_id>/start/', views.inclusion_panel_meeting_start, name='inclusion_panel_meeting_start'),
    path('meetings/<int:panel_id>/delete/', views.inclusion_panel_meeting_delete, name='inclusion_panel_meeting_delete'),
    path('meetings/<int:panel_id>/setup/', views.inclusion_panel_meeting_setup, name='inclusion_panel_meeting_setup'),
    path('meetings/<int:panel_id>/agenda/', views.inclusion_panel_meeting_agenda, name='inclusion_panel_meeting_agenda'),
    path('meetings/discussion/<int:panel_referral_id>/', views.inclusion_panel_discussion, name='inclusion_panel_discussion'),
    path('panel-referral/<int:panel_referral_id>/discussion-summary/', views.inclusion_panel_discussion_summary, name='inclusion_panel_discussion_summary'),

    path('groups/new/', views.inclusion_panel_group_edit, name='inclusion_panel_group_new'),
    path('groups/<int:group_id>/edit/', views.inclusion_panel_group_edit, name='inclusion_panel_group_edit'),

    path('settings/referral-questions/', views.inclusion_panel_referral_question_settings, name='inclusion_panel_referral_question_settings'),
    path('settings/action-categories/', views.inclusion_panel_action_category_settings, name='inclusion_panel_action_category_settings'),
    path('settings/panel-groups/', views.inclusion_panel_group_settings, name='inclusion_panel_group_settings'),
    path('settings/expertise/', views.inclusion_panel_expertise_settings, name='inclusion_panel_expertise_settings'),
    path('settings/expertise/quick-add/', views.inclusion_panel_expertise_quick_add, name='inclusion_panel_expertise_quick_add'),
    path('external-contacts/quick-add/', views.inclusion_panel_external_contact_quick_add, name='inclusion_panel_external_contact_quick_add'),

    path('briefings/', views.inclusion_panel_dsl_briefings, name='inclusion_panel_dsl_briefings'),
    path('briefings/<int:panel_referral_id>/notes/', views.inclusion_panel_dsl_briefing_notes, name='inclusion_panel_dsl_briefing_notes'),
]
