from django.urls import path
from .views import AuthURL, spotify_callback, IsAuthenticated, RefreshAccessToken, Search, Disconnect


urlpatterns = [
    path('auth-redirection', AuthURL.as_view()),
    path('disconnect', Disconnect.as_view()),
    path('redirect', spotify_callback),
    path('is-authenticated', IsAuthenticated.as_view()),
    path('refresh-access-token', RefreshAccessToken.as_view()),
    path('search', Search.as_view())
]
