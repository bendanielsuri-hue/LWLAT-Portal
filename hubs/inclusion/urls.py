from django.urls import path
from . import views

urlpatterns = [
    path('', views.inclusion_hub, name='inclusion_hub'),
    path('provision-strategies/', views.inclusion_provision_strategies, name='inclusion_provision_strategies'),
    path('diagnosis-tracker/', views.inclusion_diagnosis_tracker, name='inclusion_diagnosis_tracker'),

    path('panel/', views.inclusion_panel_home, name='inclusion_panel'),
    path('panel/students/', views.inclusion_panel_students, name='inclusion_panel_students'),

    path('panel/referrals/', views.inclusion_panel_referrals, name='inclusion_panel_referrals'),
    path('panel/referrals/new/', views.inclusion_panel_referral_new, name='inclusion_panel_referral_new'),
    path('panel/referrals/<int:referral_id>/edit/', views.inclusion_panel_referral_edit, name='inclusion_panel_referral_edit'),
    path('panel/referrals/<int:referral_id>/delete/', views.inclusion_panel_referral_delete, name='inclusion_panel_referral_delete'),
    path('panel/referrals/<int:referral_id>/escalate/', views.inclusion_panel_referral_escalate, name='inclusion_panel_referral_escalate'),
    path('panel/referrals/<int:referral_id>/actions/new/', views.inclusion_panel_action_new, name='inclusion_panel_action_new'),

    path('panel/actions/', views.inclusion_panel_actions, name='inclusion_panel_actions'),
    path('panel/actions/<int:action_id>/status/', views.inclusion_panel_action_set_status, name='inclusion_panel_action_set_status'),
    path('panel/actions/<int:action_id>/edit/', views.inclusion_panel_action_edit, name='inclusion_panel_action_edit'),

    path('panel/escalations/', views.inclusion_panel_escalations, name='inclusion_panel_escalations'),
    path('panel/escalations/<int:escalation_id>/resolve/', views.inclusion_panel_escalation_resolve, name='inclusion_panel_escalation_resolve'),

    path('panel/meetings/', views.inclusion_panel_meetings, name='inclusion_panel_meetings'),
    path('panel/meetings/new/', views.inclusion_panel_meeting_new, name='inclusion_panel_meeting_new'),
    path('panel/meetings/<int:panel_id>/start/', views.inclusion_panel_meeting_start, name='inclusion_panel_meeting_start'),
    path('panel/meetings/<int:panel_id>/delete/', views.inclusion_panel_meeting_delete, name='inclusion_panel_meeting_delete'),
    path('panel/meetings/<int:panel_id>/setup/', views.inclusion_panel_meeting_setup, name='inclusion_panel_meeting_setup'),
    path('panel/meetings/<int:panel_id>/agenda/', views.inclusion_panel_meeting_agenda, name='inclusion_panel_meeting_agenda'),
    path('panel/meetings/discussion/<int:panel_referral_id>/', views.inclusion_panel_discussion, name='inclusion_panel_discussion'),

    path('panel/groups/new/', views.inclusion_panel_group_new, name='inclusion_panel_group_new'),

    path('panel/settings/referral-questions/', views.inclusion_panel_referral_question_settings, name='inclusion_panel_referral_question_settings'),
    path('panel/settings/action-categories/', views.inclusion_panel_action_category_settings, name='inclusion_panel_action_category_settings'),
    path('panel/settings/panel-groups/', views.inclusion_panel_group_settings, name='inclusion_panel_group_settings'),
    path('panel/settings/expertise/', views.inclusion_panel_expertise_settings, name='inclusion_panel_expertise_settings'),
]
