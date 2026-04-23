from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

from box_management.api.views.core import sticker_redirect_view, sticker_root_not_found_view

urlpatterns = [
    path("admin/", admin.site.urls),
    path("s", sticker_root_not_found_view),
    path("s/", sticker_root_not_found_view),
    path("s/<str:sticker_slug>", sticker_redirect_view),
    path("index", TemplateView.as_view(template_name="index.html")),
    path("", TemplateView.as_view(template_name="index.html")),
    path("auth", TemplateView.as_view(template_name="index.html")),
    path("auth/return", TemplateView.as_view(template_name="index.html")),
    path("profile", TemplateView.as_view(template_name="index.html")),
    path("profile/<str:username>", TemplateView.as_view(template_name="index.html")),
    path("messages", TemplateView.as_view(template_name="index.html")),
    path("library", TemplateView.as_view(template_name="index.html")),
    path("l/<str:link_slug>", TemplateView.as_view(template_name="index.html")),
    path("box/<str:boxName>", TemplateView.as_view(template_name="index.html")),
    re_path(r"^flowbox/.*$", TemplateView.as_view(template_name="index.html")),
    re_path(r"^client/.*$", TemplateView.as_view(template_name="index.html")),
    path("spotify/", include("spotify.urls")),
    path("box-management/", include("box_management.urls")),
    path("deezer/", include("deezer.urls")),
    path("users/", include("users.urls")),
    path("messages/", include("private_messages.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
