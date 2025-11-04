from django.urls import path, re_path
from .views import index

app_name = 'frontend'

urlpatterns = [
    path('', index, name=''),
    path('index', index, name=''),
    path('register', index),
    path('login', index),
    path('profile', index, name='profile'),
    path('profile/<str:username>', index),
    path('library', index),
    path('box/<str:boxName>', index),

    # ✅ Toutes les routes /flowbox/... (1 ou plusieurs segments)
    re_path(r'^flowbox/.*$', index),
]
