from django.urls import path
from .views import (
    GetBox,
    GetMain,
    Location,
    ManageDiscoveredSongs,
    RevealSong,
    UserDepositsView,
    EmojiCatalogView,
    PurchaseEmojiView,
    ReactionView,
    ClientAdminArticleImportPageView,
    ClientAdminArticleListCreateView,
    ClientAdminArticleDetailView,
    PublicVisibleArticlesView,
    PublicVisibleArticleDetailView,
    ClientAdminIncitationListCreateView,
    ClientAdminIncitationDetailView,
    CommentCreateView,
    CommentDetailView,
    CommentReportView,
    ClientAdminCommentListView,
    ClientAdminCommentModerateView,
    ClientAdminCommentRestrictionListCreateView,
)

urlpatterns = [
    path("get-box/", GetBox.as_view(), name="get-box"),
    path("get-main/<slug:box_url>/", GetMain.as_view(), name="get-main"),
    path("verify-location", Location.as_view(), name="verify-location"),
    path("discovered-songs", ManageDiscoveredSongs.as_view(), name="discovered-songs"),
    path("revealSong", RevealSong.as_view(), name="reveal-song"),
    path("user-deposits", UserDepositsView.as_view(), name="user-deposits"),
    path("emojis/catalog", EmojiCatalogView.as_view(), name="emoji-catalog"),
    path("emojis/purchase", PurchaseEmojiView.as_view(), name="emoji-purchase"),
    path("reactions", ReactionView.as_view(), name="reactions"),
    path("comments/", CommentCreateView.as_view(), name="comments-create"),
    path("comments/<int:comment_id>/", CommentDetailView.as_view(), name="comments-detail"),
    path("comments/<int:comment_id>/report/", CommentReportView.as_view(), name="comments-report"),
    path("articles/visible/", PublicVisibleArticlesView.as_view(), name="public-visible-articles"),
    path(
        "articles/visible/<int:article_id>/",
        PublicVisibleArticleDetailView.as_view(),
        name="public-visible-article-detail",
    ),

    # Client admin - articles
    path(
        "client-admin/articles/import-page/",
        ClientAdminArticleImportPageView.as_view(),
        name="client-admin-articles-import-page",
    ),
    path(
        "client-admin/articles/",
        ClientAdminArticleListCreateView.as_view(),
        name="client-admin-articles-list-create",
    ),
    path(
        "client-admin/articles/<int:article_id>/",
        ClientAdminArticleDetailView.as_view(),
        name="client-admin-articles-detail",
    ),
    path(
        "client-admin/comments/",
        ClientAdminCommentListView.as_view(),
        name="client-admin-comments-list",
    ),
    path(
        "client-admin/comments/<int:comment_id>/moderate/",
        ClientAdminCommentModerateView.as_view(),
        name="client-admin-comments-moderate",
    ),
    path(
        "client-admin/comment-restrictions/",
        ClientAdminCommentRestrictionListCreateView.as_view(),
        name="client-admin-comment-restrictions",
    ),
    path(
        "client-admin/incitations/",
        ClientAdminIncitationListCreateView.as_view(),
        name="client-admin-incitations-list-create",
    ),
    path(
        "client-admin/incitations/<int:incitation_id>/",
        ClientAdminIncitationDetailView.as_view(),
        name="client-admin-incitations-detail",
    ),
]
