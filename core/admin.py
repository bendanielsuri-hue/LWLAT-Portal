from django.contrib import admin

from .models import (
    AcademicYear, AttendanceDay, BehaviourIncident, CategorySettings, Exclusion, MatSettings, Module, Referral,
    School, Staff, StaffGroup, StaffGroupMember, Student, Term,
)


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = (
        'staff_code', 'last_name', 'first_name', 'job_title', 'department', 'is_active',
        'is_mat_staff', 'is_developer',
    )
    search_fields = ('staff_code', 'last_name', 'first_name', 'email')


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'is_active', 'student_term', 'staff_term', 'accent_colour')
    list_filter = ('category', 'is_active')
    search_fields = ('name',)


@admin.register(MatSettings)
class MatSettingsAdmin(admin.ModelAdmin):
    list_display = ('portal_title', 'student_term', 'staff_term', 'accent_colour')


@admin.register(CategorySettings)
class CategorySettingsAdmin(admin.ModelAdmin):
    list_display = ('category', 'portal_title', 'student_term', 'staff_term', 'accent_colour')


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('name', 'key', 'parent', 'status', 'order')
    list_filter = ('status', 'parent')
    filter_horizontal = ('pilot_schools',)
    search_fields = ('key', 'name')


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        'upn', 'last_name', 'first_name', 'year_group', 'reg_form', 'form_tutor', 'is_active',
        'is_pp', 'is_eal', 'is_lac', 'is_young_carer', 'sen_status',
    )
    list_filter = ('year_group', 'reg_form', 'is_pp', 'is_eal', 'is_lac', 'is_young_carer')
    search_fields = ('upn', 'last_name', 'first_name')


@admin.register(AttendanceDay)
class AttendanceDayAdmin(admin.ModelAdmin):
    list_display = ('student', 'date', 'am_status', 'pm_status')
    list_filter = ('am_status', 'pm_status')
    search_fields = ('student__last_name', 'student__first_name', 'student__upn')


@admin.register(BehaviourIncident)
class BehaviourIncidentAdmin(admin.ModelAdmin):
    list_display = ('student', 'date', 'category', 'severity', 'logged_by')
    list_filter = ('category', 'severity')
    search_fields = ('student__last_name', 'student__first_name', 'student__upn')


@admin.register(Exclusion)
class ExclusionAdmin(admin.ModelAdmin):
    list_display = ('student', 'start_date', 'end_date', 'type')
    list_filter = ('type',)
    search_fields = ('student__last_name', 'student__first_name', 'student__upn')


class StaffGroupMemberInline(admin.TabularInline):
    model = StaffGroupMember
    extra = 1


@admin.register(StaffGroup)
class StaffGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'year_group', 'is_active')
    list_filter = ('school', 'year_group', 'is_active')
    search_fields = ('name',)
    inlines = [StaffGroupMemberInline]


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ('referral_type', 'student', 'status', 'date_referred', 'raised_by')
    list_filter = ('referral_type', 'status')


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('label', 'start_date', 'end_date')


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ('name', 'academic_year', 'school', 'start_date', 'end_date', 'half_term_start', 'half_term_end')
    list_filter = ('name', 'academic_year', 'school')
