from django.contrib import admin
from django.urls import path, include
from .views import *


urlpatterns = [
    path('get-box', GetBox.as_view()),
    path('verify-location', Location.as_view()),
    path('current-box-management', CurrentBoxManagement.as_view()),
    path('discovered-songs', ManageDiscoveredSongs.as_view()),
]


