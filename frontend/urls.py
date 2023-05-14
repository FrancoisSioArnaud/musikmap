from django.urls import path
from .views import index

# For the redirect function to worl :
# Django needs to know that this urls.py file belongs to the frontend app
app_name = 'frontend'

# Here, dispatch the URLs to the correct app
# The name is the text after the ":" in redirect(frontend:...)

urlpatterns = [
    path('', index, name=''),
    path('register', index)
]
