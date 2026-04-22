from django.urls import path

from .views import (
    AuthURL,
    ClearPendingAuth,
    Disconnect,
    IsAuthenticated,
    PendingAuthStatus,
    RefreshAccessToken,
    ResolvePendingAuth,
    Search,
    spotify_callback,
)

urlpatterns = [
    path("auth-redirection", AuthURL.as_view()),
    path("disconnect", Disconnect.as_view()),
    path("redirect", spotify_callback),
    path("is-authenticated", IsAuthenticated.as_view()),
    path("refresh-access-token", RefreshAccessToken.as_view()),
    path("search", Search.as_view()),
    path("clear-pending-auth", ClearPendingAuth.as_view()),
    path("pending-auth-status", PendingAuthStatus.as_view()),
    path("resolve-pending-auth", ResolvePendingAuth.as_view()),
]
