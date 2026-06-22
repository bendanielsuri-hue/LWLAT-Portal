from .views import SCHOOLS, build_sections, build_search_items


def schools(request):
    return {'schools': SCHOOLS}


def search_items(request):
    return {'search_items': build_search_items(build_sections())}
