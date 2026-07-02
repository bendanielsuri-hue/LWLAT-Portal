from django.contrib import admin

from .models import CategorySettings, MatSettings, Module, Referral, School, Staff, Student


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


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ('referral_type', 'student', 'status', 'date_referred', 'raised_by')
    list_filter = ('referral_type', 'status')
