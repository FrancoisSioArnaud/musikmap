from django.urls import path, re_path
from .views import index

urlpatterns = [
    path('', index, name=''),
    path('index', index),
    path('register', index),
    path('login', index),
    path('profile', index),
    path('profile/<str:username>', index),
    path('library', index),
    path('box/<str:boxName>', index),
    re_path(r'^flowbox/.*$', index),  # ✅ prend /flowbox/siohome/discover
]
