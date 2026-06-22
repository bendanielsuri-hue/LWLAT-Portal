from django.contrib import admin

from .models import Staff, Student


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ('staff_code', 'last_name', 'first_name', 'job_title', 'department', 'is_active')
    search_fields = ('staff_code', 'last_name', 'first_name', 'email')


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        'upn', 'last_name', 'first_name', 'year_group', 'reg_form', 'form_tutor', 'is_active',
        'is_pp', 'is_eal', 'is_lac', 'is_young_carer', 'sen_status',
    )
    list_filter = ('year_group', 'reg_form', 'is_pp', 'is_eal', 'is_lac', 'is_young_carer')
    search_fields = ('upn', 'last_name', 'first_name')
