from django.urls import path
from .views import (
    BoxMeta, GetBox, Location, CurrentBoxManagement, ManageDiscoveredSongs, RevealSong, UserDepositsView,
    EmojiCatalogView, PurchaseEmojiView, ReactionView
)

urlpatterns = [
    path("meta", BoxMeta.as_view(), name="box-meta"),
    path('get-box', GetBox.as_view()),
    path('verify-location', Location.as_view()),
    path('current-box-management', CurrentBoxManagement.as_view()),
    path('discovered-songs', ManageDiscoveredSongs.as_view()),
    path('revealSong', RevealSong.as_view(), name="reveal-song"),
    path('user-deposits', UserDepositsView.as_view(), name="user-deposits"),
    path('emojis/catalog', EmojiCatalogView.as_view(), name="emoji-catalog"),
    path('emojis/purchase', PurchaseEmojiView.as_view(), name="emoji-purchase"),
    path('reactions', ReactionView.as_view(), name="reactions"),
]
