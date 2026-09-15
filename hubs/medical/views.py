from django.shortcuts import render

from core.hub_context import hub_context

MEDICAL_MENU = []


def _hub_context(request):
    return hub_context(request, MEDICAL_MENU, 'Medical')


def medical_hub(request):
    return render(request, 'hubs/medical/hub.html', _hub_context(request))
