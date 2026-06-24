from django.core.management.base import BaseCommand

from core.models import Module

# (key, name, parent_key, status) — no school dependency, can run any time/order.
# 'live' marks the only hubs/pages with real functionality today per CLAUDE.md;
# everything else defaults to 'hidden' until it's actually ready to release.
MODULES = [
    ('staff_hub', 'Staff', None, Module.STATUS_HIDDEN),
    ('staff_dashboard', 'Staff Dashboard', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_reports', 'Staff Reports', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_my_timetable', 'My Timetable', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_directory', 'Staff Directory', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_absence_request', 'Absence Request', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_payslips', 'Payslips', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_cpd_training', 'CPD & Training', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_calendar', 'Staff Calendar', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_assessment_calendar', 'Assessment Calendar', 'staff_hub', Module.STATUS_HIDDEN),
    ('staff_school_map', 'School Map', 'staff_hub', Module.STATUS_HIDDEN),

    ('student_hub', 'Student', None, Module.STATUS_HIDDEN),
    ('student_dashboard', 'Student Dashboard', 'student_hub', Module.STATUS_HIDDEN),
    ('student_profile', 'Student Profile', 'student_hub', Module.STATUS_HIDDEN),
    ('student_progress_tracker', 'Progress Tracker', 'student_hub', Module.STATUS_HIDDEN),
    ('student_standards_equipment', 'Standards & Equipment', 'student_hub', Module.STATUS_HIDDEN),
    ('student_pastoral_tracker', 'Pastoral Tracker', 'student_hub', Module.STATUS_HIDDEN),

    ('services', 'Operations', None, Module.STATUS_HIDDEN),
    ('service_cover_manager', 'Cover Manager', 'services', Module.STATUS_HIDDEN),
    ('service_duty_rota', 'Duty & Rota Manager', 'services', Module.STATUS_HIDDEN),
    ('service_assembly_manager', 'Assembly Manager', 'services', Module.STATUS_HIDDEN),
    ('service_admissions', 'Admissions', 'services', Module.STATUS_HIDDEN),
    ('service_events_planner', 'Events Planner', 'services', Module.STATUS_HIDDEN),
    ('service_operations_dashboard', 'Operations Overview', 'services', Module.STATUS_HIDDEN),
    ('service_exams_dashboard', 'Exams', 'services', Module.STATUS_HIDDEN),

    ('registers', 'Registers', None, Module.STATUS_HIDDEN),
    ('register_clubs', 'Clubs', 'registers', Module.STATUS_HIDDEN),
    ('register_isolation_room', 'Isolation Room', 'registers', Module.STATUS_HIDDEN),
    ('register_reset_room', 'Reset Room', 'registers', Module.STATUS_HIDDEN),
    ('register_interventions', 'Interventions', 'registers', Module.STATUS_HIDDEN),

    ('inclusion_hub', 'SEND & Provision', None, Module.STATUS_LIVE),
    ('inclusion_provision_strategies', 'Provision & Strategies', 'inclusion_hub', Module.STATUS_HIDDEN),
    ('inclusion_panel', 'Inclusion Panel', 'inclusion_hub', Module.STATUS_LIVE),
    ('inclusion_diagnosis_tracker', 'SEND Diagnosis Tracker', 'inclusion_hub', Module.STATUS_HIDDEN),

    ('careers_hub', 'Careers', None, Module.STATUS_HIDDEN),

    ('resources_hub', 'Resources', None, Module.STATUS_HIDDEN),
    ('resource_asset_register', 'Asset Register', 'resources_hub', Module.STATUS_HIDDEN),
    ('resource_room_bookings', 'Room Bookings', 'resources_hub', Module.STATUS_HIDDEN),
]


class Command(BaseCommand):
    help = 'Seeds the Module rollout-status table (hub-level + leaf-level rows). Idempotent.'

    def handle(self, *args, **options):
        by_key = {}
        created_count = 0
        updated_count = 0

        # Two passes: hubs first (so leaf rows can resolve their parent by key),
        # in the order MODULES is already written (hubs before their leaves).
        for order, (key, name, parent_key, status) in enumerate(MODULES):
            parent = by_key.get(parent_key) if parent_key else None
            module, created = Module.objects.get_or_create(
                key=key,
                defaults={'name': name, 'parent': parent, 'status': status, 'order': order},
            )
            by_key[key] = module
            if created:
                created_count += 1
            elif module.name != name or module.parent_id != (parent.id if parent else None):
                # Keep the display name/hierarchy in sync on rerun, but never touch
                # status/pilot_schools — those are an admin's deliberate decision.
                module.name = name
                module.parent = parent
                module.save(update_fields=['name', 'parent'])
                updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Modules: {created_count} created, {updated_count} updated, '
            f'{len(MODULES) - created_count - updated_count} unchanged.'
        ))
