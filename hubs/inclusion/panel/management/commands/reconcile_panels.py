"""Bring every time-based panel transition up to date.

The scheduled counterpart to the lazy call the panel views still make on read.
Nothing about a panel going 'delayed', a stale meeting being auto-ended or a
quiet discussion timer being stopped is user-triggered - they are all "what
should be true by now" - so they belong on a clock, not on whoever happens to
open a page.

Run it on a schedule (cron, Task Scheduler, a worker) in any environment that
has one:

    manage.py reconcile_panels

Once a deployment does that, the reconcile_panels() calls in views.py can go -
see ADR 0019 for why they are still there today.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from hubs.inclusion.panel import reconcile


class Command(BaseCommand):
    help = 'Apply time-based panel transitions (delayed, stale meetings, stale discussion timers).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--at',
            help=(
                'ISO-8601 instant to reconcile as of, instead of now. For '
                'replaying or checking what a sweep would do at a given time.'
            ),
        )

    def handle(self, *args, **options):
        now = timezone.now()
        if options['at']:
            parsed = timezone.datetime.fromisoformat(options['at'])
            now = timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        reconcile.reconcile_panels(now=now)
        self.stdout.write(self.style.SUCCESS(f'Reconciled panels as of {now.isoformat()}'))
