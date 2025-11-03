from django.urls import path
from .views import (
    GetBox, GetMain, Location, CurrentBoxManagement, ManageDiscoveredSongs, RevealSong, UserDepositsView,
    EmojiCatalogView, PurchaseEmojiView, ReactionView
)

urlpatterns = [
    path('get-box/', GetBox.as_view(), name="get-box"),
    path("get-main/<slug:box_url>/", GetMain.as_view(), name="get-main"),
    path('verify-location', Location.as_view()),
    path('current-box-management', CurrentBoxManagement.as_view()),
    path('discovered-songs', ManageDiscoveredSongs.as_view()),
    path('revealSong', RevealSong.as_view(), name="reveal-song"),
    path('user-deposits', UserDepositsView.as_view(), name="user-deposits"),
    path('emojis/catalog', EmojiCatalogView.as_view(), name="emoji-catalog"),
    path('emojis/purchase', PurchaseEmojiView.as_view(), name="emoji-purchase"),
    path('reactions', ReactionView.as_view(), name="reactions"),
]







