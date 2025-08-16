from django.contrib import admin
from django.urls import path, include
from .views import *


urlpatterns = [
    path('add-note', AddDepositNote.as_view()),
    path('get-box', GetBox.as_view()),
    path('verify-location', Location.as_view()),
    path('replace-visible-deposits', ReplaceVisibleDeposits.as_view()),
    # path('update-visible-deposits', UpdateVisibleDeposits.as_view()),
    path('current-box-management', CurrentBoxManagement.as_view()),
    path('discovered-songs', ManageDiscoveredSongs.as_view()),
    path('create-deposit/', create_deposit_and_get_last, name='create_deposit_and_get_last'),
]
