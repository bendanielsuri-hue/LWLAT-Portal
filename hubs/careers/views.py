from django.shortcuts import render

from core.hub_context import hub_context

CAREERS_MENU = []


def _hub_context(request):
    return hub_context(request, CAREERS_MENU, 'Careers')


def careers_hub(request):
    return render(request, 'hubs/careers/hub.html', _hub_context(request))
