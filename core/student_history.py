# Derived views over AttendanceDay/BehaviourIncident/Exclusion - the "never
# stored" half of docs/adr/0007-student-history-tables-not-summary-fields.md.
# Every percentage/summary/count shown anywhere in the app comes from one of
# these, never a field on Student directly.


def attendance_percentage(student):
    """Percentage of AM+PM sessions marked 'present' across every recorded
    AttendanceDay. None (not 0) when no attendance has been recorded yet, so
    callers can render "—" instead of a misleading 0%."""
    days = list(student.attendance_days.all())
    if not days:
        return None
    total_sessions = len(days) * 2
    present_sessions = sum(
        (d.am_status == 'present') + (d.pm_status == 'present') for d in days
    )
    return round(present_sessions / total_sessions * 100, 1)


def behaviour_summary(student):
    """One-line derived summary of a student's behaviour incident log, for
    display where the old freeform Student.behaviour_summary field used to
    be read directly."""
    count = student.behaviour_incidents.count()
    if count == 0:
        return 'No incidents logged'
    return f'{count} incident{"s" if count != 1 else ""} logged'


def exclusion_count(student):
    return student.exclusions.count()
