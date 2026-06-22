from django.shortcuts import render

CAREERS_MENU = []


def careers_hub(request):
    return render(request, 'hubs/careers/hub.html', {'local_menu': CAREERS_MENU, 'hub_title': 'Careers'})
