from django.urls import path

from .views import AuthURL, Disconnect, GetRecentlyPlayedTracks, IsAuthenticated, Search, deezer_callback

urlpatterns = [
    path("auth-redirection", AuthURL.as_view()),
    path("disconnect", Disconnect.as_view()),
    path("redirect", deezer_callback),
    path("is-authenticated", IsAuthenticated.as_view()),
    path("recent-tracks", GetRecentlyPlayedTracks.as_view()),
    path("search", Search.as_view()),
]
