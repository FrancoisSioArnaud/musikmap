from django.urls import path
from . import views

urlpatterns = [
    path('login_user', views.LoginUser.as_view(), name="login"),
    path('logout_user', views.LogoutUser.as_view(), name="logout"),
    path('register_user', views.RegisterUser.as_view(), name="register"),
    path('check-authentication/', views.CheckAuthentication.as_view(), name='check-authentication'),
    path('change-password', views.ChangePasswordUser.as_view(), name="change-password"),
    path('change-profile-pic', views.ChangeProfilePicture.as_view(), name="change-profile-pic"),
    path('change-preferred-platform', views.ChangePreferredPlatform.as_view(), name="change-preferred-platform"),
    path('add-points', views.AddUserPoints.as_view(), name='add-points'),
    path('get-points', views.GetUserPoints.as_view(), name='get-points'),
    path('get-user-info', views.GetUserInfo.as_view(), name='get-user-info'),
    path('change-username', views.ChangeUsername.as_view(), name='change-username'),
]
